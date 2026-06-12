/goal Upgrade the existing Jungle Grid prospect-research system into a production-ready, multi-source prospect discovery and outreach intelligence pipeline.

Work autonomously until the objective is fully implemented, tested, documented, and audited against the acceptance criteria below. Do not stop after producing a plan or partial scaffolding. Inspect the repository, understand its current architecture, follow AGENTS.md/CONTRIBUTING.md and existing conventions, then implement the best solution that fits the codebase.

BACKGROUND

The current pipeline discovers prospects, researches them, scores them, finds publicly listed contact details, and generates Jungle Grid outreach drafts.

A recent run exposed severe semantic failures:

- Generic packages such as `sindresorhus/yocto-queue` and `feross/queue-microtask` were classified as AI prospects merely because their descriptions contained “queue”.
- Generic utilities received AI workload relevance and infrastructure pain scores of 20/20.
- CSS, navigation text, badges and page boilerplate were stored as evidence and inserted into emails.
- Every generated draft used fallback mode, but the run was still marked valid.
- `evidence_strength` was 1 while fit scores reached 98–100.
- “The repo is active” was claimed without commit, release or issue evidence.
- Draft validation checked structure but failed to detect broken language, unsupported claims, irrelevant prospects and contaminated evidence.
- The system used one generic “replace your queueing and retries” pitch even when a prospect had already built its own control plane.
- The output reported five passed drafts even though none should have been automatically send-ready.

The upgraded system must fix those issues while adding multiple high-signal discovery sources.

PRIMARY OBJECTIVE

Build a source-adapter architecture that can discover and enrich prospects from:

Core sources:
1. Existing GitHub integration
2. Official websites
3. News websites and RSS/Atom feeds
4. Hugging Face Hub
5. Hacker News, especially Show HN
6. Reddit
7. GitLab
8. npm
9. PyPI
10. Docker Hub or compatible container registry metadata
11. Stack Exchange / Stack Overflow
12. YouTube
13. arXiv
14. Public job listings and company career pages
15. Accelerator, incubator, demo-day and hackathon directories
16. Open-source funding/project directories such as Open Collective

Restricted or authorization-dependent adapters:
17. Discord servers where an authorized bot has explicitly been installed
18. Slack workspaces where an authorized application has explicitly been installed
19. LinkedIn enrichment through approved APIs, user-provided URLs, licensed providers, or manually supplied/exported data
20. Public Facebook Page enrichment through approved Meta APIs or user-provided URLs
21. Product Hunt only when API use and applicable commercial permission/configuration are available

Do not bypass authentication, anti-bot systems, access controls, CAPTCHAs, robots directives, API restrictions or platform terms. Do not scrape private messages, private groups, hidden channels, personal profiles at scale, member lists or non-public data. Use official APIs, feeds, documented endpoints and permitted public pages wherever possible.

LinkedIn and Facebook must be enrichment adapters, not unrestricted bulk scrapers. Discord and Slack must only process channels visible to an explicitly authorized bot/app.

FIRST: AUDIT THE EXISTING REPOSITORY

Before editing:

- Read the repository instructions, architecture, configuration, schemas and tests.
- Locate the current discovery, scraping, research, scoring, contact enrichment, drafting, validation and reporting stages.
- Determine why fallback generation was used.
- Determine why irrelevant queue packages received high scores.
- Determine why CSS and boilerplate survived extraction.
- Determine why validation marked all drafts as passed.
- Run the existing test suite and record the baseline.
- Preserve useful behavior and avoid rewriting unrelated components.

Write a concise implementation plan in the repository’s normal planning location if one exists, then immediately execute it.

ARCHITECTURE

Introduce or refine a clean adapter interface equivalent to:

interface ProspectSourceAdapter {
  readonly sourceType: SourceType;
  readonly capabilities: SourceCapabilities;

  discover(
    query: DiscoveryQuery,
    context: DiscoveryContext
  ): Promise<SourceCandidate[]>;

  fetch(
    candidate: SourceCandidate,
    context: FetchContext
  ): Promise<RawSourceDocument[]>;

