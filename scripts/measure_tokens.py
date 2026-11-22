"""Tokenomics: import each curriculum two ways (text only vs. reading the page layout) and record
tokens, cost, revisions, flags, and (for EJJ, which has a hand-verified answer key) accuracy.

    python scripts/measure_tokens.py          → output/token_measurements.json
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.curriculum import run_import  # noqa: E402
from backend.extract import extract_text  # noqa: E402

CASES = [
    ("EJJ Adult", "Adult", ["samples/ejj/Adult Curriculum.pdf"], "adult"),
    ("EJJ Kids", "Kids", ["samples/ejj/Kids Curriculum_white to orange.pdf"], "kids"),
    # The pilot schools' files are their property and are not in the repository.
    ("Pilot 2", "Adult", ["pilot_files/pilot2_1.pdf", "pilot_files/pilot2_2.pdf", "pilot_files/pilot2_3.pdf"], None),
    ("Pilot 1", "Kali", ["pilot_files/pilot1.pdf"], None),
]


def compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def score(draft: dict, key_program: str) -> dict:
    key = next(p for p in json.loads((ROOT / "samples/ejj/answer_key.json").read_text(encoding="utf-8"))
               if p["id"] == key_program)
    def by_belt(belts):
        return {compact(b["name"].split()[0]): Counter(compact(i) for c in b.get("requirements") or [] for i in c["items"])
                for b in belts if b.get("requirements")}
    got, want = by_belt(draft["belts"]), by_belt(key["belts"])
    tp = sum(sum((got.get(b, Counter()) & w).values()) for b, w in want.items())
    fp = sum(sum((g - want.get(b, Counter())).values()) for b, g in got.items())
    fn = sum(sum((w - got.get(b, Counter())).values()) for b, w in want.items())
    return {"techniques_expected": tp + fn, "techniques_correct": tp,
            "precision": round(tp / (tp + fp), 3) if tp + fp else 0, "recall": round(tp / (tp + fn), 3) if tp + fn else 0}


async def run_case(label, program, files, key, read_layout):
    paths = [ROOT / f for f in files]
    blobs = [p.read_bytes() for p in paths]
    text = "\n\n".join(f"=== file: {p.name} ===\n{extract_text(p.name, b)}" for p, b in zip(paths, blobs))
    started = time.perf_counter()
    result = await run_import(text, program, pdfs=blobs if read_layout else None)
    seconds = round(time.perf_counter() - started, 1)
    row = {
        "curriculum": label, "mode": "read layout" if read_layout else "text only",
        "seconds": seconds, "revised": result.revised,
        "ranks": [b.name for b in result.draft.belts],
        "techniques": sum(len(c.items) for b in result.draft.belts for c in b.requirements),
        "flags": {s: sum(i.severity == s for i in result.issues) for s in ("error", "warning", "info")},
        **{k: v for k, v in result.usage.items() if k != "steps"}, "steps": result.usage["steps"],
    }
    if key:
        row["accuracy"] = score(result.draft.model_dump(), key)
    print(f"{label:12} {row['mode']:12} {row['total_tokens']:>7,} tok  ${row['est_cost_usd']:.5f}  "
          f"{seconds:>5}s  revised={row['revised']}  flags={row['flags']}  {row.get('accuracy', '')}")
    return row


async def main() -> None:
    rows = []
    for label, program, files, key in CASES:
        for read_layout in (False, True):
            rows.append(await run_case(label, program, files, key, read_layout))
    out = ROOT / "output" / "token_measurements.json"
    out.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"saved {out}")


if __name__ == "__main__":
    asyncio.run(main())
