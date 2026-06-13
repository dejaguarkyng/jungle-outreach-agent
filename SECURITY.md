# Security Policy

## Supported versions

Security fixes are applied to the latest release and `main`.

## Reporting

Do not file public issues for token exposure, provider weaknesses, contact-data
leaks, validation bypasses, or any path that could create or send email without
review. Email `security@junglegrid.dev` with reproduction steps and impact.

## Security boundaries

- Secrets stay in environment variables and are redacted from logs.
- `.env` and local databases are ignored.
- Worker inputs contain public professional evidence only.
- Artifact validation fails closed.
- ZeptoMail sending is disabled by default and requires explicit manual approval.
- Every first-touch message requires operator approval regardless of autonomy.
- Browser sessions use AES-256-GCM encryption through
  `OPENLINE_SESSION_ENCRYPTION_KEY` and never enter Jungle Grid jobs or logs.
- Browser delivery requires a domain allowlist and active operator
  authorization, and aborts on CAPTCHA, 2FA, expiry, warnings, permission
  changes, or unknown form structure.
- Redacted delivery screenshots expire after seven days by default.
- Suppression and blocklist checks run before any provider request.
- No tracking, attachments, guessed emails, or hidden contact sources are allowed.

Rotate any credential that may have appeared in logs or commits.
