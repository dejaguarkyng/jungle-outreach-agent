Write a short outbound draft for a high-fit lead.

Constraints:
- keep it human and concise
- show that you understood the lead's specific complaint
- do not overclaim
- do not mention automation, scraping, or enrichment
- do not be pushy
- output only valid JSON

Return this shape:

```json
{
  "subject": "short subject line",
  "message": "plain-text outreach message",
  "why_jungle_grid": "one sentence on relevance",
  "call_to_action": "one short CTA"
}
```

Company:
- name: {{company_name}}
- pitch: {{company_pitch}}

Lead JSON:
{{lead_json}}

Classification JSON:
{{classification_json}}

Score JSON:
{{score_json}}
