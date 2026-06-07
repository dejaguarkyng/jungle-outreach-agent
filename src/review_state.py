from __future__ import annotations

from .models import LeadRecord, ReplyQueueItem

LEAD_REVIEW_FIELDS = (
    "review_status",
    "outreach_status",
    "approved_reply_variant",
    "custom_reply_written",
    "notes",
    "last_reviewed_at",
    "last_outreach_action_at",
)

REPLY_REVIEW_FIELDS = (
    "review_status",
    "outreach_status",
    "approved_reply_variant",
    "custom_reply_written",
    "notes",
    "last_reviewed_at",
    "last_outreach_action_at",
)


def merge_lead_review_state(current: list[LeadRecord], existing: list[LeadRecord]) -> list[LeadRecord]:
    existing_by_id = {lead.id: lead for lead in existing}
    merged: list[LeadRecord] = []
    for lead in current:
        previous = existing_by_id.get(lead.id)
        merged.append(_apply_fields(lead, previous, LEAD_REVIEW_FIELDS))
    return merged


def merge_reply_review_state(current: list[ReplyQueueItem], existing: list[ReplyQueueItem]) -> list[ReplyQueueItem]:
    existing_by_id = {item.lead_id: item for item in existing}
    merged: list[ReplyQueueItem] = []
    for item in current:
        previous = existing_by_id.get(item.lead_id)
        merged.append(_apply_fields(item, previous, REPLY_REVIEW_FIELDS))
    return merged


def _apply_fields(current, previous, fields: tuple[str, ...]):
    if previous is None:
        return current
    for field_name in fields:
        setattr(current, field_name, getattr(previous, field_name))
    return current
