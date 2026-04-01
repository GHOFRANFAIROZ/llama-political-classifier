# backfill_org_tokens.py
from firebase_admin_setup import db
import re

TOKEN_RE = re.compile(r"[A-Za-z\u0600-\u06FF0-9_]+")

def tokenize(text: str):
    if not text:
        return []
    words = [w.lower() for w in TOKEN_RE.findall(text)]
    words = [w for w in words if len(w) >= 3]
    seen = set()
    out = []
    for w in words:
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out

def backfill(org_id: str):
    col = db.collection(f"reports_{org_id}")
    total = 0
    updated = 0

    for doc in col.stream():
        total += 1
        data = doc.to_dict() or {}

        # إذا موجودة tokens، نتخطى
        if data.get("searchable_tokens"):
            continue

        text = (data.get("text") or "").strip()
        reason = (data.get("reason_ar") or "").strip()

        searchable_text = f"{text} {reason}".lower().strip()
        tokens = tokenize(text) + tokenize(reason)
        tokens = list(dict.fromkeys(tokens))

        doc.reference.update({
            "searchable_text": searchable_text,
            "searchable_tokens": tokens,
        })
        updated += 1

    print(f"Backfill done for {org_id}: total={total}, updated={updated}")

if __name__ == "__main__":
    backfill("anti_hate_org")