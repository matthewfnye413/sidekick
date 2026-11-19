"""Talk to Supabase AS THE LOGGED-IN USER.

The backend never holds a master key: every query carries the user's own access token,
so Row Level Security decides what the request (and any agent working for it) can see.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

# Public values (safe to commit): the project URL and its publishable key.
SUPABASE_URL = os.getenv("SIDEKICK_SUPABASE_URL", "https://oewmzdttlqspfxnbpgfh.supabase.co")
PUBLISHABLE_KEY = os.getenv("SIDEKICK_SUPABASE_KEY", "sb_publishable_wC5z5UaXKF3yb166ITxUOA_7oxUBA9X")


class DBError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class UserDB:
    """A thin PostgREST client bound to one user's access token."""

    def __init__(self, token: str, client: httpx.AsyncClient):
        self.token = token
        self.client = client
        self.headers = {"apikey": PUBLISHABLE_KEY, "Authorization": f"Bearer {token}"}

    async def _send(self, method: str, path: str, **kw) -> Any:
        r = await self.client.request(method, f"{SUPABASE_URL}{path}", headers={**self.headers, **kw.pop("headers", {})}, **kw)
        if r.status_code >= 400:
            try:
                msg = r.json().get("message") or r.text
            except ValueError:
                msg = r.text
            raise DBError(r.status_code, msg)
        return r.json() if r.content else None

    async def user(self) -> dict:
        return await self._send("GET", "/auth/v1/user")

    async def select(self, table: str, **params: str) -> list[dict]:
        return await self._send("GET", f"/rest/v1/{table}", params=params)

    async def insert(self, table: str, row: dict) -> dict:
        rows = await self._send("POST", f"/rest/v1/{table}", json=row, headers={"Prefer": "return=representation"})
        return rows[0]

    async def rpc(self, fn: str, **args: Any) -> Any:
        return await self._send("POST", f"/rest/v1/rpc/{fn}", json=args)
