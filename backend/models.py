"""Shapes the agents must return. Structured output = no free-form text reaches the database."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ─── Curriculum (Import agent output) ────────────────────────────────────────
class Category(BaseModel):
    name: str = Field(description="Heading as written in the document, e.g. 'Nage' or 'Kicks'.")
    items: list[str] = Field(description="Techniques/requirements under this heading, spelled exactly as in the document.")


class Belt(BaseModel):
    name: str = Field(description="Belt being EARNED, e.g. 'Blue Belt' for a 'White to Blue' section.")
    color_hex: str = Field(description="Best-guess display color for the belt, e.g. '#2563eb'.")
    timeframe: str | None = Field(default=None, description="Minimum time if stated, e.g. '18 months'.")
    requirements: list[Category]


class ProgramDraft(BaseModel):
    """One program (e.g. Adult or Kids) = the ordered list of belts after the starting rank."""

    program_name: str
    starting_rank: str = Field(description="The rank a new student starts at, e.g. 'White Belt'.")
    belts: list[Belt] = Field(description="Belts in promotion order, lowest first, NOT including the starting rank.")
    uncertainties: list[str] = Field(
        default_factory=list,
        description="Anything ambiguous in the document the instructor should confirm.",
    )


# ─── Checker output ──────────────────────────────────────────────────────────
Severity = Literal["error", "warning", "info"]


class Issue(BaseModel):
    severity: Severity
    belt: str | None = None
    category: str | None = None
    item: str | None = None
    message: str
    suggestion: str | None = None
    source: Literal["rule", "checker_agent"] = "checker_agent"


class CheckerVerdict(BaseModel):
    issues: list[Issue]
    summary: str = Field(description="Two or three sentences for the instructor.")


class ImportResult(BaseModel):
    draft: ProgramDraft
    issues: list[Issue]
    summary: str
    revised: bool = Field(description="True if the Import agent revised its draft after the Checker's first review.")
    usage: dict


# ─── Class Planner output ────────────────────────────────────────────────────
class Segment(BaseModel):
    minutes: int
    title: str
    techniques: list[str] = Field(description="Only techniques that exist in the school's curriculum.")
    who: str = Field(description="Which students/belts this segment is for.")
    notes: str


class LessonPlan(BaseModel):
    title: str
    total_minutes: int
    segments: list[Segment]
    rationale: str = Field(description="Why these techniques, tied to what the students in class still need.")
