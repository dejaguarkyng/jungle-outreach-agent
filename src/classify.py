from __future__ import annotations

from . import llm
from .common import clip_text, normalize_for_similarity
from .logging_utils import get_logger
from .models import LeadRecord
from .settings import PROMPTS_DIR, QUALIFIED_LEADS_PATH
from .storage import read_leads, write_leads

PROVIDER_KEYWORDS = (
    "runpod",
    "vast",
    "lambda",
    "provider",
    "quota",
    "capacity",
    "unreliable",
    "instability",
    "preempted",
    "spot",
    "billing",
    "pricing",
    "retry",
    "retries",
)

GPU_SELECTION_KEYWORDS = (
    "which gpu",
    "choose gpu",
    "gpu choice",
    "a100",
    "h100",
    "l40",
    "l40s",
    "l4",
    "t4",
    "vram",
    "cost performance",
    "cost/performance",
)

DEPLOYMENT_KEYWORDS = (
    "deploy",
    "deployment",
    "serving",
    "inference",
    "endpoint",
    "latency",
    "vllm",
    "triton",
    "autoscaling",
    "kubernetes",
    "production",
    "pipeline",
)

NON_FIT_KEYWORDS = (
    "cuda",
    "cudnn",
    "pytorch bug",
    "tensorflow bug",
    "framework bug",
    "segmentation fault",
    "compiler error",
    "local bug",
    "stack trace",
    "fortnite",
    "gaming",
)


def run(
    leads: list[LeadRecord] | None = None,
    *,
    input_path=None,
    output_path=None,
) -> list[LeadRecord]:
    logger = get_logger()
    current = leads or read_leads(input_path or QUALIFIED_LEADS_PATH)
    classified: list[LeadRecord] = []
    for lead in current:
        category = _classify(lead.exact_complaint, logger)
        lead.pain_type = category
        lead.status = "classified"
        classified.append(lead)
    write_leads(output_path or QUALIFIED_LEADS_PATH, classified)
    return classified


def _classify(text: str, logger=None) -> str:
    normalized = normalize_for_similarity(text)
    if any(keyword in normalized for keyword in NON_FIT_KEYWORDS):
        return "non_fit"
    provider_hits = sum(1 for keyword in PROVIDER_KEYWORDS if keyword in normalized)
    gpu_hits = sum(1 for keyword in GPU_SELECTION_KEYWORDS if keyword in normalized)
    deployment_hits = sum(1 for keyword in DEPLOYMENT_KEYWORDS if keyword in normalized)
    best = max(
        {
            "provider_pain": provider_hits,
            "gpu_selection_pain": gpu_hits,
            "deployment_pain": deployment_hits,
        }.items(),
        key=lambda item: item[1],
    )
    if best[1] > 0:
        return best[0]
    # Keyword pass found nothing — try LLM before dropping as non_fit
    if llm.available():
        try:
            result = _llm_classify(text)
            if logger:
                logger.info("classify_llm_fallback result=%s text_prefix=%s", result, text[:80])
            return result
        except Exception as exc:
            if logger:
                logger.warning("classify_llm_fallback_failed error=%s", exc)
    return "non_fit"


def _llm_classify(text: str) -> str:
    system = (PROMPTS_DIR / "classifier.md").read_text(encoding="utf-8")
    result = llm.call_json(system, clip_text(text, 800))
    category = str(result.get("category", "non_fit")).strip()
    valid = {"provider_pain", "gpu_selection_pain", "deployment_pain", "non_fit"}
    return category if category in valid else "non_fit"
