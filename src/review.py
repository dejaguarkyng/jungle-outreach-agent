from __future__ import annotations

import argparse
import math
import textwrap
from dataclasses import dataclass
from datetime import date, datetime

from .common import clip_text, parse_timestamp, utc_now
from .logging_utils import get_logger
from .models import LeadRecord, ReplyQueueItem
from .settings import REPLY_QUEUE_PATH, TOP_LEADS_PATH
from .storage import read_leads, read_reply_queue, write_json_items, write_leads

PAGE_SIZE = 5
REVIEW_STATUSES = {"pending", "approved", "rejected", "skipped"}
OUTREACH_STATUSES = {
    "not_contacted",
    "contacted",
    "replied",
    "interested",
    "testing",
    "converted",
}
APPROVED_VARIANTS = {"v1", "v2", "v3", "custom"}


@dataclass
class ReviewFilters:
    status: str | None = None
    platform: str | None = None
    pain_type: str | None = None
    fit_score_min: int | None = None
    final_score_min: float | None = None
    date_from: date | None = None
    date_to: date | None = None
    only_pending_review: bool = False
    search: str | None = None


@dataclass
class ReviewItem:
    lead: LeadRecord
    reply: ReplyQueueItem | None

    @property
    def id(self) -> str:
        return self.lead.id

    @property
    def review_status(self) -> str:
        return self.lead.review_status

    @property
    def outreach_status(self) -> str:
        return self.lead.outreach_status

    @property
    def approved_variant(self) -> str:
        return self.lead.approved_reply_variant

    @property
    def notes(self) -> list[str]:
        return self.lead.notes


class ReviewStore:
    def __init__(self, *, top_path=TOP_LEADS_PATH, reply_path=REPLY_QUEUE_PATH) -> None:
        self.top_path = top_path
        self.reply_path = reply_path
        self.logger = get_logger()
        self.reload()

    def reload(self) -> None:
        self.leads = read_leads(self.top_path)
        self.replies = read_reply_queue(self.reply_path)
        self.leads_by_id = {lead.id: lead for lead in self.leads}
        self.replies_by_id = {item.lead_id: item for item in self.replies}

    def save(self) -> None:
        self.leads = list(self.leads_by_id.values())
        self.replies = list(self.replies_by_id.values())
        write_leads(self.top_path, self.leads)
        write_json_items(self.reply_path, self.replies)

    def items(self) -> list[ReviewItem]:
        ranked = sorted(
            self.leads_by_id.values(),
            key=lambda lead: (lead.post_date, lead.final_score, lead.fit_score),
            reverse=True,
        )
        return [ReviewItem(lead=lead, reply=self.replies_by_id.get(lead.id)) for lead in ranked]

    def get(self, lead_id: str) -> ReviewItem | None:
        lead = self.leads_by_id.get(lead_id)
        if lead is None:
            return None
        return ReviewItem(lead=lead, reply=self.replies_by_id.get(lead_id))

    def apply_action(self, lead_id: str, action: str) -> ReviewItem:
        item = self._require_item(lead_id)
        now = utc_now()

        if action == "approve":
            self._set_review_status(item, "approved", now)
        elif action == "reject":
            self._set_review_status(item, "rejected", now)
        elif action == "skip":
            self._set_review_status(item, "skipped", now)
        elif action in {"contacted", "replied", "interested", "testing", "converted"}:
            self._set_outreach_status(item, action, now)
        else:
            raise ValueError(f"Unsupported action: {action}")

        self.save()
        self.logger.info("review_action lead_id=%s action=%s", lead_id, action)
        return item

    def append_note(self, lead_id: str, note: str) -> ReviewItem:
        item = self._require_item(lead_id)
        now = utc_now()
        cleaned = note.strip()
        if not cleaned:
            return item
        item.lead.notes.append(cleaned)
        item.lead.last_reviewed_at = now
        if item.reply is not None:
            item.reply.notes.append(cleaned)
            item.reply.last_reviewed_at = now
        self.save()
        self.logger.info("review_note_added lead_id=%s", lead_id)
        return item

    def replace_notes(self, lead_id: str, note: str) -> ReviewItem:
        item = self._require_item(lead_id)
        now = utc_now()
        notes = [note.strip()] if note.strip() else []
        item.lead.notes = notes.copy()
        item.lead.last_reviewed_at = now
        if item.reply is not None:
            item.reply.notes = notes.copy()
            item.reply.last_reviewed_at = now
        self.save()
        self.logger.info("review_notes_replaced lead_id=%s", lead_id)
        return item

    def clear_notes(self, lead_id: str) -> ReviewItem:
        return self.replace_notes(lead_id, "")

    def choose_variant(self, lead_id: str, variant: str) -> ReviewItem:
        chosen = variant.strip().lower()
        if chosen not in APPROVED_VARIANTS:
            raise ValueError(f"Unsupported variant: {variant}")
        item = self._require_item(lead_id)
        now = utc_now()
        item.lead.approved_reply_variant = chosen
        item.lead.last_reviewed_at = now
        if item.reply is not None:
            item.reply.approved_reply_variant = chosen
            item.reply.last_reviewed_at = now
        self.save()
        self.logger.info("review_variant_selected lead_id=%s variant=%s", lead_id, chosen)
        return item

    def mark_custom_reply_written(self, lead_id: str) -> ReviewItem:
        item = self._require_item(lead_id)
        now = utc_now()
        item.lead.custom_reply_written = True
        item.lead.approved_reply_variant = "custom"
        item.lead.last_reviewed_at = now
        if item.reply is not None:
            item.reply.custom_reply_written = True
            item.reply.approved_reply_variant = "custom"
            item.reply.last_reviewed_at = now
        self.save()
        self.logger.info("review_custom_reply_written lead_id=%s", lead_id)
        return item

    def _set_review_status(self, item: ReviewItem, review_status: str, now: datetime) -> None:
        item.lead.review_status = review_status
        item.lead.last_reviewed_at = now
        if item.reply is not None:
            item.reply.review_status = review_status
            item.reply.last_reviewed_at = now

    def _set_outreach_status(self, item: ReviewItem, outreach_status: str, now: datetime) -> None:
        item.lead.outreach_status = outreach_status
        item.lead.last_outreach_action_at = now
        if item.lead.review_status == "pending":
            item.lead.review_status = "approved"
            item.lead.last_reviewed_at = now
        if item.reply is not None:
            item.reply.outreach_status = outreach_status
            item.reply.last_outreach_action_at = now
            if item.reply.review_status == "pending":
                item.reply.review_status = "approved"
                item.reply.last_reviewed_at = now

    def _require_item(self, lead_id: str) -> ReviewItem:
        item = self.get(lead_id)
        if item is None:
            raise KeyError(f"Lead not found: {lead_id}")
        return item


def interactive_review(
    *,
    top_path=TOP_LEADS_PATH,
    reply_path=REPLY_QUEUE_PATH,
) -> int:
    store = ReviewStore(top_path=top_path, reply_path=reply_path)
    filters = ReviewFilters()
    page = 1

    while True:
        items = apply_filters(store.items(), filters)
        page = _clamp_page(page, items, PAGE_SIZE)
        render_page(items, page=page, page_size=PAGE_SIZE)
        print("Commands: open <n|id>, next, prev, filters, search <text>, reset, pending, reload, quit")
        raw = input("review> ").strip()
        if not raw:
            continue
        lowered = raw.lower()
        if lowered in {"q", "quit", "exit"}:
            return 0
        if lowered in {"n", "next"}:
            page += 1
            continue
        if lowered in {"p", "prev", "previous"}:
            page = max(1, page - 1)
            continue
        if lowered == "filters":
            filters = prompt_filters(filters)
            page = 1
            continue
        if lowered.startswith("search "):
            filters.search = raw[7:].strip() or None
            page = 1
            continue
        if lowered == "reset":
            filters = ReviewFilters()
            page = 1
            continue
        if lowered == "pending":
            filters.only_pending_review = not filters.only_pending_review
            page = 1
            continue
        if lowered == "reload":
            store.reload()
            page = 1
            continue
        if lowered.startswith("open "):
            token = raw[5:].strip()
            lead_id = resolve_selection(items, token, page, PAGE_SIZE)
            if lead_id is None:
                print("Lead selection not found.")
                continue
            interactive_open(store, lead_id)
            continue
        print("Unknown command.")


