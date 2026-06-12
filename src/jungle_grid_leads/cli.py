from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


LEGACY_COMMANDS = {
    "discover",
    "normalize",
    "dedupe",
    "classify",
    "score",
    "draft",
    "queue",
    "run-all",
    "task",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Compatibility adapter for the unified Openline pipeline."
    )
    parser.add_argument("command", nargs="?", default="run-all")
    parser.add_argument("stage", nargs="?")
    parser.add_argument("--target", "--count", type=int, default=17)
    parser.add_argument("--category")
    parser.add_argument("--campaign-id", default="jungle-grid")
    args, _unknown = parser.parse_known_args(argv)

    if args.command == "task-contracts":
        print(
            json.dumps(
                {
                    "schema_version": "openline-compat.v1",
                    "execution_backend": "jungle_grid",
                    "pipeline": "unified_openline",
                    "legacy_commands": sorted(LEGACY_COMMANDS),
                    "note": (
                        "Legacy stage names submit the complete managed pipeline; "
                        "independent local stages were retired."
                    ),
                },
                indent=2,
            )
        )
        return 0
    if args.command not in LEGACY_COMMANDS:
        parser.error(f"unsupported command: {args.command}")

    root = Path(__file__).resolve().parents[2]
    command = [
        "npm",
        "run",
        "outreach:run:junglegrid:qwen",
        "--",
        "--count",
        str(max(1, args.target)),
        "--campaign-id",
        args.campaign_id,
    ]
    if args.category:
        command.extend(["--category", args.category])
    return subprocess.run(command, cwd=root, check=False).returncode
