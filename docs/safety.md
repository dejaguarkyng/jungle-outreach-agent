# Safety

## Contact policy

The system accepts professional addresses explicitly published on official
websites, GitHub profiles, repository contact documentation, project docs, or
package pages. It rejects guesses, broker lists, leaked data, hidden data,
placeholder addresses, no-reply addresses, and unrelated commit metadata.

Every accepted email retains its source URL.

## Draft policy

- Fit score must meet the configured threshold.
- Public evidence and personalization claims are required.
- Weak evidence causes a skip.
- Bodies contain 60–80 words.
- Subjects contain fewer than 80 characters.
- The only link is https://junglegrid.dev.
- HTML, tracking, pixels, attachments, and extra resources are rejected.
- Duplicate emails and per-domain caps are enforced.

## Human review

Worker output is data only. The backend validates it again before persistence.
Drafts are stored internally as `pending_review`. Operators must review the
email source URL, evidence URLs, personalization claims, exact word count, and
link validation before approving.

ZeptoMail sending is disabled by default. When enabled, the app still sends only
after an explicit dashboard click on an approved draft. Bulk send is restricted
to already-approved drafts and requires typing `SEND APPROVED DRAFTS`.
Unapproved, rejected, invalid, suppressed, blocked, dry-run, or already-sent
drafts fail closed before the provider is contacted.

ZeptoMail is documented for transactional email, not generic marketing. Keep
`EMAIL_SEND_MODE=disabled` unless the operator has confirmed the use case is
compliant with ZeptoMail rules and applicable law.

## Abuse response

Use blocklist or suppression controls immediately for opt-outs, unsafe domains,
incorrect contacts, delivery complaints, or compliance concerns. Report systemic
bypasses through `SECURITY.md`.