def apply_filters(items: list[ReviewItem], filters: ReviewFilters) -> list[ReviewItem]:
    filtered = items
    if filters.only_pending_review:
        filtered = [item for item in filtered if item.review_status == "pending"]
    if filters.status:
        wanted = filters.status.lower()
        filtered = [
            item
            for item in filtered
            if item.review_status.lower() == wanted or item.outreach_status.lower() == wanted
        ]
    if filters.platform:
        filtered = [item for item in filtered if item.lead.platform.lower() == filters.platform.lower()]
    if filters.pain_type:
        filtered = [item for item in filtered if item.lead.pain_type.lower() == filters.pain_type.lower()]
    if filters.fit_score_min is not None:
        filtered = [item for item in filtered if item.lead.fit_score >= filters.fit_score_min]
    if filters.final_score_min is not None:
        filtered = [item for item in filtered if item.lead.final_score >= filters.final_score_min]
    if filters.date_from:
        filtered = [item for item in filtered if item.lead.post_date.date() >= filters.date_from]
    if filters.date_to:
        filtered = [item for item in filtered if item.lead.post_date.date() <= filters.date_to]
    if filters.search:
        term = filters.search.lower()
        filtered = [
            item
            for item in filtered
            if term in item.lead.username.lower()
            or term in item.lead.exact_complaint.lower()
            or term in item.lead.post_url.lower()
        ]
    return filtered


def render_page(items: list[ReviewItem], *, page: int, page_size: int) -> None:
    total_pages = max(1, math.ceil(len(items) / max(1, page_size)))
    page = max(1, min(page, total_pages))
    start = (page - 1) * page_size
    end = start + page_size
    subset = items[start:end]
    print()
    print(f"Lead Review Page {page}/{total_pages} ({len(items)} items)")
    print("-" * 110)
    if not subset:
        print("No leads match the current filters.")
        print("-" * 110)
        return

    for index, item in enumerate(subset, start=1):
        print(
            f"[{index}] {item.lead.platform:<12} {item.lead.username[:18]:<18} "
            f"{item.lead.post_date.date()} {item.lead.pain_type:<22} "
            f"fit={item.lead.fit_score:<2} final={item.lead.final_score:<4} "
            f"review={item.review_status:<9} outreach={item.outreach_status:<12}"
        )
        print(f"    {clip_text(item.lead.exact_complaint, 96)}")
        if item.reply is not None:
            print(f"    reply: {clip_text(item.reply.personalized_opener, 96)}")
        if item.notes:
            print(f"    notes: {clip_text(' | '.join(item.notes), 96)}")
    print("-" * 110)


def render_detail(item: ReviewItem) -> None:
    print()
    print("=" * 110)
    print(f"Lead ID: {item.id}")
    print(f"Platform: {item.lead.platform}")
    print(f"Username: {item.lead.username or '(unknown)'}")
    print(f"Post Date: {item.lead.post_date.isoformat()}")
    print(f"Pain Type: {item.lead.pain_type}")
    print(f"Fit Score: {item.lead.fit_score}")
    print(f"Final Score: {item.lead.final_score}")
    print(f"Review Status: {item.review_status}")
    print(f"Outreach Status: {item.outreach_status}")
    print(f"Approved Variant: {item.approved_variant or '(none)'}")
    print(f"Custom Reply Written: {'yes' if item.lead.custom_reply_written else 'no'}")
    print(f"URL: {item.lead.post_url}")
    print("Complaint:")
    for line in textwrap.wrap(item.lead.exact_complaint, width=100):
        print(f"  {line}")
    print("Notes:")
    if item.notes:
        for note in item.notes:
            print(f"  - {note}")
    else:
        print("  (none)")
    if item.reply is not None:
        print("Reply Variants:")
        print(f"  v1: {item.reply.opener_v1}")
        print(f"  v2: {item.reply.opener_v2}")
        print(f"  v3: {item.reply.opener_v3}")
        print(f"  Recommended: {item.reply.recommended_variant}")
        print(f"  Angle: {item.reply.reply_angle}")
        print(f"  Diagnostic Question: {item.reply.diagnostic_question}")
        print(f"  Why This Fits: {item.reply.why_this_reply_fits}")
        print(f"  Confidence: {item.reply.confidence_score}")
    else:
        print("Reply Variants: (none)")
    print("=" * 110)