  normalize(
    documents: RawSourceDocument[],
    context: NormalizationContext
  ): Promise<SourceEvidence[]>;

  healthCheck?(): Promise<SourceHealth>;
}

Adapt this to the repository’s language and conventions rather than forcing TypeScript if the project is not TypeScript.

Every adapter must:

- have an explicit stable source identifier;
- declare required credentials and permissions;
- support timeouts, retries and rate limits;
- return structured errors instead of crashing the whole run;
- identify whether its output came from an API, feed or webpage;
- preserve source URL, publication date, retrieval date and source type;
- expose health/degraded/unavailable status;
- be independently configurable and disableable;
- support fixture-based tests without live credentials;
- avoid silently falling back to unrelated scraping behavior.

Create an adapter registry so sources can be enabled through configuration rather than hard-coded branches.

SOURCE-SPECIFIC BEHAVIOR

News/RSS:
- Monitor recent AI product launches, open-source releases, funding, technical launches and infrastructure announcements.
- Resolve the article to the actual company, project, official domain and repository.
- Use the article as a “why now” signal.
- Do not use an article author’s email as the prospect contact.
- Detect syndicated copies so repeated press releases do not count as independent evidence.

Hugging Face:
- Discover relevant models, Spaces, datasets and organizations.
- Prioritize model serving, inference, fine-tuning, training, multimodal generation, batch workloads and GPU-backed projects.
- Follow repository, organization and official website links.
- Do not assume every model publisher is a commercial prospect.

Hacker News:
- Monitor recent Show HN and relevant discussions.
- Capture launch timing, project links, author identity when publicly linked and technical pain expressed in comments.
- Resolve contacts through official project sources.

Reddit:
- Treat posts and comments primarily as pain and discovery signals.
- Never harvest private or unrelated personal contact information.
- Resolve mentioned companies/projects to official websites and repositories.
- Store only minimal excerpts needed to support qualification.

GitLab:
- Support public projects, repository metadata, releases, issues and activity evidence.
- Apply the same relevance and evidence rules used for GitHub.

Package/container registries:
- Use package metadata, release recency, repository URL, homepage and cleaned documentation.
- Never qualify a package only because its name contains “AI”, “agent”, “queue”, “worker”, “GPU” or another keyword.
- Explicitly reject generic shims, polyfills, data structures, wrappers and unrelated developer utilities unless direct workload evidence exists.

Stack Exchange:
- Use questions to identify recurring problems and named projects.
- Do not automatically target individual question authors.
- Resolve the company/project and find official contacts separately.

YouTube:
- Use video metadata, descriptions, channel identity, publication dates and transcripts only where legitimately accessible.
- Verify that the speaker/channel is connected to the project.
- Follow official website and repository links.

arXiv:
- Resolve papers to code, lab, project or company.
- Treat pure academic work as lower commercial intent unless there is a deployed project, startup or maintained open-source system.

Job listings:
- Detect companies hiring for inference, GPU systems, distributed systems, ML infrastructure, MLOps, model serving, asynchronous job execution or AI platform engineering.
- Use the listing as infrastructure-pain and “why now” evidence.
- Follow the official company domain for contact enrichment.

Accelerators/hackathons/directories:
- Capture project, founder, cohort/event, date, website and repository.
- Do not treat acceptance, funding or a demo-day listing as proof of Jungle Grid relevance without technical workload evidence.

Discord/Slack:
- Require explicit authorization/configuration.
- Process only channels accessible to the bot/app.
- Store a minimal excerpt, channel/message reference and project links.
- Never process DMs or hidden/private data without explicit authorized product requirements.
- Use community messages as pain evidence; obtain contact details from official public sources.

LinkedIn/Facebook:
- Accept approved API results, licensed connector results, user-provided URLs or permitted imported data.
- Use them for role/company verification, launch timing and public company posts.
- Do not build an anti-bot scraper.
- Do not infer private contact details from a profile.

ENTITY RESOLUTION AND DEDUPLICATION

