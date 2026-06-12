# Source Adapters

`config/sources.yaml` enables sources. Each adapter declares its stable source
ID, API/feed/web access method, credentials, authorization requirements,
timeout, retry count, and per-minute rate limit.

Core adapters cover GitHub, official websites, news/RSS, Hugging Face, Hacker
News, Reddit, GitLab, npm, PyPI, Docker Hub, Stack Exchange, YouTube, arXiv,
jobs, accelerators, and Open Collective. Discord, Slack, LinkedIn, Facebook
Pages, and Product Hunt remain disabled until their approved credentials and
permissions are configured.

The adapter runtime enforces:

- bounded retries for network and timeout failures;
- per-adapter request throttling;
- in-memory discovery caching with `cache_ttl_seconds`;
- configured request timeouts;
- structured, redacted source errors;
- degraded health after adapter failures;
- deterministic fixtures without network credentials.

Adapters use documented APIs, feeds, and permitted public pages. Operators are
responsible for configuring an identifying user agent where a source requires
one and for honoring the source's robots directives and API terms. The runtime
does not bypass authentication, access controls, CAPTCHAs, or anti-bot systems.

Errors are emitted in `run_summary.json` source signals. Credential values and
authorization query parameters are redacted. A source failure returns partial
results and does not crash unrelated adapters.

## Adding An Adapter

1. Add the stable ID to `CORE_SOURCES` or `RESTRICTED_SOURCES`.
2. Declare credentials, access methods, and permissions in
   `default_capabilities`.
3. Add `_discover_<source_id>` using an official API, feed, or permitted public
   page.
4. Return `SourceCandidate` records with URLs, publication dates, retrieval
   method, and source identifiers.
5. Reuse `fetch`, `normalize`, retry, rate-limit, caching, and error policy.
6. Add deterministic fixture tests and credential-disabled tests.

Do not add anti-bot bypasses, private-channel collection, guessed contacts, or
undocumented endpoints.
