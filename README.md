# SideKick — every coach needs a sidekick

**Live app:** https://sidekick-dojo.netlify.app  ·  **API:** https://sidekick-api-k5iz.onrender.com/api/health

SideKick is an AI assistant instructor for martial arts schools. A school owner uploads the curriculum
PDFs they already hand out; an **Import agent** turns them into rank-by-rank checklists, a **Checker
agent** reviews the result against the original document, and nothing reaches students until the
instructor approves it. Students and parents then track progress toward their next rank, and an
optional **Class Planner agent** drafts a lesson around what the students on the mat still need.

MGT 409 final project · Matt Nye · model: **gpt-6-luna** for every agent (`OPENAI_API_KEY`, or the course `PORTKEY_API_KEY`).

---

## Try it online (recommended, about 5 minutes)

1. Open https://sidekick-dojo.netlify.app → **New here? Create an account**. Confirm the email
   (Supabase's sender can take a few minutes and may land in spam), then sign in.
2. Choose **I run a school**, give it any name and code.
3. **Curriculum** tab → upload `samples/ejj/Adult Curriculum.pdf` from this repo, program name `Adult`,
   click **Import with SideKick** (about 30–60 seconds).
4. Review the draft: every flag from the Checker agent and the automatic checks is listed beside the
   item it concerns; edit or remove items, then **Approve & publish**. The cost card shows the tokens used.
5. **Members & Roster** → **+ Add student** (a few, at different ranks) → **Class Planner** → tick them
   in → **Draft a plan**.
6. **AI Usage** shows every agent run (tokens, cost) against the school's monthly budget.
7. Optional, student view: sign up a second account → **I'm a student or parent** → enter your school
   code → approve it from **Members & Roster** → set its rank. The student sees only the ranks your
   **What students can see** setting allows; the database withholds the rest.

## Run it locally (fresh clone)

Needs Python 3.12+ and Node 20+. The database is the hosted Supabase project (its URL and publishable
key are public and built in), so the only secret is one AI key.

```bash
# 1. Key: OPENAI_API_KEY or PORTKEY_API_KEY in .env here, or in the .env one folder up (graders' layout)
cp .env.example .env            # then fill in either key (or skip if ../.env has one)

# 2. API (agents) — from the repo folder
pip install -r requirements.txt
python -m uvicorn backend.main:app --port 8000

# 3. Web app — in a second terminal
cd frontend
npm install
npm run dev                     # opens http://localhost:5173
```

The local web app talks to the local API at `http://localhost:8000` by default.

### Command-line tools (no web app needed)

```bash
python -m backend.cli_import "samples/ejj/Adult Curriculum.pdf" --program Adult            # text only
python -m backend.cli_import "samples/ejj/Adult Curriculum.pdf" --program Adult --vision   # + page layout
python scripts/score_import.py output/import_Adult_Curriculum.json samples/ejj/answer_key.json adult
python scripts/safety_tests.py      # prompt injection, invented/dropped techniques, planner guardrail
python scripts/measure_tokens.py    # tokens, cost and accuracy for every curriculum, both modes
```

## How it works

```
 Instructor uploads PDF(s)
        │
        ▼
 ┌──────────────┐  draft   ┌───────────────┐  draft + flags  ┌──────────────┐  issues  ┌──────────────┐
 │ text + page  │ ───────► │ Import agent  │ ──────────────► │ Automatic    │ ───────► │ Checker      │
 │ extraction   │          │ (gpt-6-luna)  │                 │ rules (free) │          │ agent        │
 └──────────────┘          └───────────────┘                 └──────────────┘          └──────┬───────┘
                                  ▲   one bounded revision if anything is marked "error"     │
                                  └──────────────────────────────────────────────────────────┘
                                                             │
                                                             ▼
                                   Instructor reviews, edits, approves ──► publish_import (database)
                                                                               │
                         students see only the ranks their school allows  ◄────┘

 Class Planner agent ── tools: class_roster · student_gaps · rank_requirements  (today's students only)
                    └─ guardrail removes any technique that isn't in the school's curriculum
```

| Piece | What it is |
|---|---|
| `backend/agents/curriculum.py` | Import agent → rules → Checker agent → at most one revision |
| `backend/rules.py` | Zero-token checks: invented techniques, dropped lines, duplicates, empty headings |
| `backend/agents/planner.py` | Class Planner agent and its three tools; post-run guardrail |
| `backend/main.py` | FastAPI: auth (acts as the signed-in user), rate limit, monthly token budget, usage log |
| `backend/llm.py` | The single model: `gpt-6-luna` via OpenAI or Portkey; key read from `.env` here or one folder up |
| `supabase/schema.sql`, `supabase/migrations/` | Multi-school database with Row Level Security; rank-gated curriculum |
| `frontend/` | React (Vite) web app |
| `samples/ejj/` | Sample curriculum (Evolution Jujutsu, used with permission) + hand-verified answer key |

## Safety

* **Uploaded documents are data, not instructions.** Blatant injections are blocked by the model
  provider's content filter; subtler ones reach the agent, are ignored, and are flagged to the instructor
  (`scripts/safety_tests.py`, results in the report).
* **No invented techniques.** Every item must appear in the uploaded document; the planner's output is
  filtered against the published curriculum.
* **Human approval.** Agent output becomes visible to students only through `publish_import`, which only
  school staff can call.
* **Least privilege.** The API never holds a database master key: every query runs as the signed-in user,
  so Row Level Security limits the agents exactly as it limits people. Schools cannot see each other.
* **Overspending.** Per-call token caps and request limits, and 10 AI runs per user per hour. Each plan has a
  monthly AI allowance; normal overage is absorbed (a school never "runs out"), and only usage at 10x the
  allowance (a runaway bug or misuse) is paused, checked against an append-only usage log.

## Not included

The two pilot schools' curricula (their property) are excluded from this repository.