Build a canonical entity layer for:

- person;
- project;
- repository;
- company/organization;
- domain;
- package/model;
- social profile;
- source document;
- contact point.

Resolve duplicate mentions across sources using normalized domains, repository coordinates, package metadata, official links and conservative fuzzy matching.

Do not merge entities merely because their names are similar.

Keep:
- canonical entity ID;
- aliases;
- source-specific identifiers;
- verified relationships;
- confidence;
- conflicting claims;
- evidence supporting each relationship.

Examples:
- a news article, HN launch and GitHub repository for the same product should become one prospect;
- three copies of the same press release should become one underlying event;
- a maintainer must not be assigned to a company without evidence connecting them.

CONTENT EXTRACTION AND CLEANING

Replace naive full-page text extraction with a robust content pipeline.

Prefer:
- structured APIs;
- README and documentation content;
- JSON-LD and metadata;
- article main content;
- repository descriptions, issues and releases;
- official About, Team, Contact and Careers pages.

Remove or reject:
- CSS;
- JavaScript;
- navigation;
- headers and footers;
- cookie banners;
- badges;
- SVG internals;
- animation declarations;
- code unrelated to the product description;
- repeated page titles;
- search-result boilerplate;
- malformed scraped fragments.

Add contamination detection for patterns such as:
- `@keyframes`
- `data-astro`
- `transform:`
- `min-height:`
- `[ci-image]`
- `[npm-image]`
- large badge/link-reference blocks
- repeated navigation labels
- excessive punctuation or truncated markup

Evidence containing contamination must be rejected or re-extracted, not passed downstream.

EVIDENCE MODEL

Represent every claim with structured evidence:

{
  "evidence_id": "...",
  "entity_id": "...",
  "claim_type": "ai_workload | infrastructure_pain | activity | role | contact | why_now | integration_surface",
  "claim": "...",
  "source_url": "...",
  "source_type": "...",
  "source_authority": 0.0,
  "published_at": "...",
  "retrieved_at": "...",
  "directness": "direct | strong_inference | weak_inference",
  "freshness": 0.0,
  "independence_group": "...",
  "content_hash": "...",
  "clean": true
}

Use project conventions for exact schema naming.

Evidence must support one specific claim. Do not store arbitrary scraped paragraphs as “pain signals”.

Suggested source authority defaults, configurable rather than hard-coded:

- official product documentation: 1.00
- repository code/README/issues/releases: 0.95
- official company/founder website: 0.90
- authorized direct maintainer community statement: 0.85
- reputable original news report: 0.75
- verified company/founder social post: 0.70
- public company Page: 0.55
- search-result snippet: 0.20
- unverified repost: 0.10

Do not count duplicated/syndicated evidence as independent corroboration.

QUALIFICATION GATE

Before expensive research, scoring or drafting, require:

1. A real project/company entity.
2. At least one clean primary source.
3. At least one direct or strong AI-workload signal.
4. At least one plausible Jungle Grid execution/integration signal.
5. A verified relationship between the target person and project.
6. Public, appropriately sourced contact information before email generation.

Relevant workload signals include:

- model inference or serving;
- training or fine-tuning;
- GPU/CUDA workloads;
- multimodal generation;
- long-running agent tool execution;
- batch AI processing;
- distributed workers;
- durable asynchronous execution;
- retries, job state, logs or artifacts;
- compute routing or scaling;
- repeated timeout, startup, capacity or memory problems.

Explicit generic exclusions include:

- queue data structures;
- microtask libraries;
- polyfills and shims;
- generic collections and algorithms;
- unrelated browser utilities;
- projects selected solely through keyword overlap;
- repositories with no demonstrated AI workload;
- abandoned or placeholder repositories with no meaningful activity;
- people whose relationship to the project cannot be verified.

When qualification fails, store a structured exclusion reason and do not draft outreach.

SCORING

Replace ungrounded scoring with evidence-bound scoring.

Every non-zero criterion must reference one or more evidence IDs.

