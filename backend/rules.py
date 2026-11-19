"""Deterministic checks that run before (and after) the Checker agent.

They cost zero tokens and catch the two failures that matter most for a curriculum:
  * invented techniques (an item that is not in the uploaded document), and
  * dropped techniques (a line in the document that never made it into the draft).
"""

from __future__ import annotations

import re
import unicodedata

from .models import Issue, ProgramDraft

_PAGE_MARK = re.compile(r"^-+\s*page \d+\s*-+$", re.I)
_FILE_MARK = re.compile(r"^=+\s*file: .*=+$")


def compact(s: str) -> str:
    """Lowercase letters and digits only, so line wraps, dashes and spacing don't matter."""
    s = unicodedata.normalize("NFKD", s).lower()
    return re.sub(r"[^a-z0-9]", "", s)


def draft_strings(draft: ProgramDraft) -> list[str]:
    out = [draft.program_name, draft.starting_rank]
    for belt in draft.belts:
        out += [belt.name, belt.timeframe or ""]
        for cat in belt.requirements:
            out.append(cat.name)
            out += cat.items
    return out


def _all_words_in(text: str, source: str) -> bool:
    words = [compact(w) for w in text.split()]
    words = [w for w in words if w]
    return bool(words) and all(w in source for w in words)


def _is_section_title(key: str, draft: ProgramDraft) -> bool:
    """'White to Blue (18 months)' is covered by the Blue Belt entry (its color word + timeframe)."""
    for belt in draft.belts:
        color = compact(belt.name.split()[0]) if belt.name.split() else ""
        if color and color in key and (not belt.timeframe or compact(belt.timeframe) in key):
            return True
    return False


def check(draft: ProgramDraft, source_text: str) -> list[Issue]:
    issues: list[Issue] = []
    source = compact(source_text)

    if not draft.belts:
        issues.append(Issue(severity="error", message="No belts were found.", source="rule"))

    for belt in draft.belts:
        if not belt.requirements:
            issues.append(Issue(severity="error", belt=belt.name, message="Belt has no requirements.", source="rule"))
        for cat in belt.requirements:
            if not cat.items:
                issues.append(Issue(severity="warning", belt=belt.name, category=cat.name,
                                    message="Heading has no techniques under it.", source="rule"))
            # Same technique under two headings is normal (a choke as submission and as self-defense);
            # twice under the SAME heading is a mistake.
            seen: set[str] = set()
            for item in cat.items:
                key = compact(item)
                # 1. Invented? Every technique must appear in the uploaded document, either
                # verbatim or (for table layouts that split a cell across lines) word by word.
                if key and key not in source and not _all_words_in(item, source):
                    issues.append(Issue(
                        severity="error", belt=belt.name, category=cat.name, item=item,
                        message="Not found in the uploaded document; the agent may have invented or reworded it.",
                        suggestion="Remove it, or correct it to match the document's wording.", source="rule"))
                # 2. Duplicate under the same heading?
                if key in seen:
                    issues.append(Issue(
                        severity="warning", belt=belt.name, category=cat.name, item=item,
                        message="Listed twice under this heading.", source="rule"))
                seen.add(key)

    # 3. Dropped? Every non-heading line in the document should be covered by the draft.
    corpus = compact(" ".join(draft_strings(draft)))
    reported: set[str] = set()
    for raw in source_text.splitlines():
        line = raw.strip()
        if not line or _PAGE_MARK.match(line) or _FILE_MARK.match(line) or line.endswith(":") or line in reported:
            continue
        key = compact(line)
        if len(key) < 3 or key in corpus or _is_section_title(key, draft):
            continue
        # Table layouts get extracted with columns interleaved on one line, so also accept a line
        # when most of its words appear somewhere in the draft.
        words = [compact(w) for w in line.split() if len(compact(w)) >= 3]
        if words and sum(w in corpus for w in words) / len(words) >= 0.7:
            continue
        reported.add(line)
        issues.append(Issue(
            severity="warning", item=line,
            message="This line from the document is not in the draft.",
            suggestion="Add it under the right belt and heading, or confirm it isn't a requirement.", source="rule"))
    return issues