def interactive_open(store: ReviewStore, lead_id: str) -> int:
    while True:
        store.reload()
        item = store.get(lead_id)
        if item is None:
            print("Lead not found.")
            return 1
        render_detail(item)
        print("Actions: approve, reject, skip, contacted, replied, interested, testing, converted, note, variant, custom, back")
        raw = input("detail> ").strip()
        if not raw:
            continue
        lowered = raw.lower()
        if lowered in {"b", "back", "quit"}:
            return 0
        if lowered in {"approve", "reject", "skip", "contacted", "replied", "interested", "testing", "converted"}:
            store.apply_action(lead_id, lowered)
            continue
        if lowered == "note":
            edit_notes(store, lead_id)
            continue
        if lowered == "variant":
            variant = input("Choose variant (v1/v2/v3/custom): ").strip().lower()
            if variant:
                try:
                    store.choose_variant(lead_id, variant)
                except ValueError as exc:
                    print(str(exc))
            continue
        if lowered == "custom":
            store.mark_custom_reply_written(lead_id)
            continue
        print("Unknown detail action.")


def edit_notes(store: ReviewStore, lead_id: str) -> None:
    print("Note actions: append, replace, clear, back")
    choice = input("notes> ").strip().lower()
    if choice in {"back", "b", ""}:
        return
    if choice == "append":
        note = input("Append note: ")
        store.append_note(lead_id, note)
        return
    if choice == "replace":
        note = input("Replace notes with: ")
        store.replace_notes(lead_id, note)
        return
    if choice == "clear":
        store.clear_notes(lead_id)
        return
    print("Unknown note action.")


def prompt_filters(current: ReviewFilters) -> ReviewFilters:
    print("Leave blank to keep current value. Use '-' to clear a value.")
    status = _prompt_value("Status", current.status)
    platform = _prompt_value("Platform", current.platform)
    pain_type = _prompt_value("Pain Type", current.pain_type)
    fit_score_min = _prompt_int("Fit Score Min", current.fit_score_min)
    final_score_min = _prompt_float("Final Score Min", current.final_score_min)
    date_from = _prompt_date("Date From (YYYY-MM-DD)", current.date_from)
    date_to = _prompt_date("Date To (YYYY-MM-DD)", current.date_to)
    pending_value = input(f"Only pending review? [{_bool_label(current.only_pending_review)}]: ").strip().lower()
    if pending_value == "-":
        only_pending_review = False
    elif pending_value in {"y", "yes", "true", "1"}:
        only_pending_review = True
    elif pending_value in {"n", "no", "false", "0"}:
        only_pending_review = False
    else:
        only_pending_review = current.only_pending_review
    search = _prompt_value("Search", current.search)
    return ReviewFilters(
        status=status,
        platform=platform,
        pain_type=pain_type,
        fit_score_min=fit_score_min,
        final_score_min=final_score_min,
        date_from=date_from,
        date_to=date_to,
        only_pending_review=only_pending_review,
        search=search,
    )


