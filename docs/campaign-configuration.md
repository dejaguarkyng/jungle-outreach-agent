# Campaign Configuration

Campaign files live in `config/campaigns/*.json`. They define what the system
researches; they do not change where AI work executes. Every campaign is
submitted through the same Jungle Grid client.

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

Create a campaign by copying one of these files, changing `campaignId`, and
editing the configuration. No application source changes are required. The
manual-run screen discovers valid campaign files automatically.

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
