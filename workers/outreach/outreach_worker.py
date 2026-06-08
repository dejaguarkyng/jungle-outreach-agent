#!/usr/bin/env python3
"""Jungle Grid outreach research and draft artifact worker."""

from __future__ import annotations

import argparse
import json
import logging
import os
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
from pathlib import Path
from typing import Any

SITE = "https://junglegrid.dev"
MIN_WORDS = 60
MAX_WORDS = 80
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
        if local in {"noreply", "no-reply", "example", "test"}:
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
    if local in {"noreply", "no-reply", "donotreply", "do-not-reply", "example", "test", "admin"}:
        return None
    if domain in {"example.com", "example.org", "example.net", "users.noreply.github.com"}:
        return None
    if not EMAIL_RE.fullmatch(normalized):
        return None
    return normalized


def contact_source_score(source_type: str, email: str, context: str) -> int:
    base = {
        "official_website": 100,
        "project_docs": 90,
        "package_page": 85,
        "github_profile": 75,
        "repository_readme": 70,
    }.get(source_type, 60)
    bonus = 8 if CONTACT_CONTEXT_RE.search(context) else 0
    penalty = -4 if email.startswith(("admin@", "info@")) else 0
    return base + bonus + penalty


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
    if "workflow" in lowered or "automation" in lowered:
        return "workflow_automation"
    if "fine-tun" in lowered or "training" in lowered or "inference" in lowered:
        return "inference_training"
    if "infrastructure" in lowered or "gpu" in lowered:
        return "ai_infrastructure"
    if "agent" in lowered and ("runtime" in lowered or "compute" in lowered):
        return "agent_compute"
    if "agent" in lowered:
        return "agent_framework"
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
    return {
        "prospect_id": str(raw.get("prospect_id") or uuid.uuid4()),
        "name": str(raw.get("name") or project.split("/")[-1]).strip(),
        "email": email,
        "email_source_url": source_url,
        "email_source_type": str(raw.get("email_source_type") or "official_website"),
        "project": project,
        "project_url": project_url,
        "project_description": str(raw.get("project_description") or "").strip(),
        "category": str(raw.get("category") or category_for(project)),
        "research_text": str(raw.get("research_text") or raw.get("project_description") or "").strip(),
        "evidence_urls": list(
            dict.fromkeys(
                [
                    source_url,
                    project_url,
                    *[str(url) for url in raw.get("evidence_urls", []) if url],
                ]
            )
        ),
        "stars": int(raw.get("stars") or 0),
        "active": bool(raw.get("active", True)),
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
        if local in {"noreply", "no-reply", "example", "test"}:
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


QUERY_PACKS: dict[str, dict[str, list[str]]] = {
    "mcp": {
        "github": [
            '"model context protocol" stars:>10',
            'mcp agent tools stars:>8',
            '"model context protocol" tools stars:>8',
        ],
        "registry": ["model context protocol", "mcp tools", "mcp agent"],
    },
    "workflow_automation": {
        "github": [
            "workflow automation agent stars:>20",
            '"durable workflow" stars:>10',
            '"background jobs" automation stars:>10',
        ],
        "registry": ["workflow automation agent", "durable workflow", "background jobs automation"],
    },
    "inference_training": {
        "github": [
            "inference training gpu stars:>20",
            '"batch inference" training stars:>10',
            'fine-tuning inference gpu stars:>10',
        ],
        "registry": ["vllm inference serving", "batch inference training", "fine tuning inference gpu"],
    },
    "agent_compute": {
        "github": [
            "agent runtime compute stars:>10",
            "durable execution runtime stars:>10",
            "worker queue artifacts retries stars:>8",
        ],
        "registry": ["batch jobs agent runtime", "durable execution runtime", "worker queue artifacts"],
    },
    "agent_framework": {
        "github": [
            '"AI agent" framework stars:>20',
            "agent runtime stars:>15",
            '"tool calling" agent stars:>10',
        ],
        "registry": ["ai agent framework", "agent runtime", "tool calling agent"],
    },
    "ai_infrastructure": {
        "github": [
            '"AI infrastructure" inference stars:>20',
            "gpu orchestration inference stars:>15",
            '"model serving" infrastructure stars:>10',
        ],
        "registry": ["ai infrastructure inference", "gpu orchestration inference", "model serving infrastructure"],
    },
}


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

    return normalize_prospect(
        {
            "name": profile.get("name") or owner_login,
            "email": best_contact["email"],
            "email_source_url": best_contact["source_url"],
            "email_source_type": best_contact["source_type"],
            "project": full_name,
            "project_url": repo.get("html_url") or f"https://github.com/{full_name}",
            "project_description": repo.get("description") or "",
            "category": category or category_for(f"{repo.get('description', '')} {(readme or homepage_text)[:4000]}"),
            "research_text": (readme or homepage_text)[:20_000],
            "evidence_urls": [
                best_contact["source_url"],
                repo.get("html_url") or f"https://github.com/{full_name}",
                f"https://github.com/{full_name}#readme",
                *metadata["project_urls"],
            ],
            "stars": repo.get("stargazers_count") or 0,
            "active": True,
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


def discover_from_github(target: int, category: str | None) -> list[dict[str, Any]]:
    pack = QUERY_PACKS.get(
        category or "",
        {"github": ["agent runtime inference workflow stars:>20"], "registry": ["agent runtime inference workflow"]},
    )
    queries = pack["github"]
    prospects: list[dict[str, Any]] = []
    seen_projects: set[str] = set()
    seen_profiles: set[str] = set()
    for query in queries:
        if len(prospects) >= target:
            break
        for page in (1, 2):
            if len(prospects) >= target:
                break
            url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode(
                {"q": f"{query} archived:false fork:false", "sort": "updated", "per_page": 30, "page": page}
            )
            try:
                result = request_json(url, headers=github_headers())
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
                LOG.warning("GitHub discovery unavailable: %s", error)
                return prospects

            for repo in result.get("items", []):
                if len(prospects) >= target:
                    break
                full_name = str(repo.get("full_name") or "").strip()
                if not full_name or full_name.lower() in seen_projects:
                    continue
                seen_projects.add(full_name.lower())
                prospect = repo_to_prospect(repo, category)
                if prospect:
                    prospects.append(prospect)
        if len(prospects) >= target:
            break
        for term in pack["registry"]:
            if len(prospects) >= target:
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
                if len(prospects) >= target:
                    break
    if len(prospects) < target:
        prospects.extend(discover_from_profiles(queries, category, target - len(prospects), seen_projects, seen_profiles))
    return [prospect for prospect in prospects if prospect]


def discover(target: int, input_path: Path | None, category: str | None) -> list[dict[str, Any]]:
    excluded_emails = load_json_env_list("OUTREACH_EXCLUDED_EMAILS")
    excluded_domains = load_json_env_list("OUTREACH_EXCLUDED_DOMAINS")
    excluded_project_keys = load_json_env_list("OUTREACH_EXCLUDED_PROJECT_KEYS")
    prospects = load_seed(input_path)
    if category:
        prospects = [prospect for prospect in prospects if prospect["category"] == category]
    if len(prospects) < target:
        prospects.extend(discover_from_github(target - len(prospects), category))
    unique: dict[str, dict[str, Any]] = {}
    domains: Counter[str] = Counter()
    max_per_domain = int(os.getenv("MAX_DRAFTS_PER_DOMAIN", "2"))
    for prospect in prospects:
        email = prospect["email"].lower()
        domain = email.split("@")[-1]
        project_key = prospect["project"].strip().lower()
        if (
            email in excluded_emails
            or domain in excluded_domains
            or project_key in excluded_project_keys
            or email in unique
            or domains[domain] >= max_per_domain
        ):
            continue
        unique[email] = prospect
        domains[domain] += 1
    return list(unique.values())[:target]


def pick_detail(text: str, fallback: str) -> str:
    clean = re.sub(r"[#>*_`|\[\]()]", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    for sentence in sentences:
        if 35 <= len(sentence) <= 240 and TARGET_TERMS.search(sentence):
            return sentence
    return fallback or "the project documents agent-oriented compute workflows"


def research(prospects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    notes = []
    for prospect in prospects:
        fallback = prospect["project_description"] or f"{prospect['project']} is an open-source AI project"
        detail = pick_detail(prospect["research_text"], fallback)
        strength = min(1.0, 0.45 + 0.1 * len(prospect["evidence_urls"]) + (0.2 if detail != fallback else 0))
        notes.append(
            {
                "prospect_id": prospect["prospect_id"],
                "summary": clip_words(f"{prospect['project']} documents {detail}", 55),
                "personalization_detail": clip_words(detail, 28),
                "junglegrid_relevance": (
                    "The documented workload can benefit from durable compute jobs, logs, retries, "
                    "and retrievable artifacts."
                ),
                "evidence_urls": prospect["evidence_urls"],
                "evidence_strength": round(strength, 2),
            }
        )
    return notes


def score_breakdown(prospect: dict[str, Any], note: dict[str, Any]) -> dict[str, int]:
    text = " ".join(
        [
            prospect["project"],
            prospect["project_description"],
            note["summary"],
            note["personalization_detail"],
        ]
    )
    category = prospect["category"]
    agent = 20 if category in {"agent_framework", "mcp", "agent_compute"} else (12 if re.search(r"\bagent\b", text, re.I) else 6)
    workload = 20 if category in {"ai_infrastructure", "inference_training", "agent_compute"} else (13 if re.search(r"\b(inference|training|gpu|batch)\b", text, re.I) else 7)
    infrastructure = 20 if re.search(r"\b(runtime|compute|queue|retry|artifact|worker|orchestrat)\w*\b", text, re.I) else 9
    activity = 15 if prospect["active"] and prospect["stars"] >= 100 else (12 if prospect["active"] else 4)
    comprehension = 15 if workload >= 13 and infrastructure >= 15 else 9
    contact = 10 if prospect["email_source_type"] in {"github_profile", "official_website"} else 8
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
        rows.append({**public, "fit_score": sum(breakdown.values()), "score_breakdown": breakdown})
    return rows


def template_draft(prospect: dict[str, Any], note: dict[str, Any]) -> tuple[str, str, list[str]]:
    first_name = prospect["name"].split()[0] if prospect["name"].strip() else "there"
    project_name = prospect["project"].split("/")[-1]
    detail = clip_words(note["personalization_detail"], 14)
    body = (
        f"Hi {first_name},\n\n"
        f"I read the public documentation for {project_name} and noticed {detail}. "
        "I’m building Jungle Grid, an execution layer for agent-triggered inference, batch jobs, "
        "logs, retries, and artifacts.\n\n"
        "The workload you describe seems relevant because teams need reliable compute beyond "
        "lightweight tool calls. I thought this might be useful as you develop the project: "
        f"{SITE}\n\nBenedict"
    )
    if word_count(body) < MIN_WORDS:
        body = body.replace(
            "I thought this might",
            "The system remains auditable and keeps outputs available for review. I thought this might",
        )
    if word_count(body) > MAX_WORDS:
        detail = clip_words(note["personalization_detail"], 8)
        return template_draft(prospect, {**note, "personalization_detail": detail})
    return f"Jungle Grid and {project_name}"[:MAX_SUBJECT], body, [detail]


SYSTEM_PROMPT = (
    "You write concise founder-led outreach emails using only the provided evidence. "
    "Do not invent facts. Do not include more than one link. The only allowed link is "
    "https://junglegrid.dev. Keep the email between 60 and 80 words. If evidence is "
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
    if links != [SITE]:
        errors.append(f"draft must contain exactly one link and it must be {SITE}")
    if re.search(r"<(?:img|a|script|style)\b|tracking\s*pixel|utm_", body, re.I):
        errors.append("tracking and HTML are not allowed")
    if re.search(r"\battachment\b", body, re.I):
        errors.append("attachments are not allowed")
    if not draft["email_source_url"]:
        errors.append("email source URL is required")
    if draft["email_source_url"] not in draft["evidence_urls"]:
        errors.append("email source URL must be included in evidence URLs")
    if not draft["personalization_claims"]:
        errors.append("at least one evidence-bound personalization claim is required")
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
        if prospect["fit_score"] < threshold or note["evidence_strength"] < 0.6:
            failures.append(
                {
                    "prospect_id": prospect["prospect_id"],
                    "errors": ["prospect did not meet fit or evidence threshold"],
                }
            )
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
        prospects = discover(args.target, input_path, args.category)
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
                if key not in {"research_text", "evidence_urls", "stars", "active"}
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
            "skipped": len(failures),
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
