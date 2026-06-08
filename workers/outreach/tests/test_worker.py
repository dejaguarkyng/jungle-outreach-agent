import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKER = ROOT / "workers" / "outreach" / "outreach_worker.py"
sys.path.insert(0, str(ROOT))
from workers.outreach import outreach_worker as worker_module


class WorkerSmokeTest(unittest.TestCase):
    def test_template_run_writes_valid_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {
                **os.environ,
                "FIT_SCORE_THRESHOLD": "60",
                "MAX_DRAFTS_PER_DOMAIN": "2",
                "OUTREACH_MEMORY_PATH": str(Path(directory) / "state" / "memory.json"),
            }
            subprocess.run(
                [
                    sys.executable,
                    str(WORKER),
                    "--job",
                    "full-run-template",
                    "--target",
                    "2",
                    "--output",
                    directory,
                    "--input",
                    str(ROOT / "examples" / "sample-worker-input.json"),
                ],
                check=True,
                env=env,
            )
            artifacts = {path.name for path in Path(directory).glob("*.json")}
            self.assertEqual(
                artifacts,
                {
                    "prospects.json",
                    "research_notes.json",
                    "scored_prospects.json",
                    "email_drafts.json",
                    "run_summary.json",
                    "validation_report.json",
                },
            )
            drafts = json.loads((Path(directory) / "email_drafts.json").read_text())
            self.assertGreaterEqual(len(drafts), 1)
            for draft in drafts:
                self.assertEqual(draft["links"], ["https://junglegrid.dev"])
                self.assertGreaterEqual(draft["word_count"], 70)
                self.assertLessEqual(draft["word_count"], 140)
            report = json.loads((Path(directory) / "validation_report.json").read_text())
            self.assertIn("skipped_prospects", report)

    def test_qwen_invalid_output_falls_back_to_template_validation(self):
        prospect = {
            "prospect_id": "p1",
            "name": "Avery Maintainer",
            "email": "avery@agent-runtime.dev",
            "email_source_url": "https://agent-runtime.dev/contact",
            "project": "sample/agent-runtime",
            "category": "agent_compute",
            "fit_score": 92,
            "contact_quality": 9,
            "evidence_points": [
                "long-running tool jobs go to isolated workers",
                "logs, retries, and output artifacts stay attached to the job",
            ],
        }
        note = {
            "prospect_id": "p1",
            "summary": "Agent Runtime documents durable worker jobs.",
            "personalization_detail": "its durable worker queue preserves logs and output artifacts",
            "junglegrid_relevance": "The workload needs durable compute execution.",
            "pain_signals": ["durable worker queue preserves logs and output artifacts"],
            "evidence_points": [
                "long-running tool jobs go to isolated workers",
                "logs, retries, and output artifacts stay attached to the job",
            ],
            "evidence_urls": [
                "https://agent-runtime.dev/contact",
                "https://github.com/sample/agent-runtime#readme",
            ],
            "evidence_strength": 0.9,
        }
        env = {
            **os.environ,
            "FIT_SCORE_THRESHOLD": "60",
            "LLM_FALLBACK_MODE": "template",
            "USE_LOCAL_LLM": "true",
            "OUTREACH_MEMORY_PATH": str(ROOT / "data" / "test-memory.json"),
        }
        with patch.dict(os.environ, env, clear=False):
            with patch.object(worker_module, "ensure_ollama", return_value=True):
                with patch.object(
                    worker_module,
                    "qwen_draft",
                    return_value=("Short note", "Too short https://invalid.test", ["invalid claim"]),
                ):
                    drafts, failures, fallback_used = worker_module.write_drafts([prospect], [note], True)
        self.assertTrue(fallback_used)
        self.assertEqual(len(failures), 0)
        self.assertEqual(len(drafts), 1)
        self.assertEqual(drafts[0]["model_mode"], "fallback")
        self.assertEqual(drafts[0]["links"], ["https://junglegrid.dev"])
        self.assertGreaterEqual(drafts[0]["word_count"], 70)
        self.assertLessEqual(drafts[0]["word_count"], 140)

    def test_qwen_mode_falls_back_to_templates_when_runtime_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {
                **os.environ,
                "FIT_SCORE_THRESHOLD": "60",
                "OLLAMA_HOST": "http://127.0.0.1:9",
                "LLM_FALLBACK_MODE": "template",
                "OUTREACH_MEMORY_PATH": str(Path(directory) / "state" / "memory.json"),
            }
            subprocess.run(
                [
                    sys.executable,
                    str(WORKER),
                    "--job",
                    "full-run-qwen",
                    "--target",
                    "1",
                    "--output",
                    directory,
                    "--input",
                    str(ROOT / "examples" / "sample-worker-input.json"),
                ],
                check=True,
                env=env,
            )
            summary = json.loads((Path(directory) / "run_summary.json").read_text())
            drafts = json.loads((Path(directory) / "email_drafts.json").read_text())
            self.assertTrue(summary["fallback_used"])
            self.assertEqual(drafts[0]["model_mode"], "fallback")

    def test_discover_skips_env_excluded_contacts(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.json"
            input_path.write_text((ROOT / "examples" / "sample-worker-input.json").read_text())
            env = {
                **os.environ,
                "OUTREACH_EXCLUDED_EMAILS": json.dumps(["avery@agent-runtime.dev"]),
                "OUTREACH_MEMORY_PATH": str(Path(directory) / "state" / "memory.json"),
            }
            with patch.dict(os.environ, env, clear=False):
                prospects, skipped = worker_module.discover(2, input_path, None)
            emails = {row["email"] for row in prospects}
            self.assertNotIn("avery@agent-runtime.dev", emails)
            self.assertTrue(any(row["exclusion_rule_triggered"] for row in skipped))

    def test_bad_prospect_rules_and_readme_cleaning(self):
        microsoft = worker_module.normalize_prospect(
            {
                "prospect_id": "msft",
                "name": "ONNX Runtime",
                "email": "opensource@microsoft.com",
                "email_source_url": "https://opensource.microsoft.com",
                "project": "microsoft/onnxruntime",
                "project_url": "https://github.com/microsoft/onnxruntime",
                "project_description": "GPU inference runtime SDK",
                "research_text": '<img src="badge"> ![build](https://img.shields.io/x) <a href="#">docs</a> inference server',
                "owner_login": "microsoft",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
        )
        aws_sdk = worker_module.normalize_prospect(
            {
                "prospect_id": "aws",
                "name": "AWS SDK",
                "email": "support@aws.amazon.com",
                "email_source_url": "https://aws.amazon.com/contact-us/",
                "project": "aws/aws-sdk-js",
                "project_url": "https://github.com/aws/aws-sdk-js",
                "project_description": "SDK for AWS",
                "research_text": "SDK examples docs",
                "owner_login": "aws",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
        )
        proxy = worker_module.normalize_prospect(
            {
                "prospect_id": "proxy",
                "name": "Global Agent",
                "email": "maintainer@global-agent.dev",
                "email_source_url": "https://global-agent.dev/contact",
                "project": "gajus/global-agent",
                "project_url": "https://github.com/gajus/global-agent",
                "project_description": "HTTP proxy agent for Node.js",
                "research_text": "Global-agent sets a global HTTP proxy agent for Node.js requests.",
                "owner_login": "gajus",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
        )
        generic = worker_module.normalize_prospect(
            {
                "prospect_id": "generic",
                "name": "Generic",
                "email": "opensource@tool.dev",
                "email_source_url": "https://tool.dev/contact",
                "project": "solo/tool",
                "project_url": "https://github.com/solo/tool",
                "project_description": "AI worker runtime",
                "research_text": "AI worker runtime with background jobs and artifacts.",
                "owner_login": "solo",
                "updated_at": datetime.utcnow().isoformat() + "Z",
            }
        )

        self.assertEqual(worker_module.category_for(proxy["research_text"]), "open_source_ai")
        self.assertNotIn("<img", microsoft["research_text"])
        self.assertNotIn("shields.io", microsoft["research_text"])
        self.assertEqual(worker_module.qualification_diagnostics(microsoft)["exclusion_rule_triggered"], "large_vendor_or_foundation_org")
        self.assertEqual(worker_module.qualification_diagnostics(aws_sdk)["exclusion_rule_triggered"], "large_vendor_or_foundation_org")
        self.assertLess(worker_module.qualification_diagnostics(generic)["contact_quality"], 7)

    def test_good_prospect_scores_and_buyer_fit_gate(self):
        now = datetime.utcnow().isoformat() + "Z"
        prospects = [
            worker_module.normalize_prospect(
                {
                    "prospect_id": "good-1",
                    "name": "Avery Founder",
                    "email": "avery@agentfoundry.dev",
                    "email_source_url": "https://agentfoundry.dev/contact",
                    "project": "avery/agentfoundry",
                    "project_url": "https://github.com/avery/agentfoundry",
                    "project_description": "Solo-built agent runtime for long-running jobs.",
                    "research_text": "We run long-running agent jobs through a background worker queue, keep logs and artifacts, and are working through deployment latency.",
                    "owner_login": "avery",
                    "owner_type": "User",
                    "updated_at": now,
                }
            ),
            worker_module.normalize_prospect(
                {
                    "prospect_id": "good-2",
                    "name": "Morgan Maintainer",
                    "email": "morgan@mcpkit.dev",
                    "email_source_url": "https://mcpkit.dev/about",
                    "project": "morgan/mcpkit",
                    "project_url": "https://github.com/morgan/mcpkit",
                    "project_description": "MCP server for batch inference workflows.",
                    "research_text": "Our MCP server launches batch inference tasks, stores generated artifacts, and retries failed worker jobs.",
                    "owner_login": "morgan",
                    "owner_type": "User",
                    "updated_at": now,
                }
            ),
        ]

        for prospect in prospects:
            prospect["diagnostics"] = worker_module.qualification_diagnostics(prospect)
        notes = worker_module.research(prospects)
        scored = worker_module.score(prospects, notes)
        drafts, failures, _ = worker_module.write_drafts(scored, notes, False)

        self.assertEqual(len(drafts), 2)
        self.assertEqual(len(failures), 0)
        self.assertTrue(all(row["fit_score"] >= 75 for row in scored))
        self.assertTrue(all(row["evidence_strength"] >= 0.8 for row in scored))
        self.assertTrue(all(len(row["evidence_points"]) >= 2 for row in scored))


if __name__ == "__main__":
    unittest.main()
