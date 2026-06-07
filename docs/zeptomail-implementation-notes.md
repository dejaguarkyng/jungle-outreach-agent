# ZeptoMail Implementation Notes

Last reviewed: 2026-06-06

These notes are based on the official Zoho ZeptoMail documentation linked below. The app must treat these details as the integration contract and must not invent alternate endpoints, headers, or payload shapes.

## Official API Details

- Email send endpoint path: `POST /v1.1/email`.
- Official documented API URL: `https://api.zeptomail.com/v1.1/email`.
- Base URL must remain configurable via `ZEPTOMAIL_API_BASE` because official examples also show regional or product host variants in nearby API docs and examples. The service should append `/v1.1/email` to the configured base URL.
- Auth method: HTTP `Authorization` header using `Zoho-enczapikey <send-mail-token>`.
- Required request headers: `Accept: application/json` and `Content-Type: application/json`.
- Required payload fields for this app:
  - `from`: `{ "address": "...", "name": "..." }`
  - `to`: `[ { "email_address": { "address": "...", "name": "..." } } ]`
  - `reply_to`: `[ { "address": "...", "name": "..." } ]`
  - `subject`: string
  - `textbody`: string
- The official API supports `htmlbody`, attachments, inline images, click tracking, and open tracking. This app must not use those fields because the project safety rules require plain content, no attachments, and no tracking pixels.

## Sender And Domain Verification

- ZeptoMail requires the sender email domain to be verified in the ZeptoMail Agent.
- Domain verification is performed through DKIM TXT and CNAME DNS records.
- If sender address restrictions are enabled for a verified domain, the exact sender address must also be configured in ZeptoMail.
- The app cannot fully verify the account-side domain state with the send-mail token alone. It should fail closed when local config is missing, and surface provider errors such as unverified sender domain when the API returns them.

## Responses And Errors

- Success responses contain a `data` array and a `request_id`.
- Failure responses contain an `error` object with `code`, `details`, `message`, and `request_id`.
- The service should normalize failures into `{ statusCode, code, message, rawError }`.
- Relevant official error examples include invalid JSON (`SM_101`), invalid token (`SERR_157`), account not reviewed (`SM_128`), sender domain not verified (`SM_111`), daily limit exhausted (`SMI_115`), and trial sending limit exceeded (`SM_133`).

## Rate Limits And Test Mode

- ZeptoMail supports per-Agent blocking and warning limits configured in account settings. If the blocking limit is exceeded through the API, ZeptoMail reports `SM_151`.
- New accounts may be subject to review-period limits documented by ZeptoMail.
- I did not find an official sandbox API mode in the inspected docs. The app should provide only a controlled `POST /api/zeptomail/test` endpoint that sends to `ZEPTOMAIL_TEST_RECIPIENT`.

## Compliance Decision

ZeptoMail's official docs repeatedly state that ZeptoMail is for transactional email and does not support bulk, promotional, newsletter, or marketing email. This outreach app is not automatically a transactional-email use case. Therefore:

- ZeptoMail sending must be disabled by default in example configuration.
- Operators may enable `EMAIL_SEND_MODE=manual_approval_only` only after confirming their use case complies with ZeptoMail's rules and applicable law.
- The product must keep manual approval, suppression/blocklist checks, validation, no tracking, and no attachments even when sending is enabled.
- If the operator cannot confirm compliance, use the app for research and internal draft review only.

## Official Sources

- Email Sending API: https://www.zoho.com/zeptomail/help/api/email-sending.html
- API index: https://www.zoho.com/zeptomail/help/api-index.html
- API error codes: https://www.zoho.com/zeptomail/help/api/error-codes.html
- Sending limits: https://www.zoho.com/zeptomail/help/email-limits.html
- Domain addition and verification: https://www.zoho.com/zeptomail/help/domains.html
- Domains section and sender address restrictions: https://www.zoho.com/zeptomail/help/domains-section.html
- Getting started and account review limits: https://www.zoho.com/zeptomail/help/getting-started.html
