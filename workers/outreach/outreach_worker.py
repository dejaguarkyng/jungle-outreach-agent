#!/usr/bin/env python3
"""Jungle Grid outreach research and draft artifact worker."""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any

SITE = "https://junglegrid.dev"
ALLOWED_LINKS = [SITE]
MIN_WORDS = 70
MAX_WORDS = 140
MAX_SUBJECT = 79
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")
HREF_RE = re.compile(r'href=["\']([^"\'#]+)["\']', re.I)
CONTACT_CONTEXT_RE = re.compile(
    r"\b(contact|business|partnerships?|inquiries|reach(?:\s+us)?|email|support|hello)\b",
    re.I,
)
LIKELY_DOCS_PATH_RE = re.compile(
    r"(?:^|/)(docs?|guide|developers?|api|reference|manual)(?:/|$)",
    re.I,
)
LIKELY_CONTACT_PATH_RE = re.compile(
    r"(?:^|/)(contact|about|team|company|support|docs|legal|privacy|impressum)(?:/|$)",
    re.I,
)
TARGET_TERMS = re.compile(
    r"\b(agent|agentic|mcp|workflow|inference|training|fine[- ]?tun|gpu|batch|"
    r"runtime|compute|orchestrat|model serving|tool calling)\b",
    re.I,
)
CONCRETE_WORKLOAD_RE = re.compile(
    r"\b(mcp|model context protocol|agent(?:ic)?|llm|rag|evals?|evaluation|inference|fine[- ]?tun\w*|"
    r"gpu|batch|queue|worker|background jobs?|long[- ]running|deployment|latency|cost|scal\w*|"
    r"serverless gpu|model serving|vllm|ollama|qwen|runpod|modal|replicate|artifacts?|retries?|"
    r"tool calling|orchestrat\w*|scheduler|scrap\w*|enrichment)\b",
    re.I,
)
VAGUE_RELEVANCE_RE = re.compile(r"\b(agent|ai|workflow|automation)\b", re.I)
NON_AI_AGENT_RE = re.compile(
    r"\b(global-agent|user-agent|http agent|https agent|proxy agent|ssh agent|browser agent|agent forwarding)\b",
    re.I,
)
GENERIC_EMAIL_LOCAL_PARTS = {
    "opensource",
    "security",
    "support",
    "noreply",
    "no-reply",
    "privacy",
    "legal",
    "info",
    "contact",
    "admin",
}
GENERIC_TEAM_EMAIL_LOCAL_PARTS = {"team", "hello", "hi", "founders", "office"}
LARGE_VENDOR_ORGS = {
    "microsoft",
    "aws",
    "amazon",
    "google",
    "meta",
    "nvidia",
    "huggingface",
    "langchain-ai",
    "openai",
    "vercel",
    "cloudflare",
}
LARGE_FOUNDATION_ORGS = {
    "apache",
    "mozilla",
    "linuxfoundation",
    "kubernetes",
    "pytorch",
}
REPO_TYPE_EXCLUSION_RE = re.compile(
    r"\b(sdk|docs?-only|documentation|examples?|starter|template|boilerplate|showcase|landing page|"
    r"ui kit|component library|design system|static site|website|awesome list)\b",
    re.I,
)
PAIN_SIGNAL_RE = re.compile(
    r"\b(background jobs?|workers?|queues?|gpu|latency|cost|scal\w*|deploy(?:ment|ing)?|hosting|"
    r"performance|retries?|batch|fine[- ]?tun\w*|evals?|artifacts?|long[- ]running|inference)\b",
    re.I,
)
JOBS = {
    "discover",
    "research",
    "score",
    "write-emails-template",
    "write-emails-qwen",
    "full-run-template",
    "full-run-qwen",
}

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOG = logging.getLogger("outreach-worker")
OLLAMA_PROCESS: subprocess.Popen[Any] | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def word_count(value: str) -> int:
    return len(value.strip().split())


def clip_words(value: str, limit: int) -> str:
    return " ".join(value.replace("\n", " ").split()[:limit]).rstrip(" ,:;.-")


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def split_sentences(value: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+|\n+", value) if sentence.strip()]


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def days_since(value: str | None) -> int | None:
    parsed = parse_iso_datetime(value)
    if parsed is None:
        return None
    delta = datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)
    return max(0, int(delta.total_seconds() // 86400))


def bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def dedupe_store_path() -> Path:
    raw = os.getenv("OUTREACH_MEMORY_PATH", "data/outreach/prospect_memory.json")
    return Path(raw)


def clean_research_text(value: str) -> str:
    text = unescape(value or "")
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[[^\]]*]\([^)]*\)", " ", text)
    text = re.sub(r"\[[^\]]+]\([^)]*(?:shields\.io|badge|img\.shields)[^)]*\)", " ", text, flags=re.I)
    text = re.sub(r"^\s*\[[^\]]+]:\s*\S+\s*$", " ", text, flags=re.M)
    text = re.sub(r"^\s*[-*]\s+\[[^]]+\]\([^)]*\)\s*$", " ", text, flags=re.M)
    text = re.sub(r"^\s*(table of contents|toc|navigation|contents)\s*$", " ", text, flags=re.I | re.M)
    text = re.sub(r"^\s*#{1,6}\s*(table of contents|toc|navigation|contents).*$", " ", text, flags=re.I | re.M)
    text = re.sub(r"\[(.*?)\]\([^)]*\)", r"\1", text)
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = re.sub(r"[`*_>#|]", " ", raw_line).strip()
        if not line:
            continue
        lowered = normalize_name(line)
        if not lowered:
            continue
        if lowered in {"table of contents", "toc", "contents", "navigation"}:
            continue
        if len(line) < 3:
            continue
        lines.append(line)
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def unique_preserve_order(values: list[str]) -> list[str]:
    return list(dict.fromkeys([value for value in values if value]))


def contact_quality(email: str, source_type: str, context: str) -> int:
    local = email.partition("@")[0].lower()
    score = {
        "official_website": 8,
        "github_profile": 9,
        "project_docs": 7,
        "package_page": 6,
        "repository_readme": 6,
    }.get(source_type, 5)
    if local in GENERIC_EMAIL_LOCAL_PARTS:
        score -= 5
    elif local in GENERIC_TEAM_EMAIL_LOCAL_PARTS:
        score -= 2
    if CONTACT_CONTEXT_RE.search(context):
        score += 1
    return max(0, min(10, score))


def is_generic_contact_email(email: str) -> bool:
    return email.partition("@")[0].lower() in GENERIC_EMAIL_LOCAL_PARTS


def is_team_email(email: str) -> bool:
    return email.partition("@")[0].lower() in GENERIC_TEAM_EMAIL_LOCAL_PARTS


def is_large_org(owner_login: str) -> bool:
    normalized = normalize_name(owner_login).replace(" ", "")
    return normalized in LARGE_VENDOR_ORGS or normalized in LARGE_FOUNDATION_ORGS


def owner_key(owner_login: str) -> str:
    return normalize_name(owner_login).replace(" ", "")


def disambiguates_ai_agent(text: str) -> bool:
    lowered = text.lower()
    if NON_AI_AGENT_RE.search(lowered):
        return False
    if "agent" not in lowered:
        return False
    return bool(
        re.search(
            r"\b(ai|llm|autonomous|mcp|tool calling|task execution|workflow agent|agent runtime|"
            r"multi-agent|crewai|langgraph|openai agents?|background worker|long-running jobs?)\b",
            lowered,
        )
    )


