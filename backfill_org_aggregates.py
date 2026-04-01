# backfill_org_aggregates.py (reset-safe)
from __future__ import annotations

import argparse
import os
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from firebase_admin_setup import db
from firebase_admin import firestore

from firestore_utils import (
    _to_datetime,
    _tokenize,
    _analytics_days_ref,
    _analytics_meta_ref,
    _terms_days_ref,
    HATE_LABELS,
)

# ----------------------------
# Helpers
# ----------------------------

def _day_key(dt: datetime) -> str:
    return dt.date().isoformat()  # YYYY-MM-DD


def _safe_platform(data: Dict[str, Any]) -> str:
    return (data.get("source") or data.get("platform") or "unknown").strip() or "unknown"


def _safe_label(data: Dict[str, Any]) -> str:
    return (data.get("label_id") or "UNKNOWN").strip() or "UNKNOWN"


def _is_hate(label_id: str) -> bool:
    return label_id in set(HATE_LABELS)


def _limited_terms(data: Dict[str, Any], max_terms: int = 20) -> List[str]:
    toks = data.get("searchable_tokens") or []
    if not toks:
        toks = _tokenize((data.get("text") or "") + " " + (data.get("reason_ar") or ""))
    out: List[str] = []
    for t in toks:
        if not t:
            continue
        tl = str(t).lower()
        if len(tl) < 3:
            continue
        # safety: no dots in field names
        if "." in tl:
            tl = tl.replace(".", "_")
        out.append(tl)
        if len(out) >= max_terms:
            break
    return out


# ----------------------------
# Reset helpers (safe delete)
# ----------------------------

def _delete_collection_docs(col_ref, batch_size: int = 300):
    """
    Delete all docs in a collection reference (non-recursive).
    """
    while True:
        docs = list(col_ref.limit(batch_size).stream())
        if not docs:
            break
        batch = db.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()


def reset_org_aggregates(org_id: str):
    """
    Deletes:
      - org_analytics_daily/<org_id>/days/*
      - org_analytics_daily/<org_id>/meta/all_time
      - org_terms_daily/<org_id>/days/*
    """
    # days
    _delete_collection_docs(_analytics_days_ref(org_id))
    # terms days
    _delete_collection_docs(_terms_days_ref(org_id))
    # meta doc
    _analytics_meta_ref(org_id).delete()


# ----------------------------
# Backfill core (rebuild)
# ----------------------------

def backfill_org(org_id: str, reset: bool = False, write_batch_size: int = 400):
    if reset:
        print(f"[{org_id}] reset aggregates...")
        reset_org_aggregates(org_id)
        print(f"[{org_id}] reset done ✅")

    col = db.collection(f"reports_{org_id}")
    docs = list(col.stream())
    print(f"[{org_id}] reports: {len(docs)}")

    # daily aggregates
    daily: Dict[str, Dict[str, Any]] = {}
    # terms daily
    daily_terms: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    # meta/all_time
    meta: Dict[str, Any] = {
        "total_reports": 0,
        "hate_reports": 0,
        "by_platform": defaultdict(int),
        "by_label": defaultdict(int),
        "hate_by_platform": defaultdict(int),
    }

    for d in docs:
        data = d.to_dict() or {}

        dt = _to_datetime(data.get("created_at")) or _to_datetime(data.get("post_time"))
        if not dt:
            continue

        day = _day_key(dt)
        label_id = _safe_label(data)
        platform = _safe_platform(data)
        is_hate = _is_hate(label_id)

        # init day bucket
        if day not in daily:
            daily[day] = {
                "date": day,
                "total_reports": 0,
                "hate_reports": 0,
                "by_platform": defaultdict(int),
                "by_label": defaultdict(int),
                "hate_by_platform": defaultdict(int),
            }

        # update daily
        daily[day]["total_reports"] += 1
        daily[day]["by_platform"][platform] += 1
        daily[day]["by_label"][label_id] += 1
        if is_hate:
            daily[day]["hate_reports"] += 1
            daily[day]["hate_by_platform"][platform] += 1

        # update meta
        meta["total_reports"] += 1
        meta["by_platform"][platform] += 1
        meta["by_label"][label_id] += 1
        if is_hate:
            meta["hate_reports"] += 1
            meta["hate_by_platform"][platform] += 1

        # update terms
        for t in _limited_terms(data, max_terms=20):
            daily_terms[day][t] += 1

    # ---- Write daily analytics
    day_ref = _analytics_days_ref(org_id)
    days_sorted = sorted(daily.keys())
    print(f"[{org_id}] writing days: {len(days_sorted)}")

    for i in range(0, len(days_sorted), write_batch_size):
        chunk = days_sorted[i : i + write_batch_size]
        batch = db.batch()
        for day in chunk:
            payload = daily[day]

            # convert defaultdicts -> dict
            payload_out = {
                "date": payload["date"],
                "updated_at": firestore.SERVER_TIMESTAMP,
                "total_reports": int(payload["total_reports"]),
                "hate_reports": int(payload["hate_reports"]),
                "by_platform": dict(payload["by_platform"]),
                "by_label": dict(payload["by_label"]),
                "hate_by_platform": dict(payload["hate_by_platform"]),
            }
            batch.set(day_ref.document(day), payload_out, merge=False)
        batch.commit()

    # ---- Write meta/all_time
    meta_ref = _analytics_meta_ref(org_id)
    meta_out = {
        "updated_at": firestore.SERVER_TIMESTAMP,
        "total_reports": int(meta["total_reports"]),
        "hate_reports": int(meta["hate_reports"]),
        "by_platform": dict(meta["by_platform"]),
        "by_label": dict(meta["by_label"]),
        "hate_by_platform": dict(meta["hate_by_platform"]),
    }
    meta_ref.set(meta_out, merge=False)

    # ---- Write terms daily
    t_ref = _terms_days_ref(org_id)
    term_days = sorted(daily_terms.keys())
    print(f"[{org_id}] writing term-days: {len(term_days)}")

    for i in range(0, len(term_days), write_batch_size):
        chunk = term_days[i : i + write_batch_size]
        batch = db.batch()
        for day in chunk:
            payload_out = {
                "date": day,
                "updated_at": firestore.SERVER_TIMESTAMP,
                "terms": dict(daily_terms[day]),
            }
            batch.set(t_ref.document(day), payload_out, merge=False)
        batch.commit()

    print(f"[{org_id}] backfill done ✅")


# ----------------------------
# CLI
# ----------------------------

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--orgs", type=str, default="", help="comma-separated org ids")
    p.add_argument("--reset", action="store_true", help="delete aggregates then rebuild")
    p.add_argument("--batch", type=int, default=400, help="write batch size (<= 450 recommended)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()

    raw = args.orgs.strip() or os.getenv("ORG_IDS", "").strip()
    org_ids = [x.strip() for x in raw.split(",") if x.strip()]
    if not org_ids:
        print("Provide org ids via --orgs or ORG_IDS env var, e.g.: ORG_IDS=orgA,orgB")
        raise SystemExit(1)

    for oid in org_ids:
        backfill_org(oid, reset=args.reset, write_batch_size=int(args.batch))