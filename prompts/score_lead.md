Score this lead for Jungle Grid fit from 0 to 10.

Jungle Grid fit should reward:
- explicit AI infrastructure pain
- signs this is blocking real work
- signs of production, team, buyer, or provider-switching intent
- proximity to GPU provider choice, GPU sizing choice, or AI deployment execution

Penalize:
- consumer/gaming usage
- vague discussion with no real complaint
- obvious hobby-only or student-only experimentation

Return valid JSON only with this shape:

```json
{
  "fit_score": 8,
  "rationale": "short explanation",
  "buying_signals": ["signal one", "signal two"]
}
```

Lead JSON:
{{lead_json}}

Classification JSON:
{{classification_json}}
