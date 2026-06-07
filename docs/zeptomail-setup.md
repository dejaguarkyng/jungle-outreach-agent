# ZeptoMail Setup

ZeptoMail is used only after a human approves a validated internal draft. The
Jungle Grid worker never receives ZeptoMail credentials and never sends email.

## Create Credentials

1. Create or select a ZeptoMail Agent in the Zoho ZeptoMail console.
2. Verify the sender domain for the Agent.
3. Create a send-mail token for API access.
4. Copy the API base URL for your account or region. The documented global send
   endpoint is `https://api.zeptomail.com/v1.1/email`, but this app requires
   `ZEPTOMAIL_API_BASE` to be configured explicitly because account regions can
   differ.

Set `ZEPTOMAIL_API_BASE` to the base host, for example
`https://api.zeptomail.com`. If `/v1.1` or `/v1.1/email` is included, the
service normalizes it before appending `/v1.1/email`.

## Sender Verification

ZeptoMail requires the sender domain to be verified. Follow the official domain
setup flow and publish the required DKIM TXT and CNAME DNS records. If sender
address restrictions are enabled for the domain, also add the exact sender
address configured in `ZEPTOMAIL_FROM_EMAIL`.

The app can validate local configuration, but it cannot fully prove account-side
domain verification before the first provider request. Sender-domain failures
are surfaced from ZeptoMail as delivery/configuration errors.

## Required Environment

```bash
ZEPTOMAIL_API_KEY=
ZEPTOMAIL_API_BASE=
ZEPTOMAIL_FROM_EMAIL=bbg@junglegrid.dev
ZEPTOMAIL_FROM_NAME=Benedict from Jungle Grid
ZEPTOMAIL_REPLY_TO=bbg@junglegrid.dev
ZEPTOMAIL_TEST_RECIPIENT=
EMAIL_SEND_MODE=disabled
DRY_RUN=true
```

Keep `EMAIL_SEND_MODE=disabled` and `DRY_RUN=true` during initial setup. To allow
manual dashboard sends, set `EMAIL_SEND_MODE=manual_approval_only` and
`DRY_RUN=false` only after confirming the use case complies with ZeptoMail rules
and applicable law.

## Test Send

Configure `ZEPTOMAIL_TEST_RECIPIENT`, then run:

```bash
npm run outreach:zeptomail:test
```

The test uses the same plain-text API path as production sends. It does not use
attachments, HTML, tracking pixels, click tracking, open tracking, or any hosted
LLM provider.

## Manual Approval Flow

1. Jungle Grid returns validated draft artifacts.
2. The backend revalidates artifacts and stores internal drafts.
3. An operator reviews evidence, email source URL, claims, word count, and link
   validation in the dashboard.
4. The operator clicks `Approve` or `Reject`.
5. An approved draft can be sent with a separate `Send approved` click.
6. Bulk send only includes approved drafts and requires typing
   `SEND APPROVED DRAFTS`.

The app never schedules sends, never sends unapproved drafts, never sends failed
validation records, and never silently falls back to another sender.

## Common Errors

- Invalid or missing token: verify `ZEPTOMAIL_API_KEY` and the
  `Zoho-enczapikey` token type.
- Missing or wrong API base: set `ZEPTOMAIL_API_BASE` for the account region.
- Sender domain not verified: complete ZeptoMail domain verification and DNS.
- Sender address restricted: add the exact `ZEPTOMAIL_FROM_EMAIL` in ZeptoMail.
- Account not reviewed or limits exceeded: review ZeptoMail account status and
  Agent limits.
- Validation blocked locally: check word count, the single allowed link,
  evidence URLs, suppression/blocklist status, approval status, and dry-run
  mode.

## Compliance Notes

The official ZeptoMail documentation positions the product for transactional
email and states that bulk, promotional, newsletter, or marketing email is not
supported. This outreach app is therefore send-disabled by default. Use
ZeptoMail sending only for a compliant manually approved use case; otherwise use
the app for research and internal draft review only.

See [zeptomail-implementation-notes.md](zeptomail-implementation-notes.md) for
the documented endpoint, auth method, payload shape, errors, limits, and source
links.
