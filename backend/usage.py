"""Token accounting for every agent call, so the app can show (and cap) what each run costs."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
USAGE_LOG = ROOT / "output" / "usage_log.jsonl"

# gpt-6-luna list price per 1M tokens (USD), prompts under 272K tokens.
# Source: genai_prices data (ref https://developers.openai.com/api/docs/models/gpt-6-luna).
PRICE_PER_M = {"input": 0.10, "cached_input": 0.01, "output": 0.50}


@dataclass
class UsageMeter:
    steps: list[dict] = field(default_factory=list)

    def add(self, step: str, usage) -> None:
        cached = getattr(usage, "cache_read_tokens", 0) or 0
        self.steps.append({
            "step": step,
            "requests": usage.requests,
            "input_tokens": usage.input_tokens or 0,
            "cached_input_tokens": cached,
            "output_tokens": usage.output_tokens or 0,
        })

    def summary(self) -> dict:
        total = {k: sum(s[k] for s in self.steps) for k in ("requests", "input_tokens", "cached_input_tokens", "output_tokens")}
        uncached = total["input_tokens"] - total["cached_input_tokens"]
        cost = (uncached * PRICE_PER_M["input"] + total["cached_input_tokens"] * PRICE_PER_M["cached_input"]
                + total["output_tokens"] * PRICE_PER_M["output"]) / 1_000_000
        return {**total, "total_tokens": total["input_tokens"] + total["output_tokens"],
                "est_cost_usd": round(cost, 5), "steps": self.steps}


def log_run(kind: str, school: str, usage: dict, extra: dict | None = None) -> None:
    USAGE_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "kind": kind, "school": school,
             "model": "gpt-6-luna", **usage, **(extra or {})}
    with USAGE_LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
