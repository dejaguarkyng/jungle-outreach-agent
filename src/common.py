from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
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

NORMALIZATION_REPLACEMENTS = (
    (r"\bcan't\b", "cannot"),
    (r"\bcant\b", "cannot"),
    (r"\banother option\b", "alternative"),
    (r"\boption\b", "alternative"),
    (r"\binstances?\b", "capacity"),
    (r"\bvm\b", "instance"),
    (r"\bcurrent\b", ""),
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def clip_text(text: str, limit: int) -> str:
    cleaned = normalize_whitespace(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def parse_timestamp(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)

    candidate = str(value).strip()
    if not candidate:
        return None

    try:
        if candidate.endswith("Z"):
            candidate = candidate[:-1] + "+00:00"
        parsed = datetime.fromisoformat(candidate)
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url or "")
    if not parsed.netloc and not parsed.path:
        return ""
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


def normalize_for_similarity(text: str) -> str:
    normalized = re.sub(r"https?://\S+", " ", text or "").lower()
    for pattern, replacement in NORMALIZATION_REPLACEMENTS:
        normalized = re.sub(pattern, replacement, normalized)
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    return normalize_whitespace(normalized)


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
    sequence_score = SequenceMatcher(None, left_norm, right_norm).ratio()
    left_tokens = tokenize(left_norm)
    right_tokens = tokenize(right_norm)
    token_score = jaccard_similarity(left_tokens, right_tokens)
    overlap = len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))
    return round((0.4 * sequence_score) + (0.25 * token_score) + (0.35 * overlap), 4)


def complaint_hash(text: str) -> str:
    normalized = normalize_for_similarity(text)
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()


def stable_lead_id(platform: str, post_url: str, complaint: str) -> str:
    seed = "||".join(
        [
            normalize_whitespace(platform).lower(),
            canonicalize_url(post_url),
            normalize_for_similarity(complaint),
        ]
    )
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
