Classify this lead into exactly one category:

- `provider_pain`
- `gpu_selection_pain`
- `deployment_pain`
- `non_fit`

Return valid JSON only with this shape:

```json
{
  "category": "provider_pain",
  "rationale": "short explanation",
  "confidence": 0.84
}
```

Decision rules:
- `provider_pain`: trouble with GPU cloud providers, capacity, pricing, reliability, quotas, billing, vendor switching, or support.
- `gpu_selection_pain`: trouble choosing GPU type, VRAM, sizing, cost/performance, or hardware comparisons.
- `deployment_pain`: trouble deploying, serving, scaling, or operating AI workloads in production.
- `non_fit`: not actually an AI infra lead, too vague, or mainly consumer/gaming chatter.

Lead JSON:
{{lead_json}}
