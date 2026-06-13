/goal Upgrade the existing outreach and prospect-research system in this repository into Openline: a production-ready, general-purpose autonomous business-development platform powered by Jungle Grid.

This is an in-place product evolution, not a greenfield rewrite.

The current implementation already contains useful functionality for prospect discovery, website and repository research, public contact extraction, prospect scoring, Jungle Grid-backed model execution, email drafting, structured run output, and validation.

Preserve that working foundation and progressively extend it.

Do not:

* create a separate replacement application;
* restart the architecture without necessity;
* discard existing working pipeline stages;
* replace working APIs with unrelated new APIs;
* duplicate existing functionality under new folders;
* abandon current database records;
* break current command-line workflows;
* remove existing Jungle Grid integration;
* introduce an entirely new stack unless the existing stack makes a requirement impossible;
* rename every existing concept merely for cosmetic consistency;
* leave the old system and a second Openline system operating independently.

Openline must emerge from the current system through compatible refactoring, schema evolution, adapters, migrations, new modules, and production-quality extensions.

## V3 Implementation Status

The coordinated v3 implementation now uses seven schema-versioned artifacts,
multi-source candidate envelopes, independent source/enrichment concurrency,
evidence-bound dynamic scoring, standalone proof generation, channel-neutral
messages, mandatory first-touch approval, unified delivery adapters, encrypted
Playwright sessions, delivery attempt auditing, and backup-first database
migration. New worker artifacts must use `schema_version: "3.0"`; historical
database records migrate in place.

# PRIMARY OBJECTIVE

Transform the current email-oriented Jungle Grid prospecting system into Openline, while preserving and improving the existing end-to-end workflow.

The upgraded workflow should become:

Current discovery pipeline
→ improved multi-source discovery
→ cleaned evidence
→ entity resolution
→ configurable qualification
→ evidence-bound scoring
→ multi-method contact enrichment
→ proof-of-value generation
→ channel-aware outreach
→ reply ingestion
→ multi-turn conversations
→ policy-controlled autonomous follow-up
→ opportunity progression

The current system must continue working throughout the upgrade.

# START WITH THE EXISTING IMPLEMENTATION

Before modifying anything:

1. Inspect the complete repository.
2. Read repository instructions and architecture documentation.
3. Identify the actual current pipeline stages.
4. Map current files and functions responsible for:

   * discovery;
   * website scraping;
   * repository research;
   * email extraction;
   * evidence generation;
   * scoring;
   * Jungle Grid execution;
   * fallback generation;
   * email drafting;
   * validation;
   * JSON output;
   * CLI or API entry points.
5. Run the existing test suite.
6. Run one deterministic current-system pipeline fixture.
7. Record the current output schema.
8. Identify all consumers of that output.
9. Identify the existing storage model.
10. Identify current configuration and environment variables.
11. Determine why the previous run produced:

    * irrelevant queue and microtask packages;
    * contaminated CSS evidence;
    * unsupported high scores;
    * fallback-generated drafts marked valid;
    * email-only contact assumptions.
12. Produce a concise implementation map showing:

    * what will be retained;
    * what will be refactored;
    * what will be extended;
    * what must be migrated;
    * what obsolete behavior will be removed.

Then immediately implement the upgrade.

Do not stop after the audit.

# CURRENT SYSTEM IS THE BACKBONE

Reuse the existing pipeline wherever appropriate.

Examples:

* Extend the current prospect object rather than replacing it with an unrelated model.
* Convert the existing email fields into a backward-compatible contact-points model.
* Extend the current research notes into structured evidence.
* Upgrade the current scorer rather than building an unconnected second scorer.
* Upgrade current email drafts into channel-neutral message drafts.
* Extend the current validation report into semantic validation statuses.
* Extend the current run summary instead of creating a separate reporting subsystem.
* Wrap the existing Jungle Grid calls in a production client rather than bypassing them.
* Add adapters around existing GitHub and website discovery code instead of rewriting them without reason.
* Preserve current CLI/API commands where practical and introduce aliases or new flags for expanded behavior.

# INCREMENTAL DELIVERY ORDER

Implement the upgrade in phases that keep the repository operational.

## Phase 1: Correct the current pipeline

First repair the existing system before expanding it.

Required corrections:

* exclude irrelevant keyword matches;
* clean CSS, JavaScript, navigation, badges, and boilerplate;
* make qualification evidence-based;
* cap scores according to evidence strength;
* require evidence IDs for every scored criterion;
* expose Jungle Grid failures and fallbacks accurately;
* prevent fallback drafts from becoming send-ready;
* add semantic draft validation;
* preserve excluded prospects with clear reasons;
* remove the assumption that an email is required for qualification.

The current deterministic regression fixture must pass before adding autonomous conversation functionality.

## Phase 2: Generalize configuration

Move Jungle Grid-specific prospecting logic into a bundled campaign configuration.

Do not remove the current Jungle Grid use case.

Convert it into the default or example Openline campaign.

Add configurable:

* business information;
* offer;
* ideal customer profile;
* customer problems;
* include and exclude signals;
* qualification rules;
* scoring dimensions;
* proof-of-value strategy;
* channels;
* outreach style;
* conversion goal;
* autonomy policy.

Existing users must be able to run the previous Jungle Grid workflow through the default campaign with minimal or no configuration changes.

## Phase 3: Expand discovery sources

Place the existing GitHub and website discovery code behind source-adapter interfaces.

Then add additional adapters incrementally.

Do not wait until every potential source is implemented before delivering working improvements.

Prioritize:

1. existing GitHub source;
2. existing official website source;
3. news and RSS;
4. Hacker News;
5. Hugging Face;
6. GitLab;
7. Reddit;
8. package registries;
9. job listings;
10. authorization-dependent sources.

Each source must be independently configurable and failure-isolated.

## Phase 4: Upgrade contact enrichment

Migrate the existing email-centric model into a generic contact-points model.

Preserve old email fields through compatibility serialization where needed.

Support:

* email;
* official contact form;
* GitHub profile;
* GitHub Discussions;
* approved GitHub issue route;
* LinkedIn profile;
* LinkedIn company page;
* Discord server and public channel;
* Slack workspace and authorized channel;
* X profile;
* Facebook Page;
* Instagram business profile;
* WhatsApp Business number;
* public business phone;
* booking link;
* integration form;
* partnership form;
* marketplace submission form;
* community forum;
* feature-request portal.

Email must remain fully supported, but it must become one channel rather than a qualification requirement.

## Phase 5: Add proof-of-value generation

Extend the existing research and drafting pipeline with proof-of-value artifacts.

Use the current Jungle Grid execution flow.

Do not create an unrelated second job system.

Proof types may include:

* technical integration proposal;
* repository patch;
* website audit;
* market-opportunity report;
* campaign concept;
* workflow recommendation;
* implementation plan;
* cost-saving estimate;
* comparison report;
* public reputation review;
* custom campaign-defined artifact.

Attach generated artifacts to the existing prospect and run records.

## Phase 6: Add conversations

Upgrade the existing draft output into a durable conversation system.

Add:

* conversation records;
* message records;
* inbound reply ingestion;
* reply classification;
* conversation summaries;
* open questions;
* commitments;
* objections;
* follow-up dates;
* opportunity states;
* response generation;
* approval decisions;
* policy decisions.

Initial outreach produced by the current pipeline should become the first outbound message in a conversation rather than a detached email-draft record.

## Phase 7: Add controlled autonomy

Introduce:

* draft-only mode;
* confirmation-required mode;
* policy-autonomous mode.

Reuse current validation and run controls.

Autonomous messages must only be sent when:

* qualification passed;
* contact provenance passed;
* semantic validation passed;
* channel policy allows sending;
* the campaign is active;
* limits are not exceeded;
* the recipient has not opted out;
* no escalation rule applies;
* Jungle Grid execution succeeded.

# BACKWARD COMPATIBILITY

Maintain backward compatibility wherever practical.

Required actions:

* assign a schema version to current and upgraded output;
* provide migration functions for stored runs;
* provide compatibility serialization for previous JSON consumers;
* preserve current command names where practical;
* preserve current environment variables or provide aliases and deprecation notices;
* migrate existing prospect records;
* migrate current email drafts into channel-neutral draft/message records;
* preserve Jungle Grid job identifiers;
* document any unavoidable breaking changes;
* update all internal consumers in the same change.

Example compatibility:

```json
{
  "email": "person@example.com",
  "contact_points": [
    {
      "type": "email",
      "value": "person@example.com"
    }
  ]
}
```

The legacy `email` field may remain during a documented transition period, but new logic must use `contact_points`.

# NO DUPLICATED PIPELINES

At completion, there must be one coherent pipeline.

Do not leave:

* an old prospect scorer and a separate Openline scorer;
* an old email drafter and an unrelated message generator;
* two independent evidence formats;
* duplicate Jungle Grid clients;
* separate old and new campaign runners;
* disconnected conversation and prospect records;
* incompatible run-summary implementations.

When replacing an internal component:

1. migrate its callers;
2. add compatibility where needed;
3. remove the obsolete path;
4. test the unified path.

# JUNGLE GRID INTEGRATION

Retain and productionize the existing Jungle Grid implementation.

Do not replace it with direct model-provider calls.

Inspect the existing Jungle Grid API usage before changing it.

All AI and long-running stages must continue to use Jungle Grid, including:

* semantic research;
* qualification;
* scoring explanations;
* proof-of-value generation;
* outreach generation;
* reply classification;
* conversation summarization;
* next-action selection;
* response generation;
* semantic validation;
* scheduled campaign evaluation.

Lightweight deterministic operations may remain local:

* source API requests;
* HTML cleaning;
* configuration parsing;
* database operations;
* exact matching;
* deterministic policy checks;
* frontend rendering.

Persist Jungle Grid job IDs on existing and new records.

A failed Jungle Grid job must never silently switch to another provider.

# OPENLINE PRODUCT IDENTITY

Introduce Openline branding into the current product without destabilizing the codebase.

Update:

* README title and positioning;
* application metadata;
* frontend title;
* documentation;
* setup flow;
* example configuration;
* default campaign naming where appropriate.

Do not rename stable internal packages, database tables, environment variables, or APIs merely for branding unless there is a clear migration benefit.

Use compatibility aliases where naming changes are necessary.

# DEFINITION OF DONE

Do not claim completion until all of the following are true:

1. The existing pipeline still runs.
2. Existing Jungle Grid functionality remains operational.
3. Legacy stored results can be read or migrated.
4. Existing GitHub and website research has been improved rather than discarded.
5. Keyword false positives are rejected.
6. Contaminated evidence is rejected.
7. Scores are evidence-bound.
8. Contact enrichment is no longer email-only.
9. Existing email drafting works through the new message model.
10. A campaign unrelated to Jungle Grid can run.
11. A non-technical campaign can run.
12. Proof-of-value artifacts are attached to prospects.
13. Initial outreach becomes part of a conversation.
14. Inbound replies are ingested into the correct conversation.
15. Confirmation mode requests approval.
16. Policy-autonomous mode can respond without approval when permitted.
17. Opt-outs immediately stop future communication.
18. Every AI decision includes a Jungle Grid job ID.
19. The frontend exposes the upgraded workflow.
20. Documentation explains how an existing installation upgrades.
21. Tests cover migrations and legacy compatibility.
22. There is one unified production pipeline rather than parallel old and new systems.

Interpret every remaining requirement in this goal as an upgrade to the existing system, not permission to restart the repository from scratch.