def resolve_selection(items: list[ReviewItem], token: str, page: int, page_size: int) -> str | None:
    candidate = token.strip()
    if not candidate:
        return None
    if candidate.isdigit():
        index = int(candidate) - 1
        start = (page - 1) * page_size
        target = start + index
        if 0 <= target < len(items):
            return items[target].id
        return None
    for item in items:
        if item.id == candidate:
            return item.id
    return None


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command in {None, "interactive"}:
        return interactive_review()
    if args.command == "list":
        filters = filters_from_args(args)
        store = ReviewStore()
        items = apply_filters(store.items(), filters)
        render_page(items, page=args.page, page_size=args.page_size)
        return 0
    if args.command == "pending":
        store = ReviewStore()
        filters = ReviewFilters(
            status=args.status,
            platform=args.platform,
            pain_type=args.pain_type,
            fit_score_min=args.fit_score_min,
            final_score_min=args.final_score_min,
            date_from=parse_cli_date(args.date_from),
            date_to=parse_cli_date(args.date_to),
            only_pending_review=True,
            search=args.search,
        )
        items = apply_filters(store.items(), filters)
        render_page(items, page=args.page, page_size=args.page_size)
        return 0
    if args.command == "open":
        store = ReviewStore()
        return interactive_open(store, args.id)
    return 1


def filters_from_args(args) -> ReviewFilters:
    return ReviewFilters(
        status=args.status,
        platform=args.platform,
        pain_type=args.pain_type,
        fit_score_min=args.fit_score_min,
        final_score_min=args.final_score_min,
        date_from=parse_cli_date(args.date_from),
        date_to=parse_cli_date(args.date_to),
        only_pending_review=bool(args.only_pending_review),
        search=args.search,
    )


def parse_cli_date(value: str | None) -> date | None:
    if not value:
        return None
    parsed = parse_timestamp(value)
    if parsed is not None:
        return parsed.date()
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Jungle Grid local review workflow")
    subparsers = parser.add_subparsers(dest="command")

    list_parser = subparsers.add_parser("list", help="List reviewable leads")
    _add_filter_args(list_parser)
    list_parser.add_argument("--page", type=int, default=1)
    list_parser.add_argument("--page-size", type=int, default=PAGE_SIZE)

    pending_parser = subparsers.add_parser("pending", help="List only pending review items")
    _add_filter_args(pending_parser)
    pending_parser.add_argument("--page", type=int, default=1)
    pending_parser.add_argument("--page-size", type=int, default=PAGE_SIZE)

    open_parser = subparsers.add_parser("open", help="Open a lead for interactive review")
    open_parser.add_argument("--id", required=True, help="Lead ID to review")

    subparsers.add_parser("interactive", help="Start the interactive review browser")
    return parser


def _add_filter_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--status")
    parser.add_argument("--platform")
    parser.add_argument("--pain-type")
    parser.add_argument("--fit-score-min", type=int)
    parser.add_argument("--final-score-min", type=float)
    parser.add_argument("--date-from")
    parser.add_argument("--date-to")
    parser.add_argument("--only-pending-review", action="store_true")
    parser.add_argument("--search")


def _prompt_value(label: str, current):
    raw = input(f"{label} [{current if current is not None else ''}]: ").strip()
    if not raw:
        return current
    if raw == "-":
        return None
    return raw


def _prompt_int(label: str, current):
    raw = input(f"{label} [{current if current is not None else ''}]: ").strip()
    if not raw:
        return current
    if raw == "-":
        return None
    try:
        return int(raw)
    except ValueError:
        return current


def _prompt_float(label: str, current):
    raw = input(f"{label} [{current if current is not None else ''}]: ").strip()
    if not raw:
        return current
    if raw == "-":
        return None
    try:
        return float(raw)
    except ValueError:
        return current


def _prompt_date(label: str, current):
    raw = input(f"{label} [{current.isoformat() if current is not None else ''}]: ").strip()
    if not raw:
        return current
    if raw == "-":
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return current


def _bool_label(value: bool) -> str:
    return "y" if value else "n"


def _clamp_page(page: int, items: list[ReviewItem], page_size: int) -> int:
    total_pages = max(1, math.ceil(len(items) / max(1, page_size)))
    return max(1, min(page, total_pages))


if __name__ == "__main__":
    raise SystemExit(main())
