# Prospect Pipeline Upgrade Plan

## Scope

Upgrade the artifact-producing outreach worker without breaking the six-file
artifact contract consumed by the dashboard. Keep existing local-template and
Jungle Grid Qwen modes, but make qualification, scoring, fallback reporting,
and draft validation fail closed.

## Implementation Steps

1. Add a source adapter interface and registry with explicit capabilities,
   credentials, health, permissions, rate limits, and safe disabled states for
   core and authorization-dependent sources.
2. Add canonical evidence/contact/entity helpers in the worker so claims,
   scores, contacts, and drafts reference clean, structured evidence.
3. Harden content extraction and contamination detection to reject CSS, badges,
   navigation, malformed markup, and boilerplate before evidence creation.
4. Replace keyword-only qualification and ungrounded scoring with evidence-bound
   gates, score caps, explicit generic-package exclusions, and outreach angles.
5. Track primary model and fallback attempts separately; make fallback drafts
   manual-review only and mark fallback-only runs degraded.
6. Expand worker and shared TypeScript validation to semantic statuses:
   `send_ready`, `manual_review_required`, `regeneration_required`, `excluded`.
7. Update configuration, examples, and docs for sources, evidence, scoring,
   validation, privacy, migration notes, and degraded/fallback troubleshooting.
8. Add deterministic regression coverage for keyword false positives,
   contamination rejection, evidence caps, fallback-only degradation, disabled
   adapters, partial source failure, contact precedence, and control-plane angle
   selection.

## Audit Findings

- Baseline `npm test`: passed, 12 files / 33 tests.
- Baseline `npm run test:python`: passed, 7 worker tests.
- `pytest` and `python3 -m pytest` are unavailable in the environment.
- Generic queues scored too highly because `queue` is treated as a concrete
  workload signal and scores are assigned from keyword presence.
- CSS and boilerplate survived because `clean_research_text` removes tags and
  badges but does not reject CSS declarations, Astro attributes, keyframes, or
  large link-reference blocks before evidence extraction.
- Validation passed fallback drafts because status was a boolean-like
  `passed/failed` check and `model_mode=fallback` was not semantic failure.
- Fallback was used when Ollama/model startup, pull, generation, or validation
  failed and `LLM_FALLBACK_MODE=template` allowed templates.
