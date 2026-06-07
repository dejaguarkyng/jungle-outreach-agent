from __future__ import annotations

import time

from src.logging_utils import get_logger
from src.pipeline import run_all
from src.settings import TOP_LEADS_PATH
from src.storage import read_leads

INTERVAL_SECONDS = 3600
HOT_LEAD_FIT_THRESHOLD = 9


def run_once() -> None:
    logger = get_logger()
    summary = run_all()
    logger.info(
        "runner_cycle collected=%s filtered=%s qualified=%s",
        summary.collected,
        summary.filtered,
        summary.qualified,
    )
    _notify_hot_leads(logger)


def _notify_hot_leads(logger) -> None:
    leads = read_leads(TOP_LEADS_PATH)
    hot = [lead for lead in leads if lead.fit_score >= HOT_LEAD_FIT_THRESHOLD and lead.review_status == "pending"]
    if not hot:
        return
    logger.warning("HOT_LEADS_PENDING count=%s", len(hot))
    for lead in hot:
        logger.warning(
            "hot_lead id=%s platform=%s username=%s fit=%s final=%.2f url=%s",
            lead.id,
            lead.platform,
            lead.username,
            lead.fit_score,
            lead.final_score,
            lead.post_url,
        )


def main() -> int:
    logger = get_logger()
    logger.info("runner_started interval_seconds=%s", INTERVAL_SECONDS)
    while True:
        started = time.monotonic()
        try:
            run_once()
        except KeyboardInterrupt:
            logger.info("runner_stopped reason=keyboard_interrupt")
            return 0
        except Exception as exc:
            logger.exception("runner_cycle_failed error=%s", exc)

        elapsed = time.monotonic() - started
        sleep_seconds = max(0.0, INTERVAL_SECONDS - elapsed)
        logger.info("runner_sleep seconds=%.2f", sleep_seconds)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