def extract_evidence_points(text: str) -> list[str]:
    evidence: list[str] = []
    for sentence in split_sentences(text):
        for chunk in re.split(r",|;|\band\b", sentence):
            lowered = chunk.lower().strip()
            if NON_AI_AGENT_RE.search(lowered):
                continue
            if not CONCRETE_WORKLOAD_RE.search(lowered):
                continue
            cleaned = clip_words(chunk.strip(), 18)
            if cleaned and cleaned not in evidence:
                evidence.append(cleaned)
            if len(evidence) == 3:
                return evidence
    return evidence


def extract_pain_signals(text: str) -> list[str]:
    signals: list[str] = []
    for sentence in split_sentences(text):
        if not PAIN_SIGNAL_RE.search(sentence):
            continue
        cleaned = clip_words(sentence, 24)
        if cleaned and cleaned not in signals:
            signals.append(cleaned)
    return signals[:3]


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 45,
) -> Any:
    body = json.dumps(payload).encode() if payload is not None else None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def source_email(text: str, source_url: str) -> str | None:
    for match in EMAIL_RE.finditer(text):
        email = match.group(0).lower().rstrip(".,;:")
        local, _, domain = email.partition("@")
        if not source_url or not domain:
            continue
        if local in {"example", "test"} or local in GENERIC_EMAIL_LOCAL_PARTS:
            continue
        if domain in {"example.com", "example.org", "users.noreply.github.com"}:
            continue
        context = text[max(0, match.start() - 100) : match.end() + 140]
        if CONTACT_CONTEXT_RE.search(context):
            return email
    return None


def profile_email_source(email: str | None, source_url: str) -> str | None:
    if not email:
        return None
    normalized = email.strip().lower().rstrip(".,;:")
    local, _, domain = normalized.partition("@")
    if not domain:
        return None
    if local in {"donotreply", "do-not-reply", "example", "test"} or local in GENERIC_EMAIL_LOCAL_PARTS:
        return None
    if domain in {"example.com", "example.org", "example.net", "users.noreply.github.com"}:
        return None
    if not EMAIL_RE.fullmatch(normalized):
        return None
    return normalized


def contact_source_score(source_type: str, email: str, context: str) -> int:
    return (contact_quality(email, source_type, context) * 10) + (8 if CONTACT_CONTEXT_RE.search(context) else 0)


def pick_best_contact(candidates: list[dict[str, str]]) -> dict[str, str] | None:
    if not candidates:
        return None
    unique: dict[tuple[str, str], dict[str, str]] = {}
    for candidate in candidates:
        key = (candidate["email"], candidate["source_url"])
        previous = unique.get(key)
        if not previous or contact_source_score(
            candidate["source_type"], candidate["email"], candidate.get("context", "")
        ) > contact_source_score(previous["source_type"], previous["email"], previous.get("context", "")):
            unique[key] = candidate
    return max(
        unique.values(),
        key=lambda candidate: contact_source_score(
            candidate["source_type"], candidate["email"], candidate.get("context", "")
        ),
    )


def category_for(text: str) -> str:
    lowered = text.lower()
    if "model context protocol" in lowered or re.search(r"\bmcp\b", lowered):
        return "mcp"
    if re.search(r"\b(vllm|ollama|runpod|modal|replicate|serverless gpu|gpu orchestration|model serving)\b", lowered):
        return "ai_infrastructure"
    if re.search(r"\b(fine[- ]?tun|training|inference|rag|evals?|evaluation)\b", lowered):
        return "inference_training"
    if disambiguates_ai_agent(lowered) and re.search(r"\b(runtime|worker|queue|background|compute|long[- ]running)\b", lowered):
        return "agent_compute"
    if re.search(r"\b(workflow|automation|scheduler)\b", lowered) and re.search(
        r"\b(llm|agent|mcp|inference|rag|evals?|worker|queue)\b", lowered
    ):
        return "workflow_automation"
    if disambiguates_ai_agent(lowered):
        return "agent_framework"
    if re.search(r"\b(llm|rag|evals?|prompt|model)\b", lowered):
        return "llm_application"
    return "open_source_ai"


def normalize_prospect(raw: dict[str, Any]) -> dict[str, Any] | None:
    source_url = str(raw.get("email_source_url", "")).strip()
    email = str(raw.get("email", "")).strip().lower()
    project = str(raw.get("project", "")).strip()
    project_url = str(raw.get("project_url", "")).strip()
    if not source_url or not email or not project or not project_url:
        return None
    if not EMAIL_RE.fullmatch(email):
        return None
    owner = str(raw.get("owner_login") or project.split("/", 1)[0]).strip()
    cleaned_research = clean_research_text(str(raw.get("research_text") or raw.get("project_description") or "").strip())
    return {
        "prospect_id": str(raw.get("prospect_id") or uuid.uuid4()),
        "name": str(raw.get("name") or project.split("/")[-1]).strip(),
        "email": email,
        "email_source_url": source_url,
        "email_source_type": str(raw.get("email_source_type") or "official_website"),
        "project": project,
        "project_key": normalize_name(project).replace(" ", "-"),
        "project_url": project_url,
        "project_description": str(raw.get("project_description") or "").strip(),
        "category": str(raw.get("category") or category_for(f"{project} {cleaned_research}")),
        "research_text": cleaned_research,
        "evidence_urls": unique_preserve_order(
            [
                source_url,
                project_url,
                *[str(url) for url in raw.get("evidence_urls", []) if url],
            ]
        ),
        "stars": int(raw.get("stars") or 0),
        "active": bool(raw.get("active", True)),
        "owner_login": owner,
        "owner_type": str(raw.get("owner_type") or ""),
        "updated_at": str(raw.get("updated_at") or raw.get("pushed_at") or ""),
        "pushed_at": str(raw.get("pushed_at") or raw.get("updated_at") or ""),
        "open_issues_count": int(raw.get("open_issues_count") or 0),
        "readme_present": bool(cleaned_research),
    }


