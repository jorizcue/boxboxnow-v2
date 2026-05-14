"""Driver-name normalisation.

Apex emits free-form text in `c4|drteam|<name>` events. The same person
shows up as `PABLO PIMIENTA`, `Pablo Pimienta`, `Pablo Pimieta` (typo),
`PABLO PIMIENTA [0:23]` (trailing stint-time marker), etc. We strip
those variants down to a single canonical key so the rating system
treats them as one driver.

The Phase 0 exploration on 1080 historical logs showed this simple
pipeline catches every accent/casing variant in the wild, including
trailing `[M:SS]` markers and accidental double spaces. Typos beyond
that (single-character diffs) are handled at admin level via the merge
tool, not here — automatic Levenshtein collapsing risks false-positive
merges of legitimately distinct names.
"""
from __future__ import annotations

import re
import unicodedata

# Trailing stint-time marker that Apex appends to the current driver
# string after a relay: "JUAN GARCIA [0:23]". We strip it so the canonical
# key for the driver doesn't change just because their stint clock did.
_STINT_SUFFIX_RE = re.compile(r"\s*\[\d{1,2}:\d{2}\]\s*$")
_WS_RE = re.compile(r"\s+")


def normalize_name(raw: str) -> str:
    """Return the canonical key for a raw Apex driver string.

    Pipeline:
      1. Strip trailing `[M:SS]` stint-time markers.
      2. Unicode NFD decomposition + drop combining marks (removes
         tildes, diéresis, etc).
      3. Uppercase.
      4. Collapse whitespace runs to a single space.
      5. Strip leading/trailing whitespace.

    Returns an empty string for inputs that contain no letters/digits
    (e.g. when Apex sends a placeholder dash). Callers should treat an
    empty result as "no driver attribution" and skip the lap.
    """
    if not raw:
        return ""
    s = _STINT_SUFFIX_RE.sub("", raw)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.upper()
    s = _WS_RE.sub(" ", s).strip()
    # Reject if there's literally nothing alphanumeric left — guards
    # against pathological inputs like "—" or "??".
    if not any(c.isalnum() for c in s):
        return ""
    return s


def display_form(canonical: str) -> str:
    """Convert a canonical key back to a user-friendly display form.

    We don't try to restore accents (we don't know where they were).
    The canonical itself is uppercase ASCII; for display, we title-case
    each word so it reads as a name rather than a shout.
    """
    if not canonical:
        return ""
    return " ".join(w.capitalize() for w in canonical.split(" "))
