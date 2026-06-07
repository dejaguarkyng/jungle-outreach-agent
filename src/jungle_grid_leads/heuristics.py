from __future__ import annotations

from .config import CompanyConfig
from .models import (
    ClassifiedLead,
    DedupedLead,
    LeadCategory,
    LeadClassification,
    LeadScore,
    OutreachDraft,
    ScoredLead,
)
from .text_utils import normalize_for_similarity, strip_markdown, truncate

CATEGORY_KEYWORDS: dict[LeadCategory, tuple[str, ...]] = {
    LeadCategory.PROVIDER_PAIN: (
        "provider",
        "cloud",
        "quota",
        "quotas",
        "capacity",
        "pricing",
        "spot",
        "billing",
        "availability",
        "unreliable",
        "support",
        "instance",
        "gpu cloud",
    ),
    LeadCategory.GPU_SELECTION_PAIN: (
        "which gpu",
        "choose gpu",
        "select gpu",
        "gpu selection",
        "a100",
        "h100",
        "l40",
        "l40s",
        "4090",
        "vram",
        "throughput",
        "what gpu",
        "t4",
        "a10",
        "cost/performance",
    ),
    LeadCategory.DEPLOYMENT_PAIN: (
        "deploy",
        "deployment",
        "serving",
        "inference",
        "production",
        "prod",
        "autoscaling",
        "latency",
        "cold start",
        "kubernetes",
        "docker",
        "triton",
        "vllm",
        "ray serve",
        "endpoint",
        "rollout",
    ),
}

NON_FIT_KEYWORDS = (
    "gaming",
    "frame rate",
    "fps",
    "pc build",
    "minecraft",
    "fortnite",
    "consumer build",
    "desktop build",
)

# Patterns that indicate automated/bot-generated content rather than human pain signals.
# Must match the output of normalize_for_similarity (lowercase, alphanumeric + spaces only, single spaces).
AUTOMATED_CONTENT_PATTERNS = (
    "ai analysis",
    "affected job",
    "buildkite",
    "codebase snapshot",
    "python modules",
    "knowledge stream",
    "roadmap updates",
    "numerical precision mismatch",
    "logprob mismatch",
    "docker daemon",
    "test failure",
    "grouped by knowledge stream",
)

URGENCY_TERMS = ("urgent", "asap", "stuck", "blocked", "need help", "can't", "cannot", "failing")
BUYER_TERMS = ("team", "startup", "company", "customer", "budget", "paying", "our service", "our users", "our customers")
SWITCH_TERMS = ("alternative", "switch", "migrate", "move off", "leave", "replace", "recommend")


def classify_lead_heuristic(lead: DedupedLead) -> LeadClassification:
    text = normalize_for_similarity(f"{lead.title} {lead.complaint_text} {lead.full_text}")
    if not text:
        return LeadClassification(
            category=LeadCategory.NON_FIT,
            rationale="Lead has no usable text to classify.",
            confidence=0.2,
        )

    if any(term in text for term in NON_FIT_KEYWORDS):
        return LeadClassification(
            category=LeadCategory.NON_FIT,
            rationale="Lead appears focused on consumer or gaming GPU usage rather than AI infrastructure pain.",
            confidence=0.86,
        )

    if any(pattern in text for pattern in AUTOMATED_CONTENT_PATTERNS):
        return LeadClassification(
            category=LeadCategory.NON_FIT,
            rationale="Lead appears to be auto-generated CI/CD output or a bot report, not a human pain signal.",
            confidence=0.90,
        )

    scores: dict[LeadCategory, int] = {}
    matched_terms: dict[LeadCategory, list[str]] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        matches = [keyword for keyword in keywords if keyword in text]
        matched_terms[category] = matches
        scores[category] = len(matches)

    best_category = max(scores, key=scores.get)
    best_score = scores[best_category]
    if best_score == 0:
        return LeadClassification(
            category=LeadCategory.NON_FIT,
            rationale="No strong provider, GPU selection, or deployment pain signals were detected.",
            confidence=0.55,
        )

    rationale = f"Matched {best_category.value} terms: " + ", ".join(matched_terms[best_category][:4])
    confidence = min(0.95, 0.45 + (0.11 * best_score))
    return LeadClassification(category=best_category, rationale=rationale, confidence=confidence)


def score_lead_heuristic(lead: ClassifiedLead) -> LeadScore:
    text = normalize_for_similarity(f"{lead.title} {lead.complaint_text} {lead.full_text}")
    if lead.classification.category == LeadCategory.NON_FIT:
        return LeadScore(
            fit_score=1,
            rationale="Classified as non-fit, so the lead is not a strong Jungle Grid prospect.",
            buying_signals=[],
        )

    score = 3
    signals: list[str] = [f"Pain category: {lead.classification.category.value}"]

    if any(term in text for term in URGENCY_TERMS):
        score += 2
        signals.append("Urgency or blocker language is present.")
    if any(term in text for term in BUYER_TERMS):
        score += 2
        signals.append("The post hints at a team, company, or production workload.")
    if any(term in text for term in SWITCH_TERMS):
        score += 2
        signals.append("The author appears open to alternatives or switching providers.")
    if "gpu" in text and any(term in text for term in ("cost", "pricing", "quota", "latency", "deploy", "serving")):
        score += 1
        signals.append("The issue is close to GPU infrastructure buying criteria.")
    if lead.source.value == "hackernews":
        score += 1
        signals.append("Hacker News posts often correlate with technical operators and founders.")

    if "student" in text or "course project" in text:
        score -= 2
        signals.append("Language suggests early-stage experimentation rather than near-term buying.")

    fit_score = max(0, min(score, 10))
    rationale = " ".join(signals)
    return LeadScore(fit_score=fit_score, rationale=rationale, buying_signals=signals)


def draft_outreach_heuristic(lead: ScoredLead, company: CompanyConfig) -> OutreachDraft:
    category_reason = {
        LeadCategory.PROVIDER_PAIN: "finding a more reliable GPU provider path",
        LeadCategory.GPU_SELECTION_PAIN: "choosing the right GPU without overbuying",
        LeadCategory.DEPLOYMENT_PAIN: "getting AI workloads deployed without the usual infra drag",
        LeadCategory.NON_FIT: "an AI infrastructure workflow",
    }[lead.classification.category]

    pain_summary = truncate(strip_markdown(lead.complaint_text or lead.full_text), 160)
    subject = f"Possible shortcut for {category_reason}"
    greeting = f"Hi {lead.author}," if lead.author else "Hi,"
    message = (
        f"{greeting}\n\n"
        f"I came across your post about {pain_summary}. "
        f"{company.company_name} helps teams with {category_reason}, especially when GPU access, selection, "
        f"or deployment issues start slowing real work down.\n\n"
        f"If it helps, I can send a short note on how we would approach this use case and where we might save time.\n\n"
        f"Best,\nJungle Grid"
    )
    specific_signals = [s for s in lead.score.buying_signals if not s.startswith("Pain category:")]
    signals_note = (" Key signals: " + "; ".join(specific_signals[:2]) + ".") if specific_signals else ""
    why_jungle_grid = (
        f"{company.company_name} is relevant because the lead is dealing with {lead.classification.category.value} "
        f"and shows signals of active AI infrastructure pain.{signals_note}"
    )
    return OutreachDraft(
        subject=subject,
        message=message,
        why_jungle_grid=why_jungle_grid,
        call_to_action="Offer a short, manual follow-up note or a quick call.",
    )