def load_json_env_list(name: str) -> set[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return set()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        LOG.warning("Ignoring invalid JSON in %s.", name)
        return set()
    if not isinstance(parsed, list):
        LOG.warning("Ignoring non-list value in %s.", name)
        return set()
    return {str(value).strip().lower() for value in parsed if str(value).strip()}


def load_seed(input_path: Path | None) -> list[dict[str, Any]]:
    if not input_path or not input_path.exists():
        return []
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    rows = payload if isinstance(payload, list) else payload.get("prospects", [])
    return [prospect for row in rows if (prospect := normalize_prospect(row))]


def github_headers() -> dict[str, str]:
    headers = {
        "User-Agent": "jungle-outreach-agent/0.1",
        "Accept": "application/vnd.github+json",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_text(url: str, timeout: int = 20, limit: int = 120_000) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "jungle-outreach-agent/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(limit).decode("utf-8", errors="replace")


def is_docs_url(url: urllib.parse.ParseResult, base: urllib.parse.ParseResult) -> bool:
    hostname = (url.hostname or "").lower()
    base_hostname = (base.hostname or "").lower().removeprefix("www.")
    return bool(
        LIKELY_DOCS_PATH_RE.search(url.path or "/")
        or hostname.startswith("docs.")
        or hostname == f"docs.{base_hostname}"
        or hostname.endswith("readthedocs.io")
        or hostname.endswith("github.io")
        or hostname.endswith("mintlify.app")
    )


def extract_likely_site_links(html: str, base_urls: list[str]) -> list[str]:
    parsed_bases: list[urllib.parse.ParseResult] = []
    for base_url in base_urls:
        try:
            parsed_bases.append(urllib.parse.urlparse(base_url))
        except ValueError:
            continue
    if not parsed_bases:
        return []
    links: list[str] = []
    for match in HREF_RE.finditer(html):
        raw = (match.group(1) or "").strip()
        if not raw:
            continue
        try:
            absolute = urllib.parse.urljoin(base_urls[0], raw)
            parsed = urllib.parse.urlparse(absolute)
        except ValueError:
            continue
        if parsed.scheme not in {"http", "https"}:
            continue
        if not any(parsed.netloc == base.netloc or is_docs_url(parsed, base) for base in parsed_bases):
            continue
        if not LIKELY_CONTACT_PATH_RE.search(parsed.path or "/") and not any(
            is_docs_url(parsed, base) for base in parsed_bases
        ):
            continue
        links.append(parsed.geturl())
    return list(dict.fromkeys(links))


def website_contacts(start_urls: list[str] | str, source_type: str = "official_website") -> tuple[list[dict[str, str]], str]:
    queue = [start_urls] if isinstance(start_urls, str) else [url for url in start_urls if url]
    queue = list(dict.fromkeys(queue))
    seed_urls = list(queue)
    parsed_bases: list[urllib.parse.ParseResult] = []
    for url in queue:
        try:
            parsed = urllib.parse.urlparse(url)
        except ValueError:
            continue
        if parsed.scheme in {"http", "https"}:
            parsed_bases.append(parsed)
    if not parsed_bases:
        return [], ""
    visited: set[str] = set()
    latest_text = ""
    contacts: list[dict[str, str]] = []
    while queue and len(visited) < 5:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        try:
            text = fetch_text(current)
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
        latest_text = text
        parsed_current = urllib.parse.urlparse(current)
        effective_source_type = (
            "project_docs" if any(is_docs_url(parsed_current, base) for base in parsed_bases) else source_type
        )
        for email in extract_public_emails(text, current):
            contacts.append(
                {
                    "email": email,
                    "source_url": current,
                    "source_type": effective_source_type,
                    "context": text[:5000],
                }
            )
        for link in extract_likely_site_links(text, seed_urls):
            if link not in visited and link not in queue:
                queue.append(link)
    return contacts, latest_text


def extract_public_emails(text: str, source_url: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for match in EMAIL_RE.finditer(text):
        email = match.group(0).lower().rstrip(".,;:")
        if email in seen:
            continue
        local, _, domain = email.partition("@")
        if not source_url or not domain:
            continue
        if local in {"example", "test"} or local in GENERIC_EMAIL_LOCAL_PARTS:
            continue
        if domain in {"example.com", "example.org", "users.noreply.github.com"}:
            continue
        context = text[max(0, match.start() - 100) : match.end() + 140]
        if CONTACT_CONTEXT_RE.search(context):
            seen.add(email)
            found.append(email)
    return found


def fetch_registry_json(url: str) -> Any:
    try:
        return request_json(url, headers={"User-Agent": "jungle-outreach-agent/0.1"}, timeout=20)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def get_raw_repo_file(owner: str, repo: str, branch: str, path: str) -> str | None:
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    try:
        return fetch_text(url)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


def package_registry_metadata(owner: str, repo: str, branch: str) -> dict[str, list[str]]:
    project_urls: set[str] = set()
    package_pages: set[str] = set()
    package_json = get_raw_repo_file(owner, repo, branch, "package.json")
    if package_json:
        try:
            parsed = json.loads(package_json)
            name = str(parsed.get("name") or "").strip()
            if name:
                package_pages.add(f"https://www.npmjs.com/package/{urllib.parse.quote(name)}")
                npm = fetch_registry_json(f"https://registry.npmjs.org/{urllib.parse.quote(name)}") or {}
                latest_tag = ((npm.get("dist-tags") or {}).get("latest")) if isinstance(npm, dict) else None
                latest = (((npm.get("versions") or {}).get(latest_tag)) if latest_tag else None) if isinstance(npm, dict) else None
                if isinstance(latest, dict):
                    for value in [latest.get("homepage"), (latest.get("bugs") or {}).get("url")]:
                        if isinstance(value, str) and value.strip():
                            project_urls.add(value.strip())
                homepage = parsed.get("homepage")
                if isinstance(homepage, str) and homepage.strip():
                    project_urls.add(homepage.strip())
        except (ValueError, TypeError, AttributeError):
            pass

    pyproject = get_raw_repo_file(owner, repo, branch, "pyproject.toml")
    if pyproject:
        match = re.search(r'^\s*name\s*=\s*["\']([^"\']+)["\']', pyproject, re.M)
        if match:
            package_pages.add(f"https://pypi.org/project/{urllib.parse.quote(match.group(1))}/")
            pypi = fetch_registry_json(f"https://pypi.org/pypi/{urllib.parse.quote(match.group(1))}/json") or {}
            info = pypi.get("info") if isinstance(pypi, dict) else {}
            if isinstance(info, dict):
                for value in [info.get("home_page"), *(info.get("project_urls") or {}).values()]:
                    if isinstance(value, str) and value.strip():
                        project_urls.add(value.strip())

    cargo = get_raw_repo_file(owner, repo, branch, "Cargo.toml")
    if cargo:
        match = re.search(r'^\s*name\s*=\s*["\']([^"\']+)["\']', cargo, re.M)
        if match:
            package_pages.add(f"https://crates.io/crates/{urllib.parse.quote(match.group(1))}")
            crates = fetch_registry_json(f"https://crates.io/api/v1/crates/{urllib.parse.quote(match.group(1))}") or {}
            crate = crates.get("crate") if isinstance(crates, dict) else {}
            if isinstance(crate, dict):
                for value in [crate.get("homepage"), crate.get("documentation"), crate.get("repository")]:
                    if isinstance(value, str) and value.strip():
                        project_urls.add(value.strip())

    return {"project_urls": list(project_urls), "package_pages": list(package_pages)}


def package_registry_contacts(package_pages: list[str]) -> list[dict[str, str]]:
    contacts: list[dict[str, str]] = []
    for url in package_pages:
        try:
            text = fetch_text(url)
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
        for email in extract_public_emails(text, url):
            contacts.append(
                {
                    "email": email,
                    "source_url": url,
                    "source_type": "package_page",
                    "context": text[:5000],
                }
            )
    return contacts


QUERY_FAMILIES: dict[str, dict[str, Any]] = {
    "mcp_servers": {
        "categories": {"mcp", "agent_framework", "agent_compute"},
        "github": [
            '"MCP server" agent workflow stars:>4',
            '"model context protocol" tools stars:>4',
            '"OpenAI agents" worker stars:>4',
        ],
        "registry": ["mcp server", "model context protocol tools", "openai agents worker"],
    },
    "agent_jobs": {
        "categories": {"agent_compute", "agent_framework", "workflow_automation"},
        "github": [
            '"AI agent" "background jobs" stars:>4',
            '"agent runtime" queue stars:>4',
            "CrewAI production stars:>4",
            "LangGraph queue stars:>4",
        ],
        "registry": ["ai agent background jobs", "agent runtime queue", "crewai production", "langgraph queue"],
    },
    "eval_and_rag": {
        "categories": {"inference_training", "workflow_automation", "llm_application"},
        "github": [
            '"LLM eval" batch stars:>4',
            '"RAG pipeline" worker stars:>4',
            '"workflow automation" llm workers stars:>4',
        ],
        "registry": ["llm eval batch", "rag pipeline worker", "workflow automation llm workers"],
    },
    "model_ops": {
        "categories": {"inference_training", "ai_infrastructure"},
        "github": [
            '"fine-tuning" GPU stars:>4',
            '"inference server" deployment stars:>4',
            '"vLLM" deployment stars:>4',
            '"Qwen" inference stars:>4',
            '"Ollama" server stars:>4',
        ],
        "registry": ["fine tuning gpu", "inference server deployment", "vllm deployment", "qwen inference", "ollama server"],
    },
    "gpu_platform_alt": {
        "categories": {"ai_infrastructure", "workflow_automation"},
        "github": [
            '"RunPod" GPU stars:>4',
            '"Modal" batch stars:>4',
            '"Replicate alternative" stars:>4',
            '"serverless GPU" stars:>4',
            '"AI workflow scheduler" stars:>4',
        ],
        "registry": ["runpod gpu", "modal batch", "replicate alternative", "serverless gpu", "ai workflow scheduler"],
    },
    "tooling": {
        "categories": {"workflow_automation", "llm_application", "agent_framework"},
        "github": [
            '"Dify" "custom tool" stars:>4',
            '"Flowise" deployment stars:>4',
            '"agent runtime" stars:>4',
        ],
        "registry": ["dify custom tool", "flowise deployment", "agent runtime"],
    },
}


def query_seed() -> int:
    raw = os.getenv("OUTREACH_QUERY_SEED", "").strip()
    if raw:
        try:
            return int(raw)
        except ValueError:
            return sum(ord(char) for char in raw)
    return int(datetime.now(timezone.utc).strftime("%Y%m%d"))


def query_pack_order(category: str | None) -> list[dict[str, Any]]:
    packs = [
        pack
        for pack in QUERY_FAMILIES.values()
        if category is None or not pack.get("categories") or category in pack["categories"]
    ]
    random.Random(query_seed()).shuffle(packs)
    return packs


def parse_github_repo(value: str | None) -> tuple[str, str] | None:
    if not value:
        return None
    normalized = value.strip().removeprefix("git+")
    normalized = re.sub(r"\.git$", "", normalized, flags=re.I)
    match = re.search(r"github\.com/([^/]+)/([^/#?]+)", normalized, re.I)
    if not match:
        return None
    return match.group(1), match.group(2)


def account_search_query(query: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\bstars:\>[0-9]+\b| in:[^ ]+", "", query)).strip()


def search_registry_projects(term: str) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    npm = fetch_registry_json(f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(term)}&size=8") or {}
    for item in npm.get("objects", []) if isinstance(npm, dict) else []:
        links = ((item.get("package") or {}).get("links") or {}) if isinstance(item, dict) else {}
        if isinstance(links, dict):
            for value in links.values():
                repo = parse_github_repo(value if isinstance(value, str) else None)
                if repo:
                    candidates.append(repo)
    crates = fetch_registry_json(f"https://crates.io/api/v1/crates?page=1&per_page=8&q={urllib.parse.quote(term)}") or {}
    for item in crates.get("crates", []) if isinstance(crates, dict) else []:
        if not isinstance(item, dict):
            continue
        for value in [item.get("repository"), item.get("homepage"), item.get("documentation")]:
            repo = parse_github_repo(value if isinstance(value, str) else None)
            if repo:
                candidates.append(repo)
    return list(dict.fromkeys(candidates))


def github_profile(login: str) -> dict[str, Any] | None:
    try:
        return request_json(f"https://api.github.com/users/{urllib.parse.quote(login)}", headers=github_headers())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def github_readme(full_name: str, default_branch: str) -> str:
    readme_url = f"https://raw.githubusercontent.com/{full_name}/{default_branch}/README.md"
    try:
        return fetch_text(readme_url, limit=100_000)
    except (urllib.error.URLError, TimeoutError, ValueError):
        return ""


def repo_to_prospect(repo: dict[str, Any], category: str | None) -> dict[str, Any] | None:
    full_name = str(repo.get("full_name") or "").strip()
    owner_login = str((repo.get("owner") or {}).get("login") or "").strip()
    if not full_name or not owner_login:
        return None
    default_branch = str(repo.get("default_branch") or "main")
    profile = github_profile(owner_login) or {}
    readme = github_readme(full_name, default_branch)
    metadata = package_registry_metadata(owner_login, full_name.split("/", 1)[1], default_branch)

    contacts: list[dict[str, str]] = []
    profile_contact = profile_email_source(profile.get("email"), profile.get("html_url") or f"https://github.com/{owner_login}")
    if profile_contact:
        contacts.append(
            {
                "email": profile_contact,
                "source_url": profile.get("html_url") or f"https://github.com/{owner_login}",
                "source_type": "github_profile",
                "context": "Public email field on the professional GitHub profile.",
            }
        )
    if readme:
        for email in extract_public_emails(readme, f"https://github.com/{full_name}#readme"):
            contacts.append(
                {
                    "email": email,
                    "source_url": f"https://github.com/{full_name}#readme",
                    "source_type": "repository_readme",
                    "context": readme[:5000],
                }
            )
    website_seeds = [
        str(repo.get("homepage") or "").strip(),
        str(profile.get("blog") or "").strip(),
        *metadata["project_urls"],
    ]
    homepage_contacts, homepage_text = website_contacts(website_seeds)
    contacts.extend(homepage_contacts)
    contacts.extend(package_registry_contacts(metadata["package_pages"]))
    best_contact = pick_best_contact(contacts)
    if not best_contact:
        return None

    combined_text = clean_research_text(f"{repo.get('description', '')} {readme or homepage_text}")

    return normalize_prospect(
        {
            "name": profile.get("name") or owner_login,
            "email": best_contact["email"],
            "email_source_url": best_contact["source_url"],
            "email_source_type": best_contact["source_type"],
            "project": full_name,
            "project_url": repo.get("html_url") or f"https://github.com/{full_name}",
            "project_description": repo.get("description") or "",
            "category": category or category_for(combined_text[:4000]),
            "research_text": combined_text[:20_000],
            "evidence_urls": [
                best_contact["source_url"],
                repo.get("html_url") or f"https://github.com/{full_name}",
                f"https://github.com/{full_name}#readme",
                *metadata["project_urls"],
            ],
            "stars": repo.get("stargazers_count") or 0,
            "active": True,
            "owner_login": owner_login,
            "owner_type": str((repo.get("owner") or {}).get("type") or ""),
            "updated_at": str(repo.get("updated_at") or ""),
            "pushed_at": str(repo.get("pushed_at") or ""),
            "open_issues_count": int(repo.get("open_issues_count") or 0),
        }
    )


def discover_from_profiles(
    queries: list[str], category: str | None, target: int, seen_projects: set[str], seen_profiles: set[str]
) -> list[dict[str, Any]]:
    prospects: list[dict[str, Any]] = []
    for profile_type in ("user", "org"):
        for query in queries:
            if len(prospects) >= target:
                return prospects
            url = "https://api.github.com/search/users?" + urllib.parse.urlencode(
                {"q": f"{account_search_query(query)} in:login,fullname,bio type:{profile_type}", "per_page": 10, "page": 1}
            )
            try:
                result = request_json(url, headers=github_headers())
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                return prospects
            for user in result.get("items", []):
                login = str(user.get("login") or "").strip()
                if not login or login.lower() in seen_profiles:
                    continue
                seen_profiles.add(login.lower())
                repos_url = (
                    f"https://api.github.com/orgs/{urllib.parse.quote(login)}/repos"
                    if profile_type == "org"
                    else f"https://api.github.com/users/{urllib.parse.quote(login)}/repos"
                )
                try:
                    repos = request_json(
                        repos_url + "?" + urllib.parse.urlencode({"sort": "updated", "per_page": 10}),
                        headers=github_headers(),
                    )
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                    continue
                for repo in repos if isinstance(repos, list) else []:
                    full_name = str(repo.get("full_name") or "").strip().lower()
                    if not full_name or repo.get("fork") or repo.get("archived") or full_name in seen_projects:
                        continue
                    seen_projects.add(full_name)
                    prospect = repo_to_prospect(repo, category)
                    if prospect:
                        prospects.append(prospect)
                        break
    return prospects


def load_memory() -> dict[str, set[str]]:
    path = dedupe_store_path()
    if not path.exists():
        return {"emails": set(), "owners": set(), "repos": set(), "domains": set(), "names": set()}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"emails": set(), "owners": set(), "repos": set(), "domains": set(), "names": set()}
    return {
        "emails": {str(value).strip().lower() for value in payload.get("emails", [])},
        "owners": {str(value).strip().lower() for value in payload.get("owners", [])},
        "repos": {str(value).strip().lower() for value in payload.get("repos", [])},
        "domains": {str(value).strip().lower() for value in payload.get("domains", [])},
        "names": {str(value).strip().lower() for value in payload.get("names", [])},
    }


def persist_memory(prospects: list[dict[str, Any]]) -> None:
    path = dedupe_store_path()
    memory = load_memory()
    for prospect in prospects:
        email = prospect["email"].lower()
        domain = email.partition("@")[2]
        memory["emails"].add(email)
        memory["owners"].add(owner_key(prospect.get("owner_login", "")))
        memory["repos"].add(prospect["project_url"].strip().lower())
        memory["domains"].add(domain)
        memory["names"].add(normalize_name(prospect["name"]))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({key: sorted(values) for key, values in memory.items()}, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def qualification_diagnostics(prospect: dict[str, Any]) -> dict[str, Any]:
    text = clean_research_text(
        " ".join(
            [
                prospect.get("project", ""),
                prospect.get("project_description", ""),
                prospect.get("research_text", ""),
            ]
        )
    )
    email = prospect["email"].lower()
    local, _, domain = email.partition("@")
    owner = prospect.get("owner_login", "")
    updated_days = days_since(prospect.get("updated_at") or prospect.get("pushed_at"))
    evidence_points = extract_evidence_points(text)
    pain_signals = extract_pain_signals(text)
    repo_label = f"{prospect.get('project', '')} {prospect.get('project_description', '')}"
    excluded_rule: str | None = None
    missing_evidence: list[str] = []

    if is_large_org(owner):
        excluded_rule = "large_vendor_or_foundation_org"
    elif is_generic_contact_email(email):
        excluded_rule = "generic_contact_email"
    elif REPO_TYPE_EXCLUSION_RE.search(repo_label):
        excluded_rule = "repo_type_excluded"
    elif not prospect.get("readme_present", False):
        excluded_rule = "missing_meaningful_readme"
    elif NON_AI_AGENT_RE.search(text):
        excluded_rule = "non_ai_agent_context"
    elif not evidence_points:
        excluded_rule = "no_concrete_ai_workload_evidence"
    elif updated_days is None or updated_days > 180:
        excluded_rule = "stale_project"
    elif contact_quality(email, prospect["email_source_type"], text[:2000]) < 5:
        excluded_rule = "low_quality_contact"

    if not evidence_points:
        missing_evidence.append("concrete workload execution evidence")
    if len(pain_signals) < 1:
        missing_evidence.append("execution pain signal")
    if updated_days is None or updated_days > 180:
        missing_evidence.append("recent activity")
    if contact_quality(email, prospect["email_source_type"], text[:2000]) < 7:
        missing_evidence.append("builder-grade direct contact")
    if not re.search(r"\b(founder|maintainer|solo|indie|small team|developer)\b", text, re.I) and prospect.get(
        "owner_type", ""
    ).lower() != "user":
        missing_evidence.append("small-team or maintainer context")

    evidence_strength = min(
        1.0,
        0.2
        + (0.2 * min(len(evidence_points), 3))
        + (0.15 * min(len(pain_signals), 2))
        + (0.15 if (updated_days is not None and updated_days <= 45) else 0)
        + (0.1 if prospect.get("owner_type", "").lower() == "user" else 0)
        + (0.1 if contact_quality(email, prospect["email_source_type"], text[:2000]) >= 7 else 0),
    )
    return {
        "excluded": excluded_rule is not None,
        "skip_reason": excluded_rule or ("missing_required_evidence" if missing_evidence else ""),
        "exclusion_rule_triggered": excluded_rule or "",
        "missing_evidence": missing_evidence,
        "duplicate": False,
        "stale": bool(updated_days is None or updated_days > 180),
        "generic": is_generic_contact_email(email),
        "irrelevant": not evidence_points or NON_AI_AGENT_RE.search(text) is not None,
        "large_company": is_large_org(owner),
        "owner_key": owner_key(owner),
        "contact_quality": contact_quality(email, prospect["email_source_type"], text[:2000]),
        "generic_team_email": is_team_email(email),
        "updated_days": updated_days,
        "evidence_points": evidence_points,
        "pain_signals": pain_signals,
        "small_team_context": bool(
            prospect.get("owner_type", "").lower() == "user"
            or re.search(r"\b(founder|maintainer|solo|indie|small team)\b", text, re.I)
        ),
        "readme_quality": "meaningful" if prospect.get("readme_present", False) and len(text) >= 140 else "thin",
    }


def discover_from_github(target: int, category: str | None) -> list[dict[str, Any]]:
    prospects: list[dict[str, Any]] = []
    seen_projects: set[str] = set()
    seen_profiles: set[str] = set()
    for pack in query_pack_order(category):
        queries = list(pack["github"])
        random.Random(query_seed() + len(prospects)).shuffle(queries)
        for query in queries:
            if len(prospects) >= target * 4:
                break
            for page in (1, 2):
                if len(prospects) >= target * 4:
                    break
                url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode(
                    {"q": f"{query} archived:false fork:false", "sort": "updated", "per_page": 20, "page": page}
                )
                try:
                    result = request_json(url, headers=github_headers())
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
                    LOG.warning("GitHub discovery unavailable: %s", error)
                    return prospects
                for repo in result.get("items", []):
                    if len(prospects) >= target * 4:
                        break
                    full_name = str(repo.get("full_name") or "").strip().lower()
                    if not full_name or full_name in seen_projects:
                        continue
                    seen_projects.add(full_name)
                    prospect = repo_to_prospect(repo, category)
                    if prospect:
                        prospects.append(prospect)
            for term in pack["registry"]:
                if len(prospects) >= target * 4:
                    break
                for owner, repo_name in search_registry_projects(term):
                    full_name = f"{owner}/{repo_name}".lower()
                    if full_name in seen_projects:
                        continue
                    try:
                        repo = request_json(
                            f"https://api.github.com/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo_name)}",
                            headers=github_headers(),
                        )
                    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                        continue
                    seen_projects.add(full_name)
                    prospect = repo_to_prospect(repo, category)
                    if prospect:
                        prospects.append(prospect)
                    if len(prospects) >= target * 4:
                        break
        if len(prospects) < target * 2:
            prospects.extend(
                discover_from_profiles(queries, category, (target * 2) - len(prospects), seen_projects, seen_profiles)
            )
    return [prospect for prospect in prospects if prospect]


def discover(target: int, input_path: Path | None, category: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    excluded_emails = load_json_env_list("OUTREACH_EXCLUDED_EMAILS")
    excluded_domains = load_json_env_list("OUTREACH_EXCLUDED_DOMAINS")
    excluded_project_keys = load_json_env_list("OUTREACH_EXCLUDED_PROJECT_KEYS")
    allow_generic_email = bool_env("ALLOW_GENERIC_CONTACT_EMAILS")
    allow_large_company = bool_env("ALLOW_LARGE_COMPANY_RESULTS")
    memory = load_memory()
    prospects = load_seed(input_path)
    if category:
        prospects = [prospect for prospect in prospects if prospect["category"] == category]
    if len(prospects) < target:
        prospects.extend(discover_from_github(max(target * 3, target - len(prospects)), category))
    unique: dict[str, dict[str, Any]] = {}
    skipped: list[dict[str, Any]] = []
    domains: Counter[str] = Counter()
    owners: Counter[str] = Counter()
    categories: Counter[str] = Counter()
    generic_email_count = 0
    large_company_count = 0
    for prospect in prospects:
        email = prospect["email"].lower()
        domain = email.split("@")[-1]
        project_key = prospect["project"].strip().lower()
        diagnostics = qualification_diagnostics(prospect)
        duplicate_reason = ""
        if (
            email in excluded_emails
            or domain in excluded_domains
            or project_key in excluded_project_keys
            or email in unique
            or email in memory["emails"]
            or owner_key(prospect.get("owner_login", "")) in memory["owners"]
            or prospect["project_url"].strip().lower() in memory["repos"]
            or normalize_name(prospect["name"]) in memory["names"]
        ):
            duplicate_reason = "duplicate_or_previously_seen"
        if duplicate_reason:
            diagnostics.update(
                {
                    "excluded": True,
                    "skip_reason": duplicate_reason,
                    "exclusion_rule_triggered": duplicate_reason,
                    "duplicate": True,
                }
            )
        if diagnostics["excluded"] and (diagnostics["generic"] and allow_generic_email):
            diagnostics["excluded"] = False
            diagnostics["skip_reason"] = ""
            diagnostics["exclusion_rule_triggered"] = ""
        if diagnostics["large_company"] and allow_large_company:
            diagnostics["excluded"] = False
            diagnostics["skip_reason"] = ""
            diagnostics["exclusion_rule_triggered"] = ""
        owner = diagnostics["owner_key"]
        if not diagnostics["excluded"] and owners[owner] >= 1:
            diagnostics.update(
                {
                    "excluded": True,
                    "skip_reason": "owner_diversity_cap",
                    "exclusion_rule_triggered": "owner_diversity_cap",
                }
            )
        if not diagnostics["excluded"] and categories[prospect["category"]] >= 2:
            diagnostics.update(
                {
                    "excluded": True,
                    "skip_reason": "category_diversity_cap",
                    "exclusion_rule_triggered": "category_diversity_cap",
                }
            )
        if not diagnostics["excluded"] and diagnostics["generic"] and generic_email_count >= 1:
            diagnostics.update(
                {
                    "excluded": True,
                    "skip_reason": "generic_email_cap",
                    "exclusion_rule_triggered": "generic_email_cap",
                }
            )
        if not diagnostics["excluded"] and diagnostics["large_company"] and large_company_count >= 1:
            diagnostics.update(
                {
                    "excluded": True,
                    "skip_reason": "large_company_cap",
                    "exclusion_rule_triggered": "large_company_cap",
                }
            )
        if diagnostics["excluded"]:
            skipped.append(
                {
                    "prospect_id": prospect["prospect_id"],
                    "project": prospect["project"],
                    "email": prospect["email"],
                    "category": prospect["category"],
                    **diagnostics,
                }
            )
            continue
        prospect["diagnostics"] = diagnostics
        unique[email] = prospect
        domains[domain] += 1
        owners[owner] += 1
        categories[prospect["category"]] += 1
        if diagnostics["generic"]:
            generic_email_count += 1
        if diagnostics["large_company"]:
            large_company_count += 1
        if len(unique) >= target:
            break
    accepted = list(unique.values())[:target]
    persist_memory(accepted)
    return accepted, skipped


def pick_detail(text: str, fallback: str) -> str:
    clean = clean_research_text(text)
    sentences = split_sentences(clean)
    for sentence in sentences:
        if 35 <= len(sentence) <= 240 and CONCRETE_WORKLOAD_RE.search(sentence):
            return sentence
    return fallback or "the project documents durable AI workload execution"


def research(prospects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    notes = []
    for prospect in prospects:
        diagnostics = prospect.get("diagnostics", qualification_diagnostics(prospect))
        evidence_points = diagnostics["evidence_points"] or [
            pick_detail(prospect["research_text"], prospect["project_description"] or prospect["project"])
        ]
        pain_signal = diagnostics["pain_signals"][0] if diagnostics["pain_signals"] else evidence_points[0]
        summary_parts = evidence_points[:2]
        strength = max(0.0, min(1.0, float(diagnostics.get("contact_quality", 0)) / 10 * 0.15 + 0.25 + 0.25 * len(evidence_points) + (0.15 if diagnostics.get("small_team_context") else 0) + (0.2 if not diagnostics.get("stale") else 0)))
        notes.append(
            {
                "prospect_id": prospect["prospect_id"],
                "summary": clip_words(f"{prospect['project']} shows {'. '.join(summary_parts)}", 45),
                "personalization_detail": clip_words(evidence_points[0], 20),
                "junglegrid_relevance": clip_words(
                    f"Likely fit because {pain_signal} points to real execution overhead around queues, workers, inference, or long-running jobs.",
                    28,
                ),
                "evidence_urls": prospect["evidence_urls"],
                "evidence_strength": round(strength, 2),
                "evidence_points": evidence_points,
                "pain_signals": diagnostics["pain_signals"],
            }
        )
    return notes


def score_breakdown(prospect: dict[str, Any], note: dict[str, Any]) -> dict[str, int]:
    text = clean_research_text(
        " ".join(
            [
                prospect["project"],
                prospect["project_description"],
                note["summary"],
                note["personalization_detail"],
                " ".join(note.get("evidence_points", [])),
            ]
        )
    )
    category = prospect["category"]
    evidence_points = note.get("evidence_points", [])
    pain_signals = note.get("pain_signals", [])
    contact = int(prospect.get("diagnostics", {}).get("contact_quality", 0))
    updated_days = prospect.get("diagnostics", {}).get("updated_days")
    agent = 20 if category in {"agent_framework", "mcp", "agent_compute"} and evidence_points else (
        14 if disambiguates_ai_agent(text) else 2
    )
    workload = 20 if re.search(r"\b(inference|gpu|batch|fine[- ]?tun|eval|rag|worker|queue)\b", text, re.I) and len(evidence_points) >= 2 else (
        12 if evidence_points else 0
    )
    infrastructure = 20 if pain_signals else (12 if re.search(r"\b(runtime|deploy|latency|cost|artifact|retry)\b", text, re.I) else 0)
    activity = 15 if updated_days is not None and updated_days <= 30 else (11 if updated_days is not None and updated_days <= 90 else 4)
    comprehension = 15 if len(evidence_points) >= 2 and pain_signals else (8 if len(evidence_points) >= 2 else 0)
    return {
        "agentMcpRelevance": min(20, agent),
        "aiWorkloadRelevance": min(20, workload),
        "infrastructurePain": min(20, infrastructure),
        "openSourceActivity": min(15, activity),
        "jungleGridComprehension": min(15, comprehension),
        "contactQuality": min(10, contact),
    }


def score(prospects: list[dict[str, Any]], notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {note["prospect_id"]: note for note in notes}
    rows = []
    for prospect in prospects:
        note = by_id[prospect["prospect_id"]]
        breakdown = score_breakdown(prospect, note)
        public = {key: value for key, value in prospect.items() if key not in {"research_text", "evidence_urls", "stars", "active"}}
        diagnostics = prospect.get("diagnostics", {})
        evidence_points = note.get("evidence_points", [])
        concrete_pain_signal = (note.get("pain_signals") or evidence_points or [prospect["project_description"]])[0]
        fit_score = sum(breakdown.values())
        rows.append(
            {
                **public,
                "fit_score": fit_score,
                "score_breakdown": breakdown,
                "evidence_strength": note["evidence_strength"],
                "contact_quality": diagnostics.get("contact_quality", 0),
                "evidence_points": evidence_points,
                "why_this_person": clip_words(
                    f"{prospect['name']} appears to be a reachable maintainer or builder for {prospect['project']}.",
                    20,
                ),
                "why_now": clip_words(
                    f"The repo is active and currently surfaces execution concerns like {concrete_pain_signal}.",
                    20,
                ),
                "concrete_pain_signal": concrete_pain_signal,
                "suggested_angle": clip_words(
                    "Position Jungle Grid as durable execution for inference, workers, retries, and inspectable artifacts.",
                    18,
                ),
                "outreach_priority": "high" if fit_score >= 85 else ("medium" if fit_score >= 75 else "low"),
                "excluded": False,
            }
        )
    return rows


def template_draft(prospect: dict[str, Any], note: dict[str, Any]) -> tuple[str, str, list[str]]:
    first_name = prospect["name"].split()[0] if prospect["name"].strip() else "there"
    project_name = prospect["project"].split("/")[-1]
    detail = clip_words(note["personalization_detail"], 14)
    pain = clip_words((note.get("pain_signals") or [note["personalization_detail"]])[0], 14)
    body = (
        f"Hi {first_name},\n\n"
        f"I read the public docs for {project_name} and noticed {detail}. "
        "I’m building Jungle Grid for teams that need to run inference, workers, and other long-running AI jobs without building queueing, retries, and artifact handling from scratch.\n\n"
        f"The reason I reached out is that {pain}. That usually shows up when an AI product moves from demos into real workloads and the background execution layer starts becoming the bottleneck.\n\n"
        f"If that is a live problem for you, the shortest overview is {SITE}.\n\n"
        "Benedict"
    )
    if word_count(body) < MIN_WORDS:
        body = body.replace(
            "The reason I reached out is that",
            "The reason I reached out is that, in practice, teams usually hit friction around observability and job durability once usage grows, and",
        )
    if word_count(body) > MAX_WORDS:
        detail = clip_words(note["personalization_detail"], 10)
        return template_draft(prospect, {**note, "personalization_detail": detail, "pain_signals": [pain]})
    return f"Jungle Grid and {project_name}"[:MAX_SUBJECT], body, [detail]


SYSTEM_PROMPT = (
    "You write concise founder-led outreach emails using only the provided evidence. "
    "Do not invent facts. Output plain text only. Include exactly one link and it must be "
    "https://junglegrid.dev. Keep the email under 140 words. If evidence is "
    "insufficient, return SKIP."
)


def ollama_base() -> str:
    return os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")


def wait_for_ollama(timeout_seconds: int = 25) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            request_json(f"{ollama_base()}/api/tags", timeout=3)
            return True
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            time.sleep(1)
    return False


def ensure_ollama(model: str) -> bool:
    global OLLAMA_PROCESS
    if not wait_for_ollama(2):
        host = urllib.parse.urlparse(ollama_base())
        if host.hostname not in {"127.0.0.1", "localhost"}:
            return False
        try:
            OLLAMA_PROCESS = subprocess.Popen(
                ["ollama", "serve"],
                stdout=sys.stderr,
                stderr=sys.stderr,
                start_new_session=True,
            )
        except (FileNotFoundError, OSError) as error:
            LOG.warning("Ollama could not be started: %s", error)
            return False
        if not wait_for_ollama():
            return False
    try:
        tags = request_json(f"{ollama_base()}/api/tags", timeout=10)
        names = {str(item.get("name", "")) for item in tags.get("models", [])}
        if model not in names and not any(name.startswith(f"{model}:") for name in names):
            LOG.info("Pulling Ollama model %s.", model)
            request_json(
                f"{ollama_base()}/api/pull",
                method="POST",
                payload={"name": model, "stream": False},
                timeout=900,
            )
    except (urllib.error.URLError, TimeoutError) as error:
            LOG.warning("Ollama model pull failed: %s", error)
            return False
    return True


def stop_ollama() -> None:
    global OLLAMA_PROCESS
    if OLLAMA_PROCESS is None:
        return
    process = OLLAMA_PROCESS
    OLLAMA_PROCESS = None
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def qwen_draft(
    prospect: dict[str, Any],
    note: dict[str, Any],
    model: str,
) -> tuple[str, str, list[str]] | None:
    prompt = {
        "recipient": {"name": prospect["name"], "project": prospect["project"]},
        "public_evidence": {
            "detail": note["personalization_detail"],
            "summary": note["summary"],
            "relevance": note["junglegrid_relevance"],
            "urls": note["evidence_urls"],
        },
        "output": {
            "format": "JSON",
            "fields": ["subject", "body", "personalization_claims"],
            "signature": "Benedict",
        },
    }
    response = request_json(
        f"{ollama_base()}/api/generate",
        method="POST",
        payload={
            "model": model,
            "system": SYSTEM_PROMPT,
            "prompt": json.dumps(prompt),
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.2},
        },
        timeout=180,
    )
    raw = str(response.get("response", "")).strip()
    if raw.upper() == "SKIP" or not raw:
        return None
    generated = json.loads(raw)
    if generated.get("skip") is True:
        return None
    return (
        str(generated.get("subject", "")).strip(),
        str(generated.get("body", "")).strip(),
        [str(claim).strip() for claim in generated.get("personalization_claims", []) if str(claim).strip()],
    )


def build_draft_candidate(
    prospect: dict[str, Any],
    note: dict[str, Any],
    subject: str,
    body: str,
    claims: list[str],
    model_mode: str,
) -> dict[str, Any]:
    return {
        "prospect_id": prospect["prospect_id"],
        "name": prospect["name"],
        "email": prospect["email"],
        "email_source_url": prospect["email_source_url"],
        "project": prospect["project"],
        "category": prospect["category"],
        "fit_score": prospect["fit_score"],
        "subject": subject,
        "body": body,
        "word_count": word_count(body),
        "links": [link.rstrip(".,;:!?") for link in URL_RE.findall(f"{subject}\n{body}")],
        "evidence_urls": note["evidence_urls"],
        "personalization_claims": claims,
        "model_mode": model_mode,
        "validation_status": "passed",
        "validation_errors": [],
    }


def validate_draft(draft: dict[str, Any], max_per_domain: int, domains: Counter[str]) -> list[str]:
    errors: list[str] = []
    body = draft["body"]
    links = [link.rstrip(".,;:!?") for link in URL_RE.findall(f"{draft['subject']}\n{body}")]
    count = word_count(body)
    domain = draft["email"].split("@")[-1].lower()
    if count < MIN_WORDS or count > MAX_WORDS:
        errors.append(f"body must contain {MIN_WORDS}-{MAX_WORDS} words; found {count}")
    if len(draft["subject"]) > MAX_SUBJECT:
        errors.append("subject must be under 80 characters")
    if links != ALLOWED_LINKS:
        errors.append(f"draft must contain exactly one link: {SITE}")
    if re.search(r"<(?:img|a|script|style|html|body)\b|tracking\s*pixel|utm_|unsubscribe|open tracking", body, re.I):
        errors.append("tracking and HTML are not allowed")
    if re.search(r"\battachment\b", body, re.I):
        errors.append("attachments are not allowed")
    if not draft["email_source_url"]:
        errors.append("email source URL is required")
    if draft["email_source_url"] not in draft["evidence_urls"]:
        errors.append("email source URL must be included in evidence URLs")
    if not draft["personalization_claims"]:
        errors.append("at least one evidence-bound personalization claim is required")
    if re.search(r"\bi noticed you are using gpus?\b", body, re.I) and "gpu" not in " ".join(draft["personalization_claims"]).lower():
        errors.append("GPU claims must be evidence-backed")
    project_terms = [
        term for term in re.split(r"[^a-z0-9]+", draft["project"].lower()) if len(term) >= 3
    ]
    if not any(term in body.lower() for term in project_terms):
        errors.append("body must mention the evidenced project")
    if domains[domain] >= max_per_domain:
        errors.append(f"domain {domain} exceeds the cap of {max_per_domain}")
    return errors


def write_drafts(
    scored: list[dict[str, Any]],
    notes: list[dict[str, Any]],
    use_qwen: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], bool]:
    threshold = int(os.getenv("FIT_SCORE_THRESHOLD", "70"))
    max_per_domain = int(os.getenv("MAX_DRAFTS_PER_DOMAIN", "2"))
    fallback_mode = os.getenv("LLM_FALLBACK_MODE", "template")
    model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    by_id = {note["prospect_id"]: note for note in notes}
    passed: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    domains: Counter[str] = Counter()
    fallback_used = False
    qwen_ready = use_qwen and os.getenv("USE_LOCAL_LLM", "true").lower() == "true" and ensure_ollama(model)
    if use_qwen and not qwen_ready:
        if fallback_mode != "template":
            raise RuntimeError("Qwen/Ollama is unavailable and template fallback is disabled.")
        fallback_used = True
        LOG.warning("Qwen/Ollama unavailable; falling back to template mode.")

    seen_emails: set[str] = set()
    for prospect in scored:
        note = by_id[prospect["prospect_id"]]
        if (
            prospect["fit_score"] < max(threshold, 75)
            or note["evidence_strength"] < 0.8
            or int(prospect.get("contact_quality", 0)) < 7
            or len(prospect.get("evidence_points", [])) < 2
            or prospect.get("excluded")
        ):
            failures.append(
                {
                    "prospect_id": prospect["prospect_id"],
                    "errors": ["prospect did not pass the buyer-fit gate"],
                }
            )
            continue
        if is_generic_contact_email(prospect["email"]):
            failures.append({"prospect_id": prospect["prospect_id"], "errors": ["generic support inbox is not allowed"]})
            continue
        if prospect["email"].lower() in seen_emails:
            failures.append({"prospect_id": prospect["prospect_id"], "errors": ["duplicate email"]})
            continue
        generated = None
        model_mode = "template"
        if qwen_ready:
            try:
                generated = qwen_draft(prospect, note, model)
                model_mode = "qwen"
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
                LOG.warning("Qwen generation failed for %s: %s", prospect["prospect_id"], error)
                if fallback_mode != "template":
                    failures.append(
                        {"prospect_id": prospect["prospect_id"], "errors": ["Qwen generation failed"]}
                    )
                    continue
                fallback_used = True
                model_mode = "fallback"
        if generated is None:
            if qwen_ready and fallback_mode != "template":
                failures.append(
                    {"prospect_id": prospect["prospect_id"], "errors": ["model returned SKIP"]}
                )
                continue
            generated = template_draft(prospect, note)
            if use_qwen:
                model_mode = "fallback"
                fallback_used = True
        subject, body, claims = generated
        draft = build_draft_candidate(prospect, note, subject, body, claims, model_mode)
        errors = validate_draft(draft, max_per_domain, domains)
        if errors and qwen_ready and model_mode == "qwen" and fallback_mode == "template":
            fallback_used = True
            subject, body, claims = template_draft(prospect, note)
            draft = build_draft_candidate(prospect, note, subject, body, claims, "fallback")
            errors = validate_draft(draft, max_per_domain, domains)
        if errors:
            failures.append({"prospect_id": prospect["prospect_id"], "errors": errors})
            continue
        domains[prospect["email"].split("@")[-1].lower()] += 1
        seen_emails.add(prospect["email"].lower())
        passed.append(draft)
    return passed, failures, fallback_used


def write_json(output: Path, name: str, value: Any) -> None:
    output.mkdir(parents=True, exist_ok=True)
    temporary = output / f".{name}.tmp"
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    temporary.replace(output / name)


def run(args: argparse.Namespace) -> int:
    try:
        if args.health_check:
            print("ok")
            return 0
        started = utc_now()
        output = Path(args.output)
        input_path = Path(args.input) if args.input else None
        prospects, skipped = discover(args.target, input_path, args.category)
        notes = research(prospects)
        scored = score(prospects, notes)
        use_qwen = args.job in {"write-emails-qwen", "full-run-qwen"}
        drafts: list[dict[str, Any]] = []
        failures: list[dict[str, Any]] = []
        fallback_used = False
        if args.job in {
            "write-emails-template",
            "write-emails-qwen",
            "full-run-template",
            "full-run-qwen",
        }:
            drafts, failures, fallback_used = write_drafts(scored, notes, use_qwen)

        public_prospects = [
            {
                key: value
                for key, value in row.items()
                if key not in {"research_text", "evidence_urls", "stars", "active", "diagnostics"}
            }
            for row in prospects
        ]
        mode = "junglegrid-qwen" if use_qwen else "junglegrid-template"
        summary = {
            "job": args.job,
            "mode": mode,
            "target": args.target,
            "discovered": len(prospects),
            "researched": len(notes),
            "scored": len(scored),
            "drafts_passed": len(drafts),
            "drafts_failed": len(failures),
            "skipped": len(skipped) + len(failures),
            "fallback_used": fallback_used,
            "model": os.getenv("OLLAMA_MODEL", "qwen2.5:3b") if use_qwen else "template",
            "started_at": started,
            "completed_at": utc_now(),
        }
        report = {
            "valid": True,
            "checked": len(drafts) + len(failures),
            "passed": len(drafts),
            "failed": len(failures),
            "errors": failures,
            "skipped_prospects": skipped,
        }
        write_json(output, "prospects.json", public_prospects)
        write_json(output, "research_notes.json", notes)
        write_json(output, "scored_prospects.json", scored)
        write_json(output, "email_drafts.json", drafts)
        write_json(output, "run_summary.json", summary)
        write_json(output, "validation_report.json", report)
        LOG.info("Wrote %s validated drafts and %s validation failures.", len(drafts), len(failures))
        return 0
    finally:
        stop_ollama()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", choices=sorted(JOBS), default="full-run-qwen")
    parser.add_argument("--target", type=int, default=17)
    parser.add_argument("--output", default="/workspace/artifacts")
    parser.add_argument("--input")
    parser.add_argument("--category")
    parser.add_argument("--health-check", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
