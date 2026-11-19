"""Turn an uploaded curriculum file into plain text the Import agent can read."""

from __future__ import annotations

import io
from pathlib import Path

import pypdf

MAX_CHARS = 60_000  # ~15k tokens; a curriculum longer than this is almost certainly not a curriculum


class ExtractError(ValueError):
    pass


def extract_text(filename: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = [f"--- page {i} ---\n{(p.extract_text() or '').strip()}" for i, p in enumerate(reader.pages, 1)]
        text = "\n\n".join(pages)
    elif suffix in (".txt", ".md"):
        text = data.decode("utf-8", errors="replace")
    else:
        raise ExtractError(f"Unsupported file type {suffix!r}. Upload a PDF or a text file.")

    if len(text.strip()) < 40:
        raise ExtractError("No readable text found. If this is a scanned image, export it as a text PDF.")
    if len(text) > MAX_CHARS:
        raise ExtractError(f"File is too long ({len(text):,} characters; limit {MAX_CHARS:,}).")
    return text
