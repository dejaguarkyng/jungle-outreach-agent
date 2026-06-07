# Jungle Grid Dogfooding

The application treats outreach as a real agentic batch workload rather than a
single text-generation call.

Jungle Grid is responsible for discovery, public research, fit scoring,
Qwen/Ollama execution, validation, logs, fallback reporting, and managed
artifacts. The backend submits jobs through `/v1/jobs`, monitors lifecycle
state, reads logs, and downloads artifacts through signed URLs.

`junglegrid-template` proves the orchestration and artifact path without model
startup. `junglegrid-qwen` adds local model execution inside the same worker.
This separation makes startup cost, model fallback, run duration, and output
quality visible in run records.

The worker command is:

```bash
python /app/outreach_worker.py \
  --job full-run-qwen \
  --target 17 \
  --output /workspace/artifacts
```

No ZeptoMail credentials or send operation are submitted to Jungle Grid. The
worker writes artifacts only; manual sending is a backend/dashboard concern.
