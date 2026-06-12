"""Source adapter contracts and registry for prospect discovery.

The worker can run in deterministic fixture mode without touching the network.
Adapters here describe capabilities, permissions, and health so callers can
enable sources through configuration and degrade cleanly when credentials are
missing or a source fails.
"""

from __future__ import annotations

import os
import hashlib
import json
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import unescape
from typing import Any, Protocol


CORE_SOURCES = {
    "github",
    "official_website",
    "news_rss",
    "huggingface",
    "hackernews",
    "reddit",
    "gitlab",
    "npm",
    "pypi",
    "docker_hub",
    "stack_exchange",
    "youtube",
    "arxiv",
    "job_listings",
    "accelerators",
    "open_collective",
}

RESTRICTED_SOURCES = {
    "discord",
    "slack",
    "linkedin",
    "facebook_page",
    "product_hunt",
}


@dataclass(frozen=True)
class SourceCapabilities:
    discovery: bool = True
    enrichment: bool = True
    contact_enrichment: bool = False
    requires_authorization: bool = False
    allowed_access: tuple[str, ...] = ("api", "feed", "public_webpage")
    permissions: tuple[str, ...] = ()
    required_credentials: tuple[str, ...] = ()
    rate_limit_per_minute: int = 30
    timeout_seconds: int = 20
    retry_count: int = 2
    user_agent_required: bool = True


@dataclass(frozen=True)
class SourceHealth:
    source_type: str
    status: str
    reason: str = ""
    checked_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(frozen=True)
class SourceAdapterError:
    source_type: str
    operation: str
    category: str
    message: str
    retryable: bool
    attempt: int
    occurred_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(frozen=True)
class DiscoveryQuery:
    text: str
    category: str | None = None
    limit: int = 10
    since: str | None = None


@dataclass(frozen=True)
class DiscoveryContext:
    deterministic: bool = False
    settings: dict[str, Any] = field(default_factory=dict)


FetchContext = DiscoveryContext
NormalizationContext = DiscoveryContext


@dataclass(frozen=True)
class SourceCandidate:
    source_type: str
    source_id: str
    url: str
    title: str = ""
    published_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RawSourceDocument:
    source_type: str
    source_id: str
    source_url: str
    retrieval_method: str
    retrieved_at: str
    content: str
    published_at: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SourceEvidence:
    evidence_id: str
    entity_id: str
    claim_type: str
    claim: str
    source_url: str
    source_type: str
    source_authority: float
    published_at: str | None
    retrieved_at: str
    directness: str
    freshness: float
    independence_group: str
    content_hash: str
    clean: bool = True


class ProspectSourceAdapter(Protocol):
    source_type: str
    capabilities: SourceCapabilities

    def discover(self, query: DiscoveryQuery, context: DiscoveryContext) -> list[SourceCandidate]:
        ...

    def fetch(self, candidate: SourceCandidate, context: FetchContext) -> list[RawSourceDocument]:
        ...

    def normalize(self, documents: list[RawSourceDocument], context: NormalizationContext) -> list[SourceEvidence]:
        ...

    def health_check(self) -> SourceHealth:
        ...


class DisabledAdapter:
    def __init__(self, source_type: str, capabilities: SourceCapabilities, reason: str) -> None:
        self.source_type = source_type
        self.capabilities = capabilities
        self.reason = reason

    def discover(self, query: DiscoveryQuery, context: DiscoveryContext) -> list[SourceCandidate]:
        return []

    def fetch(self, candidate: SourceCandidate, context: FetchContext) -> list[RawSourceDocument]:
        return []

    def normalize(self, documents: list[RawSourceDocument], context: NormalizationContext) -> list[SourceEvidence]:
        return []

    def health_check(self) -> SourceHealth:
        return SourceHealth(self.source_type, "disabled", self.reason)


class FixtureAdapter(DisabledAdapter):
    def __init__(self, source_type: str, capabilities: SourceCapabilities) -> None:
        super().__init__(source_type, capabilities, "fixture/no-live-client")

    def health_check(self) -> SourceHealth:
        return SourceHealth(self.source_type, "healthy", "fixture adapter")


