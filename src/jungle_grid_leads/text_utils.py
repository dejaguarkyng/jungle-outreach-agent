from __future__ import annotations

import hashlib
import re
from difflib import SequenceMatcher
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "ref_src",
    "source",
    "s",
    "fbclid",
    "gclid",
}

PAIN_TERMS = {
    "pain",
    "painful",
    "frustrated",
    "stuck",
    "struggling",
    "issue",
    "issues",
    "problem",
    "problems",
    "quota",
    "outage",
    "latency",
    "expensive",
    "slow",
    "hard",
    "annoying",
    "deploy",
    "deployment",
    "provider",
    "gpu",
}

NORMALIZATION_REPLACEMENTS = (
    (r"\bcan't\b", "cannot"),
    (r"\bcant\b", "cannot"),
    (r"\banother option\b", "alternative"),
    (r"\boption\b", "alternative"),
    (r"\binstances?\b", "capacity"),
    (r"\bvm\b", "instance"),
    (r"\bcurrent\b", ""),
)


def stable_id(*parts: str) -> str:
    joined = "||".join(normalize_whitespace(part).lower() for part in parts if part)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()[:16]


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def truncate(text: str, limit: int) -> str:
    clean = normalize_whitespace(text)
    if len(clean) <= limit:
        return clean
    return clean[: limit - 3].rstrip() + "..."


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = re.sub(r"/+$", "", parsed.path or "")
    filtered_query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_PARAMS
    ]
    query = urlencode(sorted(filtered_query))
    return urlunparse((scheme, netloc, path, "", query, ""))


def strip_html(text: str) -> str:
    clean = re.sub(r"<[^>]+>", " ", text or "")
    return normalize_whitespace(clean)


def strip_markdown(text: str) -> str:
    """Remove common markdown syntax to produce plain readable text."""
    t = text or ""
    # Fenced code blocks
    t = re.sub(r"```[\s\S]*?```", " ", t)
    # Inline code
    t = re.sub(r"`[^`]+`", " ", t)
    # Headers
    t = re.sub(r"^#{1,6}\s+", "", t, flags=re.MULTILINE)
    # Horizontal rules
    t = re.sub(r"^[-*_]{3,}\s*$", " ", t, flags=re.MULTILINE)
    # Table rows (lines that start and end with |)
    t = re.sub(r"^\|.*\|$", " ", t, flags=re.MULTILINE)
    # Markdown links [text](url) -> text
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    # Bare URLs
    t = re.sub(r"https?://\S+", " ", t)
    # Bold / italic
    t = re.sub(r"\*{1,3}([^*\n]+)\*{1,3}", r"\1", t)
    t = re.sub(r"_{1,3}([^_\n]+)_{1,3}", r"\1", t)
    # Bullet points
    t = re.sub(r"^\s*[-*+]\s+", "", t, flags=re.MULTILINE)
    # Numbered list markers
    t = re.sub(r"^\s*\d+\.\s+", "", t, flags=re.MULTILINE)
    return normalize_whitespace(t)


def normalize_for_similarity(text: str) -> str:
    no_urls = re.sub(r"https?://\S+", " ", text or "")
    lowered = no_urls.lower()
    for pattern, replacement in NORMALIZATION_REPLACEMENTS:
        lowered = re.sub(pattern, replacement, lowered)
    simplified = re.sub(r"[^a-z0-9\s]", " ", lowered)
    return normalize_whitespace(simplified)


def tokenize(text: str) -> set[str]:
    return {token for token in normalize_for_similarity(text).split() if len(token) > 2}


def jaccard_similarity(left: Iterable[str], right: Iterable[str]) -> float:
    left_set = set(left)
    right_set = set(right)
    if not left_set and not right_set:
        return 1.0
    union = left_set | right_set
    if not union:
        return 0.0
    return len(left_set & right_set) / len(union)


def complaint_similarity(left: str, right: str) -> float:
    left_norm = normalize_for_similarity(left)
    right_norm = normalize_for_similarity(right)
    if not left_norm or not right_norm:
        return 0.0
    seq = SequenceMatcher(None, left_norm, right_norm).ratio()
    left_tokens = tokenize(left_norm)
    right_tokens = tokenize(right_norm)
    token_score = jaccard_similarity(left_tokens, right_tokens)
    overlap = len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))
    return round((0.4 * seq) + (0.25 * token_score) + (0.35 * overlap), 4)


def extract_complaint_text(title: str, body: str) -> str:
    content = normalize_whitespace(" ".join(part for part in [title, body] if part))
    if not content:
        return ""

    sentences = re.split(r"(?<=[.!?])\s+", content)
    matches = [sentence for sentence in sentences if _contains_pain_term(sentence)]
    if matches:
        return truncate(" ".join(matches[:3]), 500)
    return truncate(content, 500)


def detect_pain_hints(text: str) -> list[str]:
    normalized = normalize_for_similarity(text)
    hints = sorted(term for term in PAIN_TERMS if term in normalized)
    return hints


def compact_text(text: str) -> str:
    return re.sub(r"\s+", "", normalize_for_similarity(text))


def _contains_pain_term(sentence: str) -> bool:
    lowered = normalize_for_similarity(sentence)
    return any(term in lowered for term in PAIN_TERMS)
