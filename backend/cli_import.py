"""Run the Import + Checker pipeline on a file from the command line.

    python -m backend.cli_import samples/ejj/"Adult Curriculum.pdf" --program Adult
    python -m backend.cli_import a.pdf b.pdf c.pdf --program Adult --vision --out name
Several files = one program (e.g. one PDF per rank step). --vision also sends the PDFs themselves.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from .agents.curriculum import run_import
from .extract import extract_text
from .usage import ROOT, log_run


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("files", nargs="+")
    p.add_argument("--program", required=True)
    p.add_argument("--school", default="cli")
    p.add_argument("--vision", action="store_true")
    p.add_argument("--out", default=None)
    args = p.parse_args()

    paths = [Path(f) for f in args.files]
    blobs = [p.read_bytes() for p in paths]
    text = "\n\n".join(f"=== file: {p.name} ===\n{extract_text(p.name, b)}" for p, b in zip(paths, blobs))
    pdfs = [b for p, b in zip(paths, blobs) if p.suffix.lower() == ".pdf"] if args.vision else None
    result = asyncio.run(run_import(text, args.program, pdfs=pdfs))
    log_run("import", args.school, result.usage,
            {"files": [p.name for p in paths], "vision": bool(pdfs), "revised": result.revised})

    name = args.out or paths[0].stem.replace(" ", "_")
    out = ROOT / "output" / f"import_{name}.json"
    out.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    print(json.dumps({"belts": [b.name for b in result.draft.belts],
                      "issues": {s: sum(i.severity == s for i in result.issues) for s in ("error", "warning", "info")},
                      "revised": result.revised, "usage": {k: v for k, v in result.usage.items() if k != "steps"},
                      "saved": str(out)}, indent=2))


if __name__ == "__main__":
    main()