Suggested dimensions:
- direct AI/agent workload relevance;
- compute intensity;
- durability/asynchronous execution need;
- explicit infrastructure pain;
- integration compatibility;
- recent activity/momentum;
- open-source or reachable integration surface;
- contact quality;
- confidence in person-project relationship;
- urgency/why now.

Do not include “Jungle Grid comprehension” unless it has a precise, objectively measurable definition. Replace it with integration compatibility if appropriate.

Evidence score rules:

- no evidence: criterion must be 0;
- weak inference: maximum 40% of criterion;
- clear primary-source evidence: maximum 75%;
- explicit issue, roadmap statement, job listing or maintainer pain statement: up to 100%.

Apply overall confidence caps:

- evidence strength 0: exclude;
- evidence strength 1: maximum total 50;
- evidence strength 2: maximum total 70;
- evidence strength 3+: normal scoring allowed.

A prospect should not reach 90+ without:
- multiple clean evidence items;
- at least one primary source;
- direct workload relevance;
- a clear Jungle Grid integration or pain signal;
- current activity;
- verified contact provenance.

Expose a full score explanation and supporting evidence IDs in output.

CONTACT ENRICHMENT

Search official sources in this order:

1. official contact/team/about page;
2. official project documentation;
3. verified founder or maintainer website;
4. public repository profile;
5. public business/press contact;
6. approved enrichment source.

Allowed examples:
- hello@company.com
- partnerships@company.com
- founders@company.com
- a founder email explicitly published on their official website
- a business email explicitly listed on a repository/profile connected to the project

Do not:
- scrape private communities;
- use leaked datasets;
- expose commit-author emails not intentionally published for contact;
- guess email patterns and mark them verified;
- associate an email with a person without relationship evidence.

Store:
- email/contact value;
- source URL;
- source type;
- publicly listed status;
- person-project match;
- verification method;
- confidence;
- collection timestamp;
- appropriate use category.

DRAFT GENERATION

Generate outreach only for qualified prospects.

Drafts must:
- reference one concise, clean and verifiable detail;
- explain why the detail creates a plausible Jungle Grid fit;
- choose the correct relationship angle;
- avoid pretending the prospect has a problem not supported by evidence;
- avoid copied repository fragments;
- remain concise and human;
- include no fabricated claims.

Support multiple outreach angles:

1. Execution substrate:
   The prospect already has a control plane, queue or orchestration layer; Jungle Grid can execute workloads beneath it.

2. Infrastructure replacement:
   The prospect is rebuilding generic compute/job infrastructure that Jungle Grid could provide.

3. Integration:
   Jungle Grid can become a provider, backend, node, tool or execution target inside the project.

4. Capacity:
   The project needs GPU/model capacity without owning the routing layer.

5. Workflow extension:
   The current product orchestrates AI but lacks durable external workload execution.

Do not use “avoid building queueing and retries from scratch” when the project clearly already owns those components.

MODEL AND FALLBACK HANDLING

Investigate and fix why the prior Qwen generation fell back.

Track separately:
- requested model;
- model invocation attempted;
- model invocation succeeded;
- fallback reason;
- number generated by primary model;
- number generated by fallback;
- retries;
- latency;
- token usage where available.

A run using fallback for every draft must report:
- degraded status;
- primary model generation count of zero;
- fallback count;
- actionable error information.

Fallback drafts must never become automatically send-ready. They require either:
- successful semantic regeneration by an approved model; or
- manual review.

Do not silently label a fallback run as a successful model run.

SEMANTIC VALIDATION

Build a real semantic validator in addition to schema validation.

Reject or require manual review when:

- the prospect failed qualification;
- evidence contains CSS/HTML/navigation contamination;
- personalization is incomplete or nonsensical;
- the same description is repeated;
- an unsupported pain claim is made;
- the project is generic and non-AI;
- the project-person relationship is unverified;
- contact provenance is missing;
- fallback mode was used;
- the message contains raw repository coordinates awkwardly inserted into prose;
- the message says “I noticed” followed by a malformed fragment;
- claimed activity lacks date/activity evidence;
- the message proposes replacing infrastructure the prospect already intentionally owns;
- the name appears to be an organization handle and no actual person was verified;
- copied evidence exceeds the configured excerpt limit;
- confidence is below the send-ready threshold.

