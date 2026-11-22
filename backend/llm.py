"""The one model every SideKick agent uses: gpt-6-luna.

It is reached with OPENAI_API_KEY (direct) or PORTKEY_API_KEY (course gateway), whichever
is set. The model name is a constant (not an env var), so no other model can slip in
through configuration.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel
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

_model: Model | None = None


def _key(name: str) -> str:
    """Read a key, tolerating stray whitespace/quotes or a whole pasted .env line."""
    key = (os.getenv(name) or "").strip().removeprefix(f"{name}=").strip().strip("'\"").strip()
    print(f"{name} loaded: {len(key)} characters")  # length only, never the key
    return key


def _client(provider: str, key: str) -> AsyncOpenAI:
    if provider == "openai":
        # Explicit base_url: never follow an OPENAI_BASE_URL left in the environment.
        return AsyncOpenAI(base_url="https://api.openai.com/v1", api_key=key)
    # Portkey authenticates with the header; api_key is unused.
    return AsyncOpenAI(base_url=PORTKEY_URL, api_key="portkey-gateway", default_headers={"x-portkey-api-key": key})


def providers() -> list[str]:
    """Configured providers in the order they are tried."""
    return [p for p, name in (("openai", "OPENAI_API_KEY"), ("portkey", "PORTKEY_API_KEY")) if (os.getenv(name) or "").strip()]


def _key_unusable(exc: Exception) -> bool:
    # Switch keys only when a key is rejected or lacks the model. A blocked (content-filtered)
    # or rate-limited prompt is never resent to the other provider.
    return isinstance(exc, ModelHTTPError) and exc.status_code in (401, 404)


def get_model() -> Model:
    """One shared model client for every agent."""
    global _model
    if _model is None:
        models = [
            OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(
                openai_client=_client(p, _key("OPENAI_API_KEY" if p == "openai" else "PORTKEY_API_KEY"))))
            for p in providers()
        ]
        if not models:
            raise RuntimeError("Set OPENAI_API_KEY or PORTKEY_API_KEY (in .env here or one folder up).")
        assert all(m.model_name == "gpt-6-luna" for m in models), "Only gpt-6-luna is allowed."
        _model = models[0] if len(models) == 1 else FallbackModel(*models, fallback_on=_key_unusable)
    return _model
