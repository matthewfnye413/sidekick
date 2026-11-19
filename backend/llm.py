"""The one model every SideKick agent uses: gpt-6-luna through the Portkey gateway.

The course key allows ONLY gpt-6-luna, so the name is a constant (not an env var)
and no other model can slip in through configuration.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

ROOT = Path(__file__).resolve().parent.parent
# Look for .env in the repo first, then one folder up (where the graders keep theirs).
for env in (ROOT / ".env", ROOT.parent / ".env"):
    load_dotenv(env)

MODEL_NAME = "gpt-6-luna"
PORTKEY_URL = "https://api.portkey.ai/v1"

# Cap each model reply so one runaway answer can't burn the budget.
MODEL_SETTINGS = ModelSettings(max_tokens=8000)

_model: OpenAIResponsesModel | None = None


def get_model() -> OpenAIResponsesModel:
    """One shared model client for every agent."""
    global _model
    if _model is None:
        # Tolerate stray whitespace/quotes from pasting the key into a hosting dashboard.
        key = (os.getenv("PORTKEY_API_KEY") or "").strip().strip("'\"").strip()
        print(f"PORTKEY_API_KEY loaded: {len(key)} characters")  # length only, never the key
        if not key:
            raise RuntimeError("PORTKEY_API_KEY is not set (put it in .env here or one folder up).")
        client = AsyncOpenAI(
            base_url=PORTKEY_URL,
            api_key="portkey-gateway",  # unused; Portkey authenticates with the header below
            default_headers={"x-portkey-api-key": key},
        )
        _model = OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))
    assert _model.model_name == "gpt-6-luna", "Only gpt-6-luna is allowed on the course key."
    return _model