Validation statuses should include at least:
- send_ready
- manual_review_required
- regeneration_required
- excluded

Do not reduce these to a misleading boolean `valid`.

RUN REPORTING

Produce a transparent run summary:

{
  "status": "successful | degraded | failed",
  "sources_enabled": [],
  "sources_succeeded": [],
  "sources_degraded": [],
  "sources_failed": [],
  "discovered_raw": 0,
  "deduplicated_entities": 0,
  "qualified": 0,
  "excluded": 0,
  "researched": 0,
  "scored": 0,
  "drafted": 0,
  "send_ready": 0,
  "manual_review_required": 0,
  "regeneration_required": 0,
  "primary_model_generated": 0,
  "fallback_generated": 0,
  "exclusion_reasons": {},
  "quality_metrics": {}
}

Include quality metrics such as:
- qualification precision on fixtures;
- contamination rejection rate;
- duplicate collapse count;
- percentage of scored criteria with evidence IDs;
- fallback rate;
- draft semantic rejection reasons.

CONFIGURATION AND SECURITY

Add documented environment/configuration for each source.

Requirements:
- adapters disabled cleanly when credentials are absent;
- secrets never logged;
- per-source rate limiting;
- timeout and retry policies;
- user-agent identification where appropriate;
- robots and access-policy compliance;
- bounded concurrency;
- caching with sensible expiry;
- deterministic test mode;
- data retention controls;
- redaction of sensitive data from logs;
- no production sending of outreach as part of this task.

Do not introduce paid providers or external dependencies unless they are optional, justified and documented.

TESTING

Add comprehensive tests matching the repository’s existing framework.

At minimum include:

Unit tests:
- source adapter registry;
- normalization;
- HTML/content cleaning;
- contamination detection;
- entity resolution;
- syndicated-news deduplication;
- qualification rules;
- evidence-bound scoring;
- contact provenance;
- model fallback reporting;
- semantic draft validation.

Regression fixtures:
- `sindresorhus/yocto-queue` must be excluded.
- `feross/queue-microtask` must be excluded.
- CSS such as `@keyframes`, `data-astro` and `transform:` must not survive evidence cleaning.
- a generic package containing “agent” or “queue” but no AI workload evidence must be excluded.
- an actual agentic research system with long-running workers, evidence/artifacts and GPU execution should qualify.
- an open LangGraph server with storage/Redis but no proven heavy compute should receive a moderate, evidence-capped score rather than 100.
- a project that already owns its control plane should receive an execution-substrate or integration angle, not an infrastructure-replacement angle.
- a run where the primary model fails for every draft must be marked degraded.
- fallback drafts must require manual review.
- no criterion may receive points without evidence IDs.
- evidence strength 1 must cap the total score at 50.
- malformed personalization must fail validation.

Integration tests:
- use recorded fixtures/mocks for external APIs;
- verify partial success when one source fails;
- verify missing credentials disable only the affected adapter;
- verify deduplication across GitHub, news, HN and official website representations;
- verify contact lookup follows official-source precedence.

If the repository has end-to-end tests, add a deterministic multi-source run proving that irrelevant results are excluded and only strong prospects reach drafting.

DOCUMENTATION

Update:
- README;
- architecture documentation;
- environment-variable example;
- source configuration guide;
- data model/schema docs;
- scoring methodology;
- qualification rules;
- validation statuses;
- privacy/compliance notes;
- troubleshooting for degraded/fallback runs;
- instructions for adding a new adapter;
- migration notes for old JSON consumers.

Include examples showing:
- one excluded keyword false positive;
- one qualified multi-source prospect;
- one degraded model run;
- one manual-review draft;
- one send-ready draft.

BACKWARD COMPATIBILITY

Preserve existing public interfaces where practical.

If schemas must change:
- add schema/version fields;
- provide a migration or compatibility mapper;
- update all consumers;
- document breaking changes;
- ensure old stored runs can still be read where reasonably possible.

DELIVERABLES

Complete all of the following:

1. Production-quality implementation.
2. Source-adapter registry and implemented adapters supported by the current codebase and available official access.
3. Safe disabled/configured states for authorization-dependent sources.
4. Clean evidence model and entity resolution.
5. Hard qualification gate.
6. Evidence-grounded scoring.
7. Contact provenance controls.
8. Correct model/fallback observability.
9. Semantic validation.
10. Transparent run reporting.
11. Tests and regression fixtures.
12. Updated documentation and examples.
13. Database/schema migrations if needed.
14. A concise final engineering report.
15. A pull request using the repository’s established title, description and checklist style if authentication and repository permissions allow it. Otherwise prepare the exact PR title and body.

COMPLETION AUDIT

Before declaring the goal complete:

- Run formatter, lint, type checks, unit tests, integration tests and build.
- Fix all failures caused by the changes.
- Inspect the final diff for secrets, debug output, dead code and unrelated changes.
- Execute the deterministic regression run.
- Confirm `yocto-queue` and `queue-microtask` are excluded.
- Confirm contaminated CSS cannot enter research notes or emails.
- Confirm evidence-strength score caps work.
- Confirm fallback-only generation produces a degraded run and no send-ready drafts.
- Confirm every scoring criterion points to evidence IDs.
- Confirm disabled adapters do not break the pipeline.
- Confirm source failures produce partial/degraded results rather than corrupt output.
- Confirm documentation matches the implementation.
- Compare every deliverable and acceptance criterion above against the actual repository state.

Do not claim completion based only on code presence. Report exact commands run, their results, remaining limitations and any adapters that require external credentials or platform approval.













## JUNGLE GRID AS THE REQUIRED EXECUTION LAYER

The system must be general-purpose and usable by other people, but Jungle Grid must remain the required execution backend.

Do not make Jungle Grid optional or replaceable with direct OpenAI, Ollama, Anthropic, local-process, or arbitrary model-provider execution in production.

Users may customize what the system researches and who it targets, but all compute-intensive and AI-driven pipeline stages must be submitted to and executed through Jungle Grid.

The product model is:

```text
Reusable prospect-intelligence application
        +
User-defined workspace and campaigns
        +
Multiple discovery sources
        +
Jungle Grid execution backend
        =
Self-hostable Jungle Grid-powered research system
```

### Required Jungle Grid integration

The application must use Jungle Grid for:

* AI research and evidence analysis;
* semantic qualification;
* entity comparison and deduplication where model inference is needed;
* prospect scoring explanations;
* outreach-angle selection;
* outreach-draft generation;
* semantic draft validation;
* batch processing of discovered candidates;
* other long-running or compute-intensive workloads.

The application may perform lightweight operations locally, including:

* configuration parsing;
* API and RSS requests;
* source-adapter orchestration;
* deterministic HTML cleaning;
* schema validation;
* database reads and writes;
* simple exact-match deduplication;
* CLI and UI operations.

Any operation requiring model inference, embeddings, semantic reasoning, batch AI processing, or substantial background execution must use Jungle Grid.

### Required user setup

A cloned installation must require:

```env
JUNGLEGRID_API_KEY=
JUNGLEGRID_API_BASE=https://api.junglegrid.dev
```

The setup flow must:

1. explain that Jungle Grid powers the execution layer;
2. ask the user for a Jungle Grid API key;
3. verify the credentials;
4. check available Jungle Grid capabilities;
5. submit a small test job;
6. wait for the job result;
7. verify logs, status and artifacts;
8. refuse to enable production campaigns if Jungle Grid is not configured correctly.

Provide clear instructions for creating a Jungle Grid account and obtaining an API key.

Do not require users to edit application source code.

### Jungle Grid client abstraction

Create a well-tested Jungle Grid execution client using the repository’s existing API or SDK conventions.

The client must support operations equivalent to:

