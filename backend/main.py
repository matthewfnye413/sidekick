"""SideKick API: the agents behind the web app.

    python -m uvicorn backend.main:app --port 8000      (from the repo folder)
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic_ai.exceptions import AgentRunError, ModelHTTPError, UsageLimitExceeded

from .agents.curriculum import run_import
from .agents.planner import run_planner
from .db import DBError, UserDB
from .extract import ExtractError, extract_text
from .usage import UsageMeter, log_run

_http: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http
    _http = httpx.AsyncClient(timeout=30)
    yield
    await _http.aclose()


app = FastAPI(title="SideKick API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # The deployed site's address comes from ALLOWED_ORIGINS (comma-separated) on the host.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   *[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# Turn agent/database failures into readable JSON errors. (Handlers for specific exception
# types run inside the CORS middleware, so the browser sees the message, not "Failed to fetch".)
@app.exception_handler(AgentRunError)
async def agent_error(request: Request, exc: AgentRunError):
    if isinstance(exc, UsageLimitExceeded):
        msg = "The AI run hit its safety limit and was stopped before finishing. Try a smaller file or class."
    elif isinstance(exc, ModelHTTPError) and exc.status_code in (401, 403):
        msg = "The AI service rejected SideKick's API key. The site owner needs to check the server's PORTKEY_API_KEY."
    else:
        msg = "The AI service had a problem finishing this request. Please try again."
    print(f"Agent error on {request.url.path}: {exc!r}")
    return JSONResponse(status_code=502, content={"detail": msg})


@app.exception_handler(DBError)
async def db_error(request: Request, exc: DBError):
    return JSONResponse(status_code=exc.status if exc.status < 500 else 502, content={"detail": str(exc)})


MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB per file
MAX_FILES = 6
RATE_LIMIT = (10, 3600)  # at most 10 AI runs per user per hour
_recent: dict[str, deque] = defaultdict(deque)


# ─── Auth: every request acts as the signed-in user ──────────────────────────
class Caller(BaseModel):
    id: str
    email: str
    db: UserDB

    model_config = {"arbitrary_types_allowed": True}


async def caller(authorization: str = Header(default="")) -> Caller:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in first.")
    db = UserDB(authorization.removeprefix("Bearer ").strip(), _http)
    try:
        user = await db.user()
    except DBError:
        raise HTTPException(401, "Your session expired. Sign in again.")
    return Caller(id=user["id"], email=user.get("email", ""), db=db)


async def require_staff_with_budget(school_id: str, who: Caller) -> None:
    """Three overspending guards: staff only, per-user rate limit, per-school monthly token budget."""
    if not await who.db.rpc("is_staff", sid=school_id):
        raise HTTPException(403, "Only the school's owner or instructors can use the AI tools.")

    now, window = time.time(), _recent[who.id]
    while window and now - window[0] > RATE_LIMIT[1]:
        window.popleft()
    if len(window) >= RATE_LIMIT[0]:
        raise HTTPException(429, f"Limit reached: {RATE_LIMIT[0]} AI runs per hour. Try again later.")
    window.append(now)

    school = (await who.db.select("schools", select="monthly_token_budget", id=f"eq.{school_id}"))[0]
    used = await who.db.rpc("tokens_used_this_month", p_school=school_id)
    if used >= school["monthly_token_budget"]:
        raise HTTPException(402, f"This school used its monthly AI budget ({used:,} of "
                                 f"{school['monthly_token_budget']:,} tokens).")


async def record_usage(who: Caller, school_id: str, kind: str, usage: dict) -> None:
    await who.db.insert("usage_events", {
        "school_id": school_id, "kind": kind, "input_tokens": usage["input_tokens"],
        "cached_input_tokens": usage["cached_input_tokens"], "output_tokens": usage["output_tokens"],
        "est_cost_usd": usage["est_cost_usd"]})
    log_run(kind, school_id, usage)


# ─── Routes ──────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"ok": True, "model": "gpt-6-luna"}


@app.post("/api/schools/{school_id}/imports")
async def create_import(school_id: str, program_name: str = Form(...), read_layout: bool = Form(True),
                        files: list[UploadFile] = File(...), who: Caller = Depends(caller)):
    if not 1 <= len(files) <= MAX_FILES:
        raise HTTPException(400, f"Upload between 1 and {MAX_FILES} files.")
    blobs = []
    for f in files:
        data = await f.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(400, f"{f.filename} is larger than 8 MB.")
        blobs.append((f.filename or "upload", data))
    try:
        text = "\n\n".join(f"=== file: {name} ===\n{extract_text(name, data)}" for name, data in blobs)
    except ExtractError as e:
        raise HTTPException(400, str(e))

    await require_staff_with_budget(school_id, who)

    meter = UsageMeter()
    pdfs = [data for name, data in blobs if name.lower().endswith(".pdf")] if read_layout else None
    result = await run_import(text, program_name.strip()[:80], meter=meter, pdfs=pdfs)
    await record_usage(who, school_id, "import", result.usage)

    row = await who.db.insert("imports", {
        "school_id": school_id, "program_name": program_name.strip()[:80],
        "files": [name for name, _ in blobs], "draft": result.draft.model_dump(),
        "issues": [i.model_dump() for i in result.issues], "summary": result.summary,
        "usage": {**result.usage, "revised": result.revised, "read_layout": bool(pdfs)}})
    return row


class PlanRequest(BaseModel):
    student_ids: list[str] = Field(min_length=1, max_length=60)
    minutes: int = Field(ge=15, le=180)
    focus: str = Field(default="", max_length=300)


@app.post("/api/schools/{school_id}/lesson-plan")
async def lesson_plan(school_id: str, req: PlanRequest, who: Caller = Depends(caller)):
    await require_staff_with_budget(school_id, who)
    meter = UsageMeter()
    try:
        plan, removed = await run_planner(who.db, school_id, req.student_ids, req.minutes, req.focus, meter)
    except ValueError as e:
        raise HTTPException(400, str(e))
    usage = meter.summary()
    await record_usage(who, school_id, "lesson_plan", usage)
    saved = await who.db.insert("lesson_plans", {
        "school_id": school_id, "request": req.model_dump(), "plan": plan.model_dump(),
        "usage": {**usage, "removed_invented": removed}})
    return saved