WORKLOAD_RE = re.compile(
    r"\b(ai|agentic|ai agent|llm|rag|inference|training|fine[- ]?tun\w*|gpu|cuda|vllm|"
    r"model serving|batch|worker jobs?|background jobs?|long[- ]running|retries?|logs?|"
    r"artifacts?|orchestrat\w*|scheduler|mcp|model context protocol|multimodal|evals?)\b",
    re.I,
)
PAIN_RE = re.compile(
    r"\b(timeout|latency|scale|scaling|capacity|memory|cost|quota|queue|retry|retries|"
    r"failed|failure|deployment|startup|slow|reliable|durable|worker|background)\b",
    re.I,
)
CONTAMINATION_RE = re.compile(
    r"(@keyframes|data-astro|transform:|min-height:|\[(?:ci|npm)-image\]|"
    r"<(?:script|style|svg)\b|(?:display|position|padding|margin|font-size|background|border-radius)\s*:)",
    re.I,
)
GENERIC_PACKAGE_RE = re.compile(
    r"\b(queue data structure|microtask|polyfill|shim|ponyfill|collection|algorithm|utility|"
    r"wrapper|tiny queue|priority queue|data structures?)\b",
    re.I,
)
URL_RE = re.compile(r"https?://[^\s<>'\")\]]+", re.I)
REPOSITORY_URL_RE = re.compile(r"https?://(?:www\.)?(?:github|gitlab)\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", re.I)
UNOFFICIAL_HOSTS = {
    "news.ycombinator.com",
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "stackoverflow.com",
    "stackexchange.com",
    "arxiv.org",
    "huggingface.co",
    "www.npmjs.com",
    "pypi.org",
    "hub.docker.com",
    "opencollective.com",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _clip_words(value: str, limit: int = 32) -> str:
    return " ".join(value.replace("\n", " ").split()[:limit]).rstrip(" ,:;.-")


def _clean_text(value: str) -> str:
    text = unescape(value or "")
    text = re.sub(r"<(?:script|style|svg)\b.*?</(?:script|style|svg)>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\[[^\]]+]\([^)]*(?:shields\.io|badge|img\.shields)[^)]*\)", " ", text, flags=re.I)
    text = re.sub(r"^\s*\[[^\]]+]:\s*\S+\s*$", " ", text, flags=re.M)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _sentences(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", value) if part.strip()]


def _request_json(url: str, timeout: int, headers: dict[str, str] | None = None) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "jungle-outreach-agent/0.1",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def _request_text(url: str, timeout: int, headers: dict[str, str] | None = None) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/xml,text/xml,text/html,text/plain,application/json",
            "User-Agent": "jungle-outreach-agent/0.1",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(160_000).decode("utf-8", errors="replace")


def _safe_url(value: str) -> str:
    return value.strip().rstrip(".,;:)") if value else ""


def _first_url(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip().startswith(("http://", "https://")):
            return _safe_url(value)
    return ""


def _host(url: str) -> str:
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower().removeprefix("www.")
    except ValueError:
        return ""


def _extract_urls(value: str) -> list[str]:
    urls: list[str] = []
    for raw in URL_RE.findall(value or ""):
        cleaned = _safe_url(raw)
        if cleaned.startswith(("http://", "https://")):
            urls.append(cleaned)
    return list(dict.fromkeys(urls))


def _repository_url(urls: list[str]) -> str:
    for url in urls:
        match = REPOSITORY_URL_RE.search(url)
        if match:
            return _safe_url(match.group(0))
    return ""


def _official_url(urls: list[str]) -> str:
    for url in urls:
        host = _host(url)
        if not host or host in UNOFFICIAL_HOSTS:
            continue
        if host.endswith(("github.com", "gitlab.com", "npmjs.com", "pypi.org", "docker.com", "youtube.com", "arxiv.org")):
            continue
        return url
    return ""


def _merge_link_metadata(metadata: dict[str, Any], *texts: str) -> dict[str, Any]:
    urls = []
    for text in texts:
        urls.extend(_extract_urls(text))
    for key in ("repository_url", "homepage", "official_url", "project_url"):
        value = metadata.get(key)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            urls.append(value)
    unique_urls = list(dict.fromkeys([_safe_url(url) for url in urls if url]))
    repository_url = _repository_url(unique_urls)
    official_url = _official_url(unique_urls)
    merged = dict(metadata)
    if unique_urls:
        merged["resolved_urls"] = unique_urls[:12]
    if repository_url and not merged.get("repository_url"):
        merged["repository_url"] = repository_url
    if official_url and not merged.get("official_url"):
        merged["official_url"] = official_url
    return merged


def _independence_group(source_url: str, content: str, metadata: dict[str, Any]) -> str:
    syndicated_key = metadata.get("canonical_event_id") or metadata.get("syndication_key")
    if isinstance(syndicated_key, str) and syndicated_key:
        return _content_hash(syndicated_key.lower())
    normalized_content = re.sub(r"\s+", " ", _clean_text(content).lower())[:600]
    if normalized_content:
        return _content_hash(normalized_content)
    return _content_hash(source_url.split("#", 1)[0].lower())


class PublicApiAdapter:
    """Best-effort public-source adapter with deterministic fixture support."""

    def __init__(self, source_type: str, capabilities: SourceCapabilities, config: dict[str, Any] | None = None) -> None:
        self.source_type = source_type
        self.capabilities = capabilities
        self.config = config or {}
        self.last_errors: list[SourceAdapterError] = []
        self._reported_error_count = 0
        self._cache: dict[str, tuple[float, list[SourceCandidate]]] = {}
        self._last_request_at = 0.0

    def health_check(self) -> SourceHealth:
        if self.last_errors:
            latest = self.last_errors[-1]
            return SourceHealth(
                self.source_type,
                "degraded",
                f"{latest.operation}:{latest.category}",
            )
        return SourceHealth(self.source_type, "healthy", "configured public adapter")

    def drain_errors(self) -> list[SourceAdapterError]:
        errors = self.last_errors[self._reported_error_count :]
        self._reported_error_count = len(self.last_errors)
        return errors

    def _redact(self, value: str) -> str:
        redacted = re.sub(
            r"(?i)(api[_-]?key|token|authorization|client_secret)=([^&\s]+)",
            r"\1=[REDACTED]",
            value,
        )
        for name in self.capabilities.required_credentials:
            secret = os.getenv(name, "")
            if secret:
                redacted = redacted.replace(secret, "[REDACTED]")
        return redacted[:500]

    def _record_error(
        self,
        operation: str,
        error: Exception,
        retryable: bool,
        attempt: int,
    ) -> None:
        self.last_errors.append(
            SourceAdapterError(
                source_type=self.source_type,
                operation=operation,
                category=type(error).__name__,
                message=self._redact(str(error) or type(error).__name__),
                retryable=retryable,
                attempt=attempt,
            )
        )

    def _throttle(self) -> None:
        rate = max(1, self.capabilities.rate_limit_per_minute)
        minimum_interval = 60.0 / rate
        elapsed = time.monotonic() - self._last_request_at
        if self._last_request_at and elapsed < minimum_interval:
            time.sleep(minimum_interval - elapsed)
        self._last_request_at = time.monotonic()

    def _execute(self, operation: str, callback: Any) -> Any:
        attempts = max(1, self.capabilities.retry_count + 1)
        for attempt in range(1, attempts + 1):
            try:
                self._throttle()
                return callback()
            except (
                urllib.error.URLError,
                TimeoutError,
                socket.timeout,
            ) as error:
                self._record_error(operation, error, True, attempt)
                if attempt == attempts:
                    return None
                time.sleep(min(2 ** (attempt - 1), 4))
            except (ValueError, json.JSONDecodeError, ET.ParseError) as error:
                self._record_error(operation, error, False, attempt)
                return None
        return None

    def candidate(
        self,
        *,
        source_type: str,
        source_id: str,
        url: str,
        title: str = "",
        published_at: str | None = None,
        metadata: dict[str, Any] | None = None,
        link_text: str = "",
    ) -> SourceCandidate:
        metadata = metadata or {}
        merged = _merge_link_metadata(metadata, title, url, link_text, str(metadata.get("content") or ""))
        return SourceCandidate(
            source_type=source_type,
            source_id=source_id,
            url=url,
            title=title,
            published_at=published_at,
            metadata=merged,
        )

    def discover(self, query: DiscoveryQuery, context: DiscoveryContext) -> list[SourceCandidate]:
        if context.deterministic:
            return [self.enrich_candidate(candidate) for candidate in self._fixture_candidates(query)]
        cache_key = json.dumps(
            [query.text, query.category, query.limit, query.since],
            separators=(",", ":"),
        )
        cached = self._cache.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        def discover_candidates() -> list[SourceCandidate]:
            method = getattr(self, f"_discover_{self.source_type}", None)
            if method is None:
                return self._discover_configured_urls(query)
            return method(query)[: query.limit]

        candidates = self._execute("discover", discover_candidates) or []
        enriched = [self.enrich_candidate(candidate) for candidate in candidates]
        ttl = max(0, int(self.config.get("cache_ttl_seconds", 900)))
        if ttl:
            self._cache[cache_key] = (time.monotonic() + ttl, enriched)
        return enriched

    def enrich_candidate(self, candidate: SourceCandidate) -> SourceCandidate:
        metadata = _merge_link_metadata(
            candidate.metadata,
            candidate.title,
            candidate.url,
            str(candidate.metadata.get("content") or ""),
            str(candidate.metadata.get("description") or ""),
        )
        return SourceCandidate(
            source_type=candidate.source_type,
            source_id=candidate.source_id,
            url=candidate.url,
            title=candidate.title,
            published_at=candidate.published_at,
            metadata=metadata,
        )

    def fetch(self, candidate: SourceCandidate, context: FetchContext) -> list[RawSourceDocument]:
        if context.deterministic:
            metadata = _merge_link_metadata(candidate.metadata, str(candidate.metadata.get("description") or ""), candidate.title)
            return [
                RawSourceDocument(
                    source_type=candidate.source_type,
                    source_id=candidate.source_id,
                    source_url=candidate.url,
                    retrieval_method="fixture",
                    retrieved_at=_utc_now(),
                    content=str(metadata.get("description") or candidate.title),
                    published_at=candidate.published_at,
                    metadata=metadata,
                )
            ]
        if candidate.metadata.get("content"):
            metadata = _merge_link_metadata(candidate.metadata, str(candidate.metadata.get("content") or ""), candidate.title)
            return [
                RawSourceDocument(
                    source_type=candidate.source_type,
                    source_id=candidate.source_id,
                    source_url=candidate.url,
                    retrieval_method=str(metadata.get("retrieval_method") or "api"),
                    retrieved_at=_utc_now(),
                    content=str(metadata["content"]),
                    published_at=candidate.published_at,
                    metadata=metadata,
                )
            ]
        content = self._execute(
            "fetch",
            lambda: _request_text(candidate.url, self.capabilities.timeout_seconds),
        )
        if content is None:
            return []
        return [
            RawSourceDocument(
                source_type=candidate.source_type,
                source_id=candidate.source_id,
                source_url=candidate.url,
                retrieval_method=str(candidate.metadata.get("retrieval_method") or "public_webpage"),
                retrieved_at=_utc_now(),
                content=content,
                published_at=candidate.published_at,
                metadata=candidate.metadata,
            )
        ]

    def normalize(self, documents: list[RawSourceDocument], context: NormalizationContext) -> list[SourceEvidence]:
        evidence: list[SourceEvidence] = []
        for document in documents:
            metadata = _merge_link_metadata(document.metadata, document.content)
            clean = _clean_text(document.content)
            if not clean or CONTAMINATION_RE.search(document.content):
                continue
            for sentence in _sentences(clean):
                if not WORKLOAD_RE.search(sentence):
                    continue
                if GENERIC_PACKAGE_RE.search(sentence) and not re.search(r"\b(ai|llm|inference|gpu|model|mcp)\b", sentence, re.I):
                    continue
                claim_type = "infrastructure_pain" if PAIN_RE.search(sentence) else "ai_workload"
                if document.source_type in {"news_rss", "hackernews", "job_listings", "accelerators", "open_collective"}:
                    claim_type = "why_now" if claim_type == "ai_workload" else claim_type
                entity_id = str(metadata.get("entity_id") or f"source:{document.source_type}:{document.source_id}")
                claim = _clip_words(sentence, 32)
                content_hash = _content_hash(f"{entity_id}|{claim_type}|{claim}|{document.source_url}")
                evidence.append(
                    SourceEvidence(
                        evidence_id=f"ev_{content_hash}",
                        entity_id=entity_id,
                        claim_type=claim_type,
                        claim=claim,
                        source_url=document.source_url,
                        source_type=document.source_type,
                        source_authority=float(metadata.get("source_authority") or 0.55),
                        published_at=document.published_at,
                        retrieved_at=document.retrieved_at,
                        directness=str(metadata.get("directness") or "strong_inference"),
                        freshness=1.0,
                        independence_group=_independence_group(document.source_url, document.content, metadata),
                        content_hash=content_hash,
                        clean=True,
                    )
                )
                if len(evidence) >= 3:
                    return evidence
        return evidence

    def _fixture_candidates(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        text = query.text or "AI workload"
        slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "ai-workload"
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"{self.source_type}:{slug}",
                url=f"https://example.com/{self.source_type}/{slug}",
                title=f"{text} fixture",
                published_at=query.since,
                metadata={
                    "description": f"{text} uses batch inference workers with retries, logs, and output artifacts.",
                    "retrieval_method": "fixture",
                    "source_authority": 0.55,
                },
            )
        ][: query.limit]

    def _discover_configured_urls(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        candidates: list[SourceCandidate] = []
        for index, url in enumerate(self.config.get("urls", []) or self.config.get("feed_urls", []) or []):
            if not isinstance(url, str) or not url.startswith(("http://", "https://")):
                continue
            candidates.append(
                SourceCandidate(
                    source_type=self.source_type,
                    source_id=f"{self.source_type}:configured:{index}",
                    url=url,
                    title=query.text,
                    metadata={"retrieval_method": "public_webpage", "source_authority": 0.55},
                )
            )
        return candidates[: query.limit]

    def _discover_hackernews(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode({"query": f"Show HN {query.text}", "tags": "story", "hitsPerPage": query.limit})
        payload = _request_json(f"https://hn.algolia.com/api/v1/search_by_date?{params}", self.capabilities.timeout_seconds)
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"hn:{item.get('objectID')}",
                url=_first_url(item.get("url")) or f"https://news.ycombinator.com/item?id={item.get('objectID')}",
                title=str(item.get("title") or item.get("story_title") or ""),
                published_at=str(item.get("created_at") or "") or None,
                metadata={
                    "content": " ".join(str(item.get(key) or "") for key in ("title", "story_text", "comment_text")),
                    "discussion_url": f"https://news.ycombinator.com/item?id={item.get('objectID')}",
                    "retrieval_method": "api",
                    "source_authority": 0.6,
                },
            )
            for item in payload.get("hits", [])
            if item.get("objectID")
        ]

    def _discover_huggingface(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        candidates: list[SourceCandidate] = []
        for kind, path in (("model", "models"), ("space", "spaces"), ("dataset", "datasets")):
            params = urllib.parse.urlencode({"search": query.text, "limit": max(1, query.limit // 2)})
            payload = _request_json(f"https://huggingface.co/api/{path}?{params}", self.capabilities.timeout_seconds)
            for item in payload if isinstance(payload, list) else []:
                identifier = str(item.get("modelId") or item.get("id") or item.get("author") or "")
                if not identifier:
                    continue
                candidates.append(
                    SourceCandidate(
                        source_type=self.source_type,
                        source_id=f"huggingface:{kind}:{identifier}",
                        url=f"https://huggingface.co/{identifier}",
                        title=identifier,
                        published_at=str(item.get("lastModified") or "") or None,
                        metadata={
                            "description": str(item.get("description") or " ".join(item.get("tags") or [])),
                            "content": json.dumps(item, ensure_ascii=True),
                            "retrieval_method": "api",
                            "entity_id": f"model:{identifier}",
                            "source_authority": 0.7,
                        },
                    )
                )
        return candidates[: query.limit]

    def _discover_gitlab(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode({"search": query.text, "simple": "true", "order_by": "last_activity_at", "per_page": query.limit})
        payload = _request_json(f"https://gitlab.com/api/v4/projects?{params}", self.capabilities.timeout_seconds)
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"gitlab:{item.get('id')}",
                url=str(item.get("web_url") or ""),
                title=str(item.get("path_with_namespace") or item.get("name") or ""),
                published_at=str(item.get("last_activity_at") or "") or None,
                metadata={
                    "description": str(item.get("description") or ""),
                    "content": " ".join(str(item.get(key) or "") for key in ("path_with_namespace", "description")),
                    "repository_url": str(item.get("web_url") or ""),
                    "retrieval_method": "api",
                    "source_authority": 0.95,
                },
            )
            for item in payload if item.get("web_url")
        ]

    def _discover_npm(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode({"text": query.text, "size": query.limit})
        payload = _request_json(f"https://registry.npmjs.org/-/v1/search?{params}", self.capabilities.timeout_seconds)
        candidates: list[SourceCandidate] = []
        for item in payload.get("objects", []):
            package = item.get("package") or {}
            links = package.get("links") or {}
            name = str(package.get("name") or "")
            if not name:
                continue
            candidates.append(
                SourceCandidate(
                    source_type=self.source_type,
                    source_id=f"npm:{name}",
                    url=f"https://www.npmjs.com/package/{urllib.parse.quote(name)}",
                    title=name,
                    published_at=str(package.get("date") or "") or None,
                    metadata={
                        "description": str(package.get("description") or ""),
                        "content": " ".join(str(package.get(key) or "") for key in ("name", "description", "keywords")),
                        "repository_url": _first_url(links.get("repository"), links.get("homepage")),
                        "homepage": _first_url(links.get("homepage")),
                        "retrieval_method": "api",
                        "entity_id": f"package:npm:{name}",
                        "source_authority": 0.65,
                    },
                )
            )
        return candidates

    def _discover_pypi(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        # PyPI does not expose a supported JSON search endpoint; use the public search page as a discovery signal.
        url = "https://pypi.org/search/?" + urllib.parse.urlencode({"q": query.text})
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"pypi:search:{_content_hash(query.text)}",
                url=url,
                title=f"PyPI search: {query.text}",
                metadata={"retrieval_method": "public_webpage", "source_authority": 0.45},
            )
        ]

    def _discover_docker_hub(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode({"query": query.text, "page_size": query.limit})
        payload = _request_json(f"https://hub.docker.com/v2/search/repositories/?{params}", self.capabilities.timeout_seconds)
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"docker_hub:{item.get('repo_name')}",
                url=f"https://hub.docker.com/r/{item.get('repo_name')}",
                title=str(item.get("repo_name") or ""),
                published_at=str(item.get("last_updated") or "") or None,
                metadata={
                    "description": str(item.get("short_description") or ""),
                    "content": " ".join(str(item.get(key) or "") for key in ("repo_name", "short_description")),
                    "retrieval_method": "api",
                    "entity_id": f"container:{item.get('repo_name')}",
                    "source_authority": 0.55,
                },
            )
            for item in payload.get("results", [])
            if item.get("repo_name")
        ]

    def _discover_stack_exchange(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode(
            {"order": "desc", "sort": "activity", "q": query.text, "site": "stackoverflow", "pagesize": query.limit}
        )
        payload = _request_json(f"https://api.stackexchange.com/2.3/search/advanced?{params}", self.capabilities.timeout_seconds)
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"stack_exchange:{item.get('question_id')}",
                url=str(item.get("link") or ""),
                title=str(item.get("title") or ""),
                published_at=datetime.fromtimestamp(int(item.get("creation_date") or 0), timezone.utc).isoformat()
                if item.get("creation_date")
                else None,
                metadata={
                    "content": " ".join([str(item.get("title") or ""), " ".join(item.get("tags") or [])]),
                    "retrieval_method": "api",
                    "source_authority": 0.45,
                    "do_not_target_author": True,
                },
            )
            for item in payload.get("items", [])
            if item.get("link")
        ]

    def _discover_youtube(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
        params = urllib.parse.urlencode(
            {"part": "snippet", "q": query.text, "type": "video", "maxResults": query.limit, "key": api_key}
        )
        payload = _request_json(f"https://www.googleapis.com/youtube/v3/search?{params}", self.capabilities.timeout_seconds)
        candidates: list[SourceCandidate] = []
        for item in payload.get("items", []):
            video_id = ((item.get("id") or {}).get("videoId")) if isinstance(item.get("id"), dict) else None
            snippet = item.get("snippet") or {}
            if not video_id:
                continue
            candidates.append(
                SourceCandidate(
                    source_type=self.source_type,
                    source_id=f"youtube:{video_id}",
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    title=str(snippet.get("title") or ""),
                    published_at=str(snippet.get("publishedAt") or "") or None,
                    metadata={
                        "content": " ".join(str(snippet.get(key) or "") for key in ("title", "description", "channelTitle")),
                        "channel_title": str(snippet.get("channelTitle") or ""),
                        "retrieval_method": "api",
                        "source_authority": 0.5,
                    },
                )
            )
        return candidates

    def _discover_arxiv(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode({"search_query": f"all:{query.text}", "start": 0, "max_results": query.limit})
        xml = _request_text(f"https://export.arxiv.org/api/query?{params}", self.capabilities.timeout_seconds)
        root = ET.fromstring(xml)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        candidates: list[SourceCandidate] = []
        for entry in root.findall("atom:entry", ns):
            identifier = (entry.findtext("atom:id", default="", namespaces=ns) or "").strip()
            title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
            summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
            published = (entry.findtext("atom:published", default="", namespaces=ns) or "").strip()
            if not identifier:
                continue
            candidates.append(
                SourceCandidate(
                    source_type=self.source_type,
                    source_id=f"arxiv:{identifier.rsplit('/', 1)[-1]}",
                    url=identifier,
                    title=title,
                    published_at=published or None,
                    metadata={
                        "content": f"{title}. {summary}",
                        "retrieval_method": "feed",
                        "source_authority": 0.6,
                        "academic_signal": True,
                    },
                )
            )
        return candidates

    def _discover_news_rss(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        candidates: list[SourceCandidate] = []
        for feed_url in self.config.get("feed_urls", []) or []:
            if not isinstance(feed_url, str) or not feed_url.startswith(("http://", "https://")):
                continue
            xml = _request_text(feed_url, self.capabilities.timeout_seconds)
            candidates.extend(self._parse_feed(xml, feed_url, query, "news_rss", 0.75))
        return candidates[: query.limit]

    def _discover_job_listings(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        candidates = self._discover_configured_urls(query)
        remotive_url = "https://remotive.com/api/remote-jobs?" + urllib.parse.urlencode({"search": query.text, "limit": query.limit})
        payload = _request_json(remotive_url, self.capabilities.timeout_seconds)
        for item in payload.get("jobs", [])[: query.limit]:
            candidates.append(
                SourceCandidate(
                    source_type=self.source_type,
                    source_id=f"job:{item.get('id')}",
                    url=str(item.get("url") or ""),
                    title=str(item.get("title") or ""),
                    published_at=str(item.get("publication_date") or "") or None,
                    metadata={
                        "content": " ".join(str(item.get(key) or "") for key in ("company_name", "title", "description")),
                        "company": str(item.get("company_name") or ""),
                        "retrieval_method": "api",
                        "source_authority": 0.65,
                    },
                )
            )
        return [candidate for candidate in candidates if candidate.url][: query.limit]

    def _discover_accelerators(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        return self._discover_configured_urls(query)

    def _discover_open_collective(self, query: DiscoveryQuery) -> list[SourceCandidate]:
        params = urllib.parse.urlencode({"q": query.text})
        return [
            SourceCandidate(
                source_type=self.source_type,
                source_id=f"open_collective:search:{_content_hash(query.text)}",
                url=f"https://opencollective.com/search?{params}",
                title=f"Open Collective search: {query.text}",
                metadata={"retrieval_method": "public_webpage", "source_authority": 0.55},
            )
        ]

    def _parse_feed(
        self, xml: str, feed_url: str, query: DiscoveryQuery, source_type: str, authority: float
    ) -> list[SourceCandidate]:
        root = ET.fromstring(xml)
        candidates: list[SourceCandidate] = []
        if root.tag.endswith("rss"):
            items = root.findall(".//item")
            for index, item in enumerate(items):
                title = (item.findtext("title") or "").strip()
                description = (item.findtext("description") or "").strip()
                link = (item.findtext("link") or feed_url).strip()
                published = (item.findtext("pubDate") or "").strip() or None
                if query.text.lower() not in f"{title} {description}".lower() and not WORKLOAD_RE.search(f"{title} {description}"):
                    continue
                candidates.append(
                    SourceCandidate(
                        source_type=source_type,
                        source_id=f"{source_type}:feed:{_content_hash(link or str(index))}",
                        url=link,
                        title=title,
                        published_at=published,
                        metadata={
                            "content": f"{title}. {description}",
                            "feed_url": feed_url,
                            "retrieval_method": "feed",
                            "source_authority": authority,
                        },
                    )
                )
        else:
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for index, entry in enumerate(root.findall(".//atom:entry", ns)):
                title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
                summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
                link_el = entry.find("atom:link", ns)
                link = link_el.attrib.get("href", feed_url) if link_el is not None else feed_url
                published = (entry.findtext("atom:published", default="", namespaces=ns) or "").strip() or None
                if query.text.lower() not in f"{title} {summary}".lower() and not WORKLOAD_RE.search(f"{title} {summary}"):
                    continue
                candidates.append(
                    SourceCandidate(
                        source_type=source_type,
                        source_id=f"{source_type}:feed:{_content_hash(link or str(index))}",
                        url=link,
                        title=title,
                        published_at=published,
                        metadata={
                            "content": f"{title}. {summary}",
                            "feed_url": feed_url,
                            "retrieval_method": "feed",
                            "source_authority": authority,
                        },
                    )
                )
        return candidates


class SourceAdapterRegistry:
    def __init__(self, adapters: dict[str, ProspectSourceAdapter] | None = None) -> None:
        self._adapters: dict[str, ProspectSourceAdapter] = adapters or {}

    def register(self, adapter: ProspectSourceAdapter) -> None:
        if adapter.source_type in self._adapters:
            raise ValueError(f"duplicate source adapter: {adapter.source_type}")
        self._adapters[adapter.source_type] = adapter

    def enabled(self) -> list[ProspectSourceAdapter]:
        return list(self._adapters.values())

    def health(self) -> list[SourceHealth]:
        statuses: list[SourceHealth] = []
        for adapter in self.enabled():
            try:
                statuses.append(adapter.health_check())
            except Exception as error:
                statuses.append(SourceHealth(adapter.source_type, "degraded", str(error)))
        return statuses

    def get(self, source_type: str) -> ProspectSourceAdapter | None:
        return self._adapters.get(source_type)


def _env_present(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


def default_capabilities(
    source_type: str,
    config: dict[str, Any] | None = None,
) -> SourceCapabilities:
    config = config or {}
    restricted = source_type in RESTRICTED_SOURCES
    credential_map = {
        "github": ("GITHUB_TOKEN",),
        "reddit": ("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"),
        "youtube": ("YOUTUBE_API_KEY",),
        "discord": ("DISCORD_BOT_TOKEN",),
        "slack": ("SLACK_BOT_TOKEN",),
        "linkedin": ("LINKEDIN_ENRICHMENT_API_KEY",),
        "facebook_page": ("META_ACCESS_TOKEN",),
        "product_hunt": ("PRODUCT_HUNT_TOKEN",),
    }
    access_map = {
        "news_rss": ("feed", "api", "public_webpage"),
        "hackernews": ("api",),
        "arxiv": ("api", "feed"),
        "npm": ("api",),
        "pypi": ("api",),
        "docker_hub": ("api",),
        "gitlab": ("api",),
        "official_website": ("public_webpage",),
        "job_listings": ("api", "feed", "public_webpage"),
        "accelerators": ("api", "feed", "public_webpage"),
        "open_collective": ("api",),
    }
    permissions = {
        "discord": ("authorized_bot_installed", "visible_channels_only", "no_dms"),
        "slack": ("authorized_app_installed", "visible_channels_only", "no_dms"),
        "linkedin": ("approved_api_or_user_supplied_data", "no_bulk_profile_scraping"),
        "facebook_page": ("approved_meta_api_or_user_supplied_urls", "public_pages_only"),
        "product_hunt": ("approved_api_and_commercial_permission",),
    }.get(source_type, ())
    return SourceCapabilities(
        requires_authorization=restricted,
        allowed_access=access_map.get(source_type, ("api", "feed", "public_webpage")),
        permissions=permissions,
        required_credentials=credential_map.get(source_type, ()),
        contact_enrichment=source_type in {"official_website", "github", "gitlab", "linkedin", "facebook_page"},
        rate_limit_per_minute=max(1, int(config.get("rate_limit_per_minute", 30))),
        timeout_seconds=max(1, int(config.get("timeout_seconds", 20))),
        retry_count=max(0, int(config.get("retry_count", 2))),
    )


def build_default_registry(config: dict[str, Any] | None = None) -> SourceAdapterRegistry:
    config = config or {}
    sources_config: dict[str, Any] = {}
    for key in ("sources", "restricted_sources", "adapters"):
        value = config.get(key)
        if isinstance(value, dict):
            sources_config.update(value)
    registry = SourceAdapterRegistry()
    for source_type in sorted(CORE_SOURCES | RESTRICTED_SOURCES):
        source_cfg = sources_config.get(source_type, {}) if isinstance(sources_config.get(source_type, {}), dict) else {}
        enabled = bool(source_cfg.get("enabled", source_type in CORE_SOURCES))
        capabilities = default_capabilities(source_type, source_cfg)
        missing_credentials = [name for name in capabilities.required_credentials if not _env_present(name)]
        if not enabled:
            registry.register(DisabledAdapter(source_type, capabilities, "disabled_by_config"))
        elif capabilities.requires_authorization and missing_credentials:
            registry.register(
                DisabledAdapter(source_type, capabilities, f"missing_credentials:{','.join(missing_credentials)}")
            )
        elif source_type in {"reddit", "youtube", "product_hunt"} and missing_credentials:
            registry.register(
                DisabledAdapter(source_type, capabilities, f"missing_credentials:{','.join(missing_credentials)}")
            )
        else:
            registry.register(PublicApiAdapter(source_type, capabilities, source_cfg))
    return registry
