# backfill_public_tokens.py

from firebase_admin_setup import db
from firestore_utils import _tokenize
from firebase_admin import firestore

BATCH = 300

def backfill():
    ref = db.collection("reports_public")
    docs = list(ref.stream())

    batch = db.batch()
    count = 0

    for doc in docs:
        data = doc.to_dict() or {}

        if data.get("searchable_tokens"):
            continue

        text = data.get("text", "")
        reason = data.get("reason_ar", "")

        tokens = _tokenize(f"{text} {reason}")

        update = {
            "searchable_tokens": tokens,
            "searchable_text": f"{text} {reason}".lower(),
        }

        batch.update(doc.reference, update)

        count += 1

        if count % BATCH == 0:
            batch.commit()
            batch = db.batch()
            print(f"Updated {count}")

    batch.commit()
    print("Backfill finished.")

if __name__ == "__main__":
    backfill()