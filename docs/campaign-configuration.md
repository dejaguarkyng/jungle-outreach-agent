# Campaign Configuration

OpenLine now treats saved database-backed campaigns as the primary operator
workflow. File-backed campaigns in `config/campaigns/*.json` remain template
examples and fallback defaults for a fresh clone.

Each file uses schema version `1.0` and contains:

- workspace and campaign identifiers;
- offer name, description, public URL, sender, and signature;
- ideal-customer categories;
- target, workload, execution, pain, and exclusion terms;
- qualification requirements and activity age;
- positioning, call to action, and subject prefix;
- Jungle Grid-supported model choices for research, scoring, drafting, and
  semantic validation.

`jungle-grid.json` is the product-specific example campaign.
`generic-saas.json` demonstrates a product unrelated to Jungle Grid. The latter
targets SaaS release diagnostics and does not inherit AI, GPU, agent, or Jungle
Grid prospect criteria.

Recommended flow:

1. create a business profile in the `Settings` screen;
2. open the `Campaigns` page;
3. create a campaign from an archetype preset;
4. refine the full persisted JSON contract in the editor;
5. use the saved campaign from the manual-run screen.

Saved campaigns override file templates with the same `campaignId`.

The worker receives the selected configuration in the versioned Jungle Grid
job contract. The contract also declares pipeline stages, evidence rules,
batching, concurrency, retry policy, and required output artifacts.
`run_summary.json` records `workspace_id`, `campaign_id`,
`campaign_name`, `offer_name`, `execution_backend`, and human-readable score
dimension labels. Historical JSON field names such as `junglegrid_relevance`
and `agentMcpRelevance` remain compatibility aliases; their labels and content
are campaign-relative for non-Jungle campaigns.

Production job metadata includes the selected campaign and per-stage model
configuration. A campaign cannot select a direct local or external inference
provider.
