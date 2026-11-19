"""Score an Import agent result against a hand-verified answer key.

    python scripts/score_import.py output/import_Adult_Curriculum.json samples/ejj/answer_key.json adult

Technique-level precision/recall (was each technique found, under the right belt?)
plus heading placement. Text is compared case/punctuation-insensitively.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter


def compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def belt_key(name: str) -> str:
    return compact(name.split()[0])  # "Blue Belt" -> "blue"


def items_by_belt(belts, req_key, cat_key, items_key):
    out = {}
    for b in belts:
        reqs = b.get(req_key) or []
        out[belt_key(b["name"])] = Counter(compact(i) for c in reqs for i in c[items_key])
    return out


def main() -> None:
    result_path, key_path, program = sys.argv[1:4]
    draft = json.load(open(result_path, encoding="utf-8"))["draft"]
    key = next(p for p in json.load(open(key_path, encoding="utf-8")) if p["id"] == program)

    got = items_by_belt(draft["belts"], "requirements", "name", "items")
    want = items_by_belt([b for b in key["belts"] if b.get("requirements")], "requirements", "category", "items")

    tp = fp = fn = 0
    rows = []
    for belt in sorted(set(got) | set(want), key=lambda b: list(want).index(b) if b in want else 99):
        g, w = got.get(belt, Counter()), want.get(belt, Counter())
        hit = sum((g & w).values())
        tp += hit
        fp += sum((g - w).values())
        fn += sum((w - g).values())
        rows.append({"belt": belt, "expected": sum(w.values()), "found": hit,
                     "missing": sorted((w - g).elements()), "extra": sorted((g - w).elements())})

    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    print(json.dumps({"program": program,
                      "belts_expected": [belt_key(b["name"]) for b in key["belts"] if b.get("requirements")],
                      "belts_found": [belt_key(b["name"]) for b in draft["belts"]],
                      "techniques_expected": tp + fn, "techniques_correct": tp,
                      "precision": round(precision, 3), "recall": round(recall, 3), "per_belt": rows}, indent=2))


if __name__ == "__main__":
    main()
