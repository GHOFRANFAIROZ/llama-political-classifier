# dedupe_utils.py

import hashlib
import logging

logger = logging.getLogger("dedupe-utils")


# ================================
# Clean text (same logic as original)
# ================================
def clean_text(text: str):
    if not text:
        return ""
    return text.replace("\n", " ").strip()[:1000]


# ================================
# Build dedupe key
# ================================
def make_dedupe_key(source: str, url: str, text: str) -> str:
    base = f"{(source or '').strip().lower()}|{(url or '').strip()}|{clean_text(text)}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


# ================================
# Return column index of a header
# ================================
def find_col_index(headers, name: str):
    try:
        return headers.index(name) + 1
    except ValueError:
        return None


# ================================
# Check for duplicates in last N rows
# ================================
def is_duplicate(ws, dedupe_key: str, check_last: int = 150) -> bool:
    if not dedupe_key:
        return False

    try:
        headers = ws.row_values(1)
        if not headers:
            return False

        col_index = find_col_index(headers, "DedupeKey")
        if not col_index:
            return False

        values = ws.col_values(col_index)
        tail = values[-check_last:] if len(values) > check_last else values

        return dedupe_key in tail

    except Exception as e:
        logger.warning(f"[Dedupe Error] {e}")
        return False