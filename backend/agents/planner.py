"""Class Planner agent: drafts a lesson plan from what today's students still need.

Its tools only see the students the instructor checked in (least privilege), and the data is
loaded through the instructor's own database session, so Row Level Security still applies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import UsageLimits

from ..db import UserDB
from ..llm import MODEL_SETTINGS, get_model
from ..models import LessonPlan
from ..rules import compact
from ..usage import UsageMeter

PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "planner.md").read_text(encoding="utf-8")
PLAN_LIMITS = UsageLimits(request_limit=8, tool_calls_limit=20, total_tokens_limit=80_000)


MODES = {"new": "NEW material (what students still need)", "review": "REVIEW (only what students have already learned)",
         "mix": "a MIX of review and new material"}


def item_key(category: str, item: str) -> str:
    return f"{category}::{item}"  # same key the student checklist stores


@dataclass
class ClassData:
    students: list[dict]
    ranks_by_program: dict[str, list[dict]]   # program_id -> ranks ordered by sort
    programs: dict[str, dict]
    done: dict[str, set[str]] = field(default_factory=dict)  # student_id -> {"rank_id|item_key"}

    def next_rank(self, s: dict) -> dict | None:
        ranks = self.ranks_by_program.get(s["program_id"], [])
        return ranks[s["current_rank_sort"]] if s["current_rank_sort"] < len(ranks) else None

    def current_rank_name(self, s: dict) -> str:
        if s["current_rank_sort"] == 0:
            return self.programs[s["program_id"]]["starting_rank"]
        return self.ranks_by_program[s["program_id"]][s["current_rank_sort"] - 1]["name"]

    def gaps(self, s: dict) -> list[str]:
        rank = self.next_rank(s)
        if not rank:
            return []
        done = self.done.get(s["id"], set())
        return [f"{c['name']}: {i}" for c in rank["requirements"] for i in c["items"]
                if f"{rank['id']}|{item_key(c['name'], i)}" not in done]

    def learned(self, s: dict) -> list[tuple[str, str]]:
        """(heading, technique) pairs a student already has: every earned rank, plus checked-off next-rank items."""
        ranks = self.ranks_by_program.get(s["program_id"], [])
        done = self.done.get(s["id"], set())
        return [(c["name"], i) for n, r in enumerate(ranks) for c in r["requirements"] for i in c["items"]
                if n < s["current_rank_sort"] or f"{r['id']}|{item_key(c['name'], i)}" in done]

    def learned_items(self) -> set[str]:
        """Everything at least one checked-in student has learned (the only material a review may list)."""
        return {compact(i) for s in self.students for _, i in self.learned(s)}

    def all_items(self) -> set[str]:
        return {compact(i) for ranks in self.ranks_by_program.values() for r in ranks
                for c in r["requirements"] for i in [*c["items"], c["name"]]}


async def load_class(db: UserDB, school_id: str, student_ids: list[str]) -> ClassData:
    ids = ",".join(student_ids)
    students = await db.select("students", select="id,name,program_id,current_rank_sort",
                               school_id=f"eq.{school_id}", id=f"in.({ids})")
    if not students:
        raise ValueError("None of those students were found in your school.")
    program_ids = ",".join({s["program_id"] for s in students})
    programs = await db.select("programs", select="id,name,starting_rank", id=f"in.({program_ids})")
    ranks = await db.select("ranks", select="id,program_id,sort,name,requirements",
                            program_id=f"in.({program_ids})", order="sort")
    progress = await db.select("progress", select="student_id,rank_id,item_key",
                               student_id=f"in.({','.join(s['id'] for s in students)})")
    data = ClassData(students=students, programs={p["id"]: p for p in programs}, ranks_by_program={})
    for r in ranks:
        data.ranks_by_program.setdefault(r["program_id"], []).append(r)
    for p in progress:
        data.done.setdefault(p["student_id"], set()).add(f"{p['rank_id']}|{p['item_key']}")
    return data


planner = Agent(get_model(), deps_type=ClassData, output_type=LessonPlan, instructions=PROMPT,
                model_settings=MODEL_SETTINGS, name="planner")


@planner.tool
def class_roster(ctx: RunContext[ClassData]) -> list[dict]:
    """Everyone checked in to today's class: program, current rank, next rank, techniques left."""
    d = ctx.deps
    out = []
    for s in d.students:
        nxt = d.next_rank(s)
        out.append({"student_id": s["id"], "name": s["name"], "program": d.programs[s["program_id"]]["name"],
                    "current_rank": d.current_rank_name(s), "next_rank": nxt["name"] if nxt else None,
                    "techniques_left_for_next_rank": len(d.gaps(s))})
    return out


@planner.tool
def student_gaps(ctx: RunContext[ClassData], student_ids: list[str]) -> dict[str, list[str]]:
    """Next-rank techniques each student has NOT checked off yet ('Heading: technique')."""
    by_id = {s["id"]: s for s in ctx.deps.students}
    return {sid: ctx.deps.gaps(by_id[sid]) if sid in by_id else ["(not in today's class)"] for sid in student_ids}


@planner.tool
def learned_material(ctx: RunContext[ClassData]) -> list[dict]:
    """Every technique today's students have ALREADY learned (from ranks they earned and items checked off),
    grouped by exactly which students know it, largest group first."""
    d = ctx.deps
    knows: dict[str, dict[str, str]] = {}  # technique -> {student_id: name}
    for s in d.students:
        for c, i in d.learned(s):
            knows.setdefault(f"{c}: {i}", {})[s["id"]] = s["name"]
    groups: dict[tuple[str, ...], list[str]] = {}
    for technique, who in knows.items():
        groups.setdefault(tuple(sorted(who)), []).append(technique)
    names = {s["id"]: s["name"] for s in d.students}
    return [{"known_by": "everyone" if len(g) == len(d.students) else [names[x] for x in g], "techniques": t}
            for g, t in sorted(groups.items(), key=lambda kv: -len(kv[0]))]


@planner.tool
def rank_requirements(ctx: RunContext[ClassData], program: str, rank: str) -> list[dict]:
    """The full requirement list for one rank of one program."""
    for pid, p in ctx.deps.programs.items():
        if compact(p["name"]) == compact(program):
            for r in ctx.deps.ranks_by_program.get(pid, []):
                if compact(r["name"]) == compact(rank):
                    return r["requirements"]
    return [{"error": f"No rank '{rank}' in program '{program}' for today's students."}]


async def run_planner(db: UserDB, school_id: str, student_ids: list[str], minutes: int, focus: str,
                      meter: UsageMeter, mode: str = "new") -> tuple[LessonPlan, list[str]]:
    data = await load_class(db, school_id, student_ids)
    if mode == "review" and not data.learned_items():
        raise ValueError("No one checked in has learned any material yet, so there is nothing to review. "
                         "Choose new material, or check off what they know under Promotion Readiness.")
    prompt = (f"Class length: {minutes} minutes.\nPlan around: {MODES[mode]}\n"
              f"What the instructor wants to train: {focus or '(none given)'}\nStudents checked in: {len(data.students)}")
    result = await planner.run(prompt, deps=data, usage_limits=PLAN_LIMITS)
    meter.add("planner", result.usage)
    plan = result.output
    # A review may only list what someone here has learned; any other plan, what is in the curriculum.
    removed = strip_invented(plan, data.learned_items() if mode == "review" else data.all_items())
    return plan, removed


def strip_invented(plan: LessonPlan, known: set[str]) -> list[str]:
    """Guardrail: drop any technique that isn't in the school's curriculum. Returns what was removed."""
    removed: list[str] = []
    for seg in plan.segments:
        keep = []
        for t in seg.techniques:
            name = t.split(":", 1)[-1].strip()  # techniques may come back as "Heading: Technique"
            (keep if compact(name) in known or compact(t) in known else removed).append(t)
        seg.techniques = keep
    return removed