```ts
interface JungleGridExecutionClient {
  estimateJob(input: JobEstimateInput): Promise<JobEstimate>;

  submitJob(input: JobSubmissionInput): Promise<SubmittedJob>;

  getJob(jobId: string): Promise<Job>;

  getJobEvents(jobId: string): Promise<JobEvent[]>;

  getJobLogs(
    jobId: string,
    options?: LogOptions
  ): Promise<JobLogs>;

  cancelJob(jobId: string): Promise<void>;

  listArtifacts(jobId: string): Promise<JobArtifact[]>;

  downloadArtifact(
    jobId: string,
    artifactId: string
  ): Promise<Buffer | ReadableStream>;
}
```

Adapt the interface to the actual Jungle Grid API and repository language.

Do not invent endpoints. Inspect the existing Jungle Grid documentation, MCP repository, API client, examples and integration implementations before building the client.

### Jungle Grid workload lifecycle

Every Jungle Grid-backed stage must follow a durable lifecycle:

```text
PREPARING
→ ESTIMATING
→ SUBMITTING
→ QUEUED
→ STARTING
→ RUNNING
→ COMPLETED
```

Terminal states must include:

```text
COMPLETED
FAILED
CANCELLED
TIMED_OUT
BLOCKED
```

Persist:

* Jungle Grid job ID;
* campaign ID;
* workspace ID;
* pipeline stage;
* estimate response;
* submission timestamp;
* execution phase;
* status message;
* started timestamp;
* completed timestamp;
* retry count;
* logs cursor;
* output artifacts;
* failure reason;
* model/workload metadata;
* cost or usage information when available.

The application must survive restarts without losing track of active Jungle Grid jobs.

### Job orchestration

Do not execute one Jungle Grid job per tiny operation.

Batch compatible work intelligently.

Examples:

* research 20 candidates in one bounded batch;
* score qualified candidates together;
* generate several drafts in one structured-output workload;
* semantically validate a batch of drafts;
* process independent source evidence concurrently when appropriate.

Respect Jungle Grid payload, runtime and workload limits.

The batching strategy must be configurable:

```yaml
execution:
  backend: jungle_grid

  batching:
    research_batch_size: 20
    scoring_batch_size: 25
    drafting_batch_size: 10
    validation_batch_size: 20

  concurrency:
    maximum_active_jobs: 4

  retries:
    maximum_attempts: 3
    backoff_seconds: 10
```

### Structured job contracts

Each Jungle Grid workload must have a versioned input and output contract.

Example:

```json
{
  "schema_version": "1.0",
  "workspace_id": "example-workspace",
  "campaign_id": "example-campaign",
  "pipeline_stage": "prospect_research",
  "candidates": [],
  "campaign_configuration": {},
  "evidence_policy": {},
  "output_contract": {
    "format": "json",
    "artifact_name": "research-results.json"
  }
}
```

Jungle Grid jobs must write machine-readable outputs to artifacts rather than relying only on console text.

Validate downloaded artifacts against a schema before accepting them into the pipeline.

Invalid or missing artifacts must fail the pipeline stage or trigger a bounded retry.

### Model configuration through Jungle Grid

Users may choose which model or workload profile Jungle Grid should execute, but they must not bypass Jungle Grid.

Configuration may look like:

```yaml
execution:
  provider: jungle_grid

  workloads:
    research:
      model: qwen2.5:3b
      workload_type: inference

    scoring:
      model: qwen2.5:3b
      workload_type: inference

    drafting:
      model: qwen2.5:3b
      workload_type: inference

    validation:
      model: qwen2.5:3b
      workload_type: inference
```

Use only models and workload types actually supported by Jungle Grid.

The architecture may allow different Jungle Grid templates or models per pipeline stage, but it must not allow direct external model execution as a production fallback.

### No silent local or external fallback

If a Jungle Grid job fails, the system must not silently call another provider or run a local model.

Allowed behavior:

* retry through Jungle Grid;
* choose another configured Jungle Grid-supported model;
* resubmit with a smaller batch;
* mark the stage as degraded;
* require manual review;
* stop the run with a clear error.

