import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKER = ROOT / "workers" / "outreach" / "outreach_worker.py"


class WorkerSmokeTest(unittest.TestCase):
    def test_template_run_writes_valid_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {
                **os.environ,
                "FIT_SCORE_THRESHOLD": "60",
                "MAX_DRAFTS_PER_DOMAIN": "2",
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
                self.assertGreaterEqual(draft["word_count"], 60)
                self.assertLessEqual(draft["word_count"], 80)

    def test_qwen_mode_falls_back_to_templates_when_runtime_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {
                **os.environ,
                "FIT_SCORE_THRESHOLD": "60",
                "OLLAMA_HOST": "http://127.0.0.1:9",
                "LLM_FALLBACK_MODE": "template",
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


if __name__ == "__main__":
    unittest.main()
