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
- Suppression and blocklist checks run before any provider request.
- No tracking, attachments, guessed emails, or hidden contact sources are allowed.

Rotate any credential that may have appeared in logs or commits.