Prohibited behavior:

* silently call OpenAI directly;
* silently call Anthropic directly;
* silently use Ollama;
* silently run a local Python model;
* label locally generated content as Jungle Grid output;
* report success when every Jungle Grid execution failed.

The run report must expose:

```json
{
  "execution_backend": "jungle_grid",
  "jungle_grid_jobs_submitted": 0,
  "jungle_grid_jobs_completed": 0,
  "jungle_grid_jobs_failed": 0,
  "jungle_grid_jobs_cancelled": 0,
  "jungle_grid_retries": 0,
  "jungle_grid_artifacts_received": 0,
  "local_ai_fallbacks": 0,
  "external_ai_fallbacks": 0
}
```

Both fallback fields must always remain zero in production.

### Development and tests

Tests may use a deterministic mock Jungle Grid client.

The mock must reproduce:

* estimates;
* queued and running states;
* progress events;
* logs;
* successful artifacts;
* failed jobs;
* cancellation;
* timeouts;
* malformed artifacts;
* retry behavior.

The mock is permitted only in:

* unit tests;
* integration fixtures;
* explicit development simulation mode.

A real campaign run must not use the mock client.

Clearly label simulation output:

```json
{
  "execution_backend": "jungle_grid_mock",
  "production_eligible": false
}
```

### Reusable but Jungle Grid-powered

Other users must still be able to configure:

* their own product or offer;
* their ideal customer profile;
* target industries;
* prospect types;
* discovery sources;
* qualification rules;
* scoring dimensions;
* outreach channels;
* messaging;
* language;
* geographic focus;
* evidence requirements.

However, those configurations change **what the system researches**, not **where the AI workloads execute**.

Jungle Grid remains the required compute and execution layer.

### Product positioning

Update the README to describe the project as:

> An open-source, self-hostable prospect intelligence and outreach research system powered by Jungle Grid.

Explain that users own and control:

* their campaigns;
* source credentials;
* configurations;
* discovered evidence;
* contacts;
* drafts;
* exports.

Jungle Grid provides:

* durable AI-job execution;
* model workload execution;
* batch processing;
* job state;
* retries;
* logs;
* artifacts;
* asynchronous execution.

### Onboarding flow

The clone-to-first-run process should resemble:

```bash
git clone <repository>
cd <repository>
cp .env.example .env
npm install
npm run setup
npm run campaign:new
npm run discover -- --campaign my-campaign
```

During `setup`, require the Jungle Grid API key and execute a real Jungle Grid verification workload.

The system may allow users to browse configuration and create campaigns before adding credentials, but it must not execute AI research, scoring, drafting or validation without a working Jungle Grid connection.

### Acceptance criteria

Before completion, prove that:

1. A new user can clone the repository and configure their own campaign.
2. The user must provide valid Jungle Grid credentials before running AI stages.
3. Research inference executes as a Jungle Grid job.
4. Scoring executes as a Jungle Grid job.
5. Draft generation executes as a Jungle Grid job.
6. Semantic validation executes as a Jungle Grid job.
7. Jungle Grid job IDs are persisted and associated with pipeline stages.
8. Logs, events and artifacts are retrievable through the application.
9. The application recovers active jobs after a process restart.
10. Failed Jungle Grid jobs do not silently fall back to another provider.
11. Different campaigns can use different Jungle Grid-supported models or templates.
12. A non-Jungle Grid campaign configuration still uses Jungle Grid for execution.
13. The system works for products unrelated to Jungle Grid.
14. Jungle Grid-specific prospect criteria are confined to the Jungle Grid example campaign.
15. The generic engine still requires Jungle Grid as its execution backend.
16. Tests use a deterministic mock, while production runs require the real Jungle Grid API.
17. The README clearly states that the project is reusable but Jungle Grid-powered.
18. A deterministic end-to-end test proves that a generic SaaS campaign and the Jungle Grid campaign use different criteria while both execute through the Jungle Grid client.
