# firestore_utils.py (PRO - Clean)
from __future__ import annotations

from firebase_admin_setup import db
from firebase_admin import firestore

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("firestore-utils")

# =========================
# Config / Constants
# =========================
TOKEN_RE = re.compile(r"[A-Za-z\u0600-\u06FF0-9_]+")

# <= 10 items to be safe with Firestore "in" queries
HATE_LABELS = [
    "CALL_FOR_VIOLENCE",
    "SECTARIAN_RELIGIOUS_INCITEMENT",
    "HATE_SPEECH_GROUP",
    "POLITICAL_VIOLENCE_INCITEMENT",
    "WAR_CRIMES_DENIAL_JUSTIFICATION",
    "TOXIC_PERSONAL_ATTACK",
]

NEUTRAL_LABELS = ["NEUTRAL_OTHER", "PROTECTED_POLITICAL_OPINION"]
# =========================
# Aggregates (Phase C)
# =========================

def _day_key(dt: Optional[datetime] = None) -> str:
    dt = dt or _now_utc()
    return dt.date().isoformat()  # YYYY-MM-DD

def _analytics_days_ref(org_id: str):
    # org_analytics_daily/<org_id>/days/<YYYY-MM-DD>
    return db.collection("org_analytics_daily").document(org_id).collection("days")

def _analytics_meta_ref(org_id: str):
    # org_analytics_daily/<org_id>/meta/all_time
    return db.collection("org_analytics_daily").document(org_id).collection("meta").document("all_time")

def _terms_days_ref(org_id: str):
    # org_terms_daily/<org_id>/days/<YYYY-MM-DD>
    return db.collection("org_terms_daily").document(org_id).collection("days")

def _safe_platform(data: Dict[str, Any]) -> str:
    # في مشروعك platform غالبًا محفوظة في source
    return (data.get("platform") or data.get("source") or "unknown").strip() or "unknown"

def _is_hate_label(label_id: str) -> bool:
    return (label_id or "").strip() in HATE_LABELS

def _limited_terms_from_report(data: Dict[str, Any], max_terms: int = 20) -> List[str]:
    toks = data.get("searchable_tokens") or []
    if not toks:
        toks = _tokenize((data.get("text") or "") + " " + (data.get("reason_ar") or ""))

    # ✅ فلترة noise الشائع
    blacklist = {
        "json", "parse", "parser", "failed", "unterminated",
        "string", "line", "column", "char", "error", "exception"
    }

    out = []
    for t in toks:
        if not t or len(t) < 3:
            continue
        tl = str(t).lower()
        if tl in blacklist:
            continue
        # تجاهل كلمات فيها أرقام فقط
        if tl.isdigit():
            continue
        out.append(tl)
        if len(out) >= max_terms:
            break
    return out

def update_org_aggregates_from_report(org_id: str, data: Dict[str, Any]) -> bool:
    """
    Incremental aggregates update.
    Called after saving an org report.
    Updates:
      - daily counters (reports/hate/by_platform/by_label)
      - all_time meta counters
      - daily terms (for wordcloud)
    """
    try:
        label_id = (data.get("label_id") or "UNKNOWN").strip() or "UNKNOWN"
        platform = _safe_platform(data)
        is_hate = _is_hate_label(label_id)

        day = _day_key()  # نستخدم وقت الحفظ (لأنه created_at SERVER_TIMESTAMP)
        inc = firestore.Increment(1)

        # -------- daily analytics
        day_ref = _analytics_days_ref(org_id).document(day)

        updates = {
            "date": day,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "total_reports": inc,
            f"by_platform.{platform}": inc,
            f"by_label.{label_id}": inc,
        }
        if is_hate:
            updates["hate_reports"] = inc
            updates[f"hate_by_platform.{platform}"] = inc

        day_ref.set(updates, merge=True)

        # -------- all-time meta
        meta_ref = _analytics_meta_ref(org_id)
        meta_updates = {
            "updated_at": firestore.SERVER_TIMESTAMP,
            "total_reports": inc,
            f"by_platform.{platform}": inc,
            f"by_label.{label_id}": inc,
        }
        if is_hate:
            meta_updates["hate_reports"] = inc
            meta_updates[f"hate_by_platform.{platform}"] = inc

        meta_ref.set(meta_updates, merge=True)

        # -------- terms daily (wordcloud)
        terms = _limited_terms_from_report(data, max_terms=20)
        if terms:
            t_ref = _terms_days_ref(org_id).document(day)
            t_updates = {"date": day, "updated_at": firestore.SERVER_TIMESTAMP}
            for term in terms:
                # field safe because TOKEN_RE does not include dots
                t_updates[f"terms.{term}"] = inc
            t_ref.set(t_updates, merge=True)

        return True
    except Exception as e:
        logger.error(f"[AGG UPDATE ERROR] {e}", exc_info=True)
        return False

# =========================
# Helpers
# =========================
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)
ARABIC_STOPWORDS = {
    "هذا", "هذه", "ذلك", "تلك", "هناك", "هنا",
    "الذي", "التي", "الذين", "اللاتي", "اللاتي",
    "من", "إلى", "الى", "في", "على", "عن", "مع", "بين", "بعد", "قبل",
    "ثم", "كما", "لكن", "وقد", "تم", "كان", "كانت", "يكون", "تكون",
    "هو", "هي", "هم", "هن", "أنا", "نحن", "أنت", "انتم",
    "كل", "بعض", "أكثر", "اقل", "أقل", "أي", "أو", "بل", "إذا",
    "لا", "لم", "لن", "ما", "ماذا", "لماذا", "كيف", "أين", "حين",
    "ضمن", "حول", "عبر", "عند", "إذ", "اذ", "حيث", "اليوم", "أمس", "غد",
}

ENGLISH_STOPWORDS = {
    "the", "and", "for", "with", "from", "into", "onto", "that", "this",
    "these", "those", "are", "was", "were", "has", "have", "had", "not",
    "but", "you", "your", "their", "them", "they", "our", "ours", "his",
    "her", "its", "about", "after", "before", "during", "while", "over",
    "under", "than", "then", "also", "just", "very", "more", "most",
}

GENERIC_NOISE_TERMS = {
    "النص",
        "يجب",
    "ويجب",
    "يتضمن",
    "يحتوي",
    "مباشر",
    "مباشرًا",
    "مباشرة",
    "مباشرةً",
    "وصفي",
    "ووصفي",
    "تحليلي",
    "وتحليلي",
    "تحليلية",
    "ناقشنا",
    "أمر",
    "جديد",
    "عام",
    "محتوى",
    "المحتوى",
    "منشور",
    "منشورات",
    "اليوم",
    "عام",
    "بشكل",
    "بصورة",
    "شيء",
    "أشياء",
    "there",
    "here",
    "content",
    "post",
    "posts",
    "general",
    "today",
}

def _is_meaningful_token(token: str) -> bool:
    if not token:
        return False

    t = str(token).strip().lower()

    if "." in t:
        t = t.replace(".", "_")

    if len(t) < 3:
        return False

    if t.isdigit():
        return False

    if t.startswith("http") or t.startswith("www"):
        return False

    if t in ARABIC_STOPWORDS:
        return False

    if t in ENGLISH_STOPWORDS:
        return False

    if t in GENERIC_NOISE_TERMS:
        return False

    return True

def _tokenize(text: str) -> List[str]:
    """
    Tokenize عربي/إنجليزي/أرقام.
    نحذف القصير والـ stopwords والكلمات الضجيجية.
    نرجّع tokens unique مع الحفاظ على الترتيب.
    """
    if not text:
        return []

    words = [w.lower() for w in TOKEN_RE.findall(text)]

    seen = set()
    out: List[str] = []

    for w in words:
        if "." in w:
            w = w.replace(".", "_")

        if not _is_meaningful_token(w):
            continue

        if w not in seen:
            seen.add(w)
            out.append(w)

    return out

def _to_datetime(v: Any, is_end: bool = False) -> Optional[datetime]:
    """
    يقبل:
    - datetime
    - Firestore Timestamp-like (له to_datetime أو datetime)
    - ISO string (مع/بدون Z)
    - YYYY-MM-DD
    ويرجّع datetime UTC
    """
    if v is None:
        return None

    # datetime
    if isinstance(v, datetime):
        dt = v
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    # Firestore timestamp-like
    for attr in ("to_datetime", "datetime"):
        if hasattr(v, attr):
            try:
                dt = getattr(v, attr)()
                if isinstance(dt, datetime):
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return dt.astimezone(timezone.utc)
            except:
                pass

    # string
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None

        # date-only
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            hh = 23 if is_end else 0
            mm = 59 if is_end else 0
            ss = 59 if is_end else 0
            try:
                dt = datetime.fromisoformat(f"{s}T{hh:02d}:{mm:02d}:{ss:02d}+00:00")
                return dt.astimezone(timezone.utc)
            except:
                return None

        s = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except:
            return None

    return None


def _to_iso(v: Any) -> Optional[str]:
    dt = _to_datetime(v)
    return dt.isoformat() if dt else (str(v) if v is not None else None)


def _collection_for_org(org_id: str):
    return db.collection(f"reports_{org_id}")


def _attach_search_fields(data: Dict[str, Any]) -> None:
    """
    يضيف:
    - searchable_text (للـ fallback)
    - searchable_tokens (للبحث الاحترافي)
    """
    clean_text = (data.get("text") or "").strip()
    clean_reason = (data.get("reason_ar") or "").strip()

    searchable_text = f"{clean_text} {clean_reason}".lower().strip()
    data["searchable_text"] = searchable_text

    tokens = _tokenize(clean_text) + _tokenize(clean_reason)
    data["searchable_tokens"] = list(dict.fromkeys(tokens))


def _count_query(q) -> int:
    """
    يحاول يستخدم count aggregation لو متوفر، وإلا fallback stream.
    """
    started = datetime.now(timezone.utc)
    logger.info("[COUNT QUERY] start")

    try:
        logger.info("[COUNT QUERY] before q.count()")
        agg = q.count()

        logger.info("[COUNT QUERY] before agg.get()")
        res = agg.get()
        logger.info("[COUNT QUERY] agg.get() done result=%s", res)

        if res and len(res) > 0:
            first = res[0]
            if isinstance(first, (list, tuple)) and len(first) > 0 and hasattr(first[0], "value"):
                value = int(first[0].value)
                logger.info("[COUNT QUERY] success value=%s", value)
                return value
            if hasattr(first, "value"):
                value = int(first.value)
                logger.info("[COUNT QUERY] success value=%s", value)
                return value

        logger.warning("[COUNT QUERY] aggregation returned empty, falling back to stream count")
        value = sum(1 for _ in q.stream())
        logger.info("[COUNT QUERY] fallback stream count success value=%s", value)
        return value

    except Exception as e:
        logger.warning("[COUNT QUERY] aggregation failed -> fallback stream. err=%s", e, exc_info=True)
        value = sum(1 for _ in q.stream())
        logger.info("[COUNT QUERY] fallback stream count success value=%s", value)
        return value

def _apply_date_filters(ref, date_range: Optional[str], date_from: Any, date_to: Any):
    """
    date_range: "24h" | "7d" | "30d" | "all"
    date_from/date_to: ISO string أو datetime
    """
    start_dt: Optional[datetime] = None
    end_dt: Optional[datetime] = None

    if date_range and str(date_range).lower() != "all":
        dr = str(date_range).lower().strip()
        now = _now_utc()
        if dr == "24h":
            start_dt = now - timedelta(hours=24)
        elif dr == "7d":
            start_dt = now - timedelta(days=7)
        elif dr == "30d":
            start_dt = now - timedelta(days=30)

    # explicit overrides
    df = _to_datetime(date_from, is_end=False)
    dt = _to_datetime(date_to, is_end=True)

    if df:
        start_dt = df
    if dt:
        end_dt = dt

    if start_dt:
        ref = ref.where("created_at", ">=", start_dt)
    if end_dt:
        ref = ref.where("created_at", "<=", end_dt)

    return ref, start_dt, end_dt


# ================================
# Save Organization Report
# ================================
def save_org_report(org_id: str, data: dict) -> bool:
    try:
        _attach_search_fields(data)
        data["org_id"] = org_id
        data["created_at"] = firestore.SERVER_TIMESTAMP

        # snippet للـ UI
        if data.get("text") and not data.get("text_snippet"):
            data["text_snippet"] = str(data["text"])[:240]

        doc_ref = _collection_for_org(org_id).add(data)
        # ✅ Update aggregates (best-effort)
        update_org_aggregates_from_report(org_id, data)

        logger.info(f"[Firestore] Saved org report → reports_{org_id}")
        return True
    except Exception as e:
        logger.error(f"[Firestore ORG ERROR] {e}", exc_info=True)
        return False


# ================================
# Save Public Report
# ================================
def save_public_report(data: dict) -> bool:
    try:
        _attach_search_fields(data)
        data["created_at"] = firestore.SERVER_TIMESTAMP

        if data.get("text") and not data.get("text_snippet"):
            data["text_snippet"] = str(data["text"])[:240]

        db.collection("reports_public").add(data)
        logger.info("[Firestore] Saved public report → reports_public")
        return True
    except Exception as e:
        logger.error(f"[Firestore PUBLIC ERROR] {e}", exc_info=True)
        return False


# ================================
# Get Organization Stats
# (returns camelCase + snake_case)
# ================================
def get_org_stats(org_id: str, date_range: str = "7d") -> Dict[str, Any]:
    """
    Fast stats via aggregates.
    Fallback to scan logic if aggregates missing.
    """
    try:
        meta = _analytics_meta_ref(org_id).get()
        if not meta.exists:
            raise RuntimeError("missing_meta")

        meta_data = meta.to_dict() or {}
        total_reports = int(meta_data.get("total_reports") or 0)
        hate_all = int(meta_data.get("hate_reports") or 0)

        # last 7 days from daily docs
        now = _now_utc()
        start = (now - timedelta(days=7)).date().isoformat()
        end = now.date().isoformat()

        days_ref = _analytics_days_ref(org_id)
        q = (
            days_ref
            .order_by("__name__")
            .start_at([start])
            .end_at([end])
        )

        last7d_reports = 0
        hate_7d = 0
        platform_counts: Dict[str, int] = {}

        for d in q.stream():
            dd = d.to_dict() or {}
            last7d_reports += int(dd.get("total_reports") or 0)
            hate_7d += int(dd.get("hate_reports") or 0)

            # ✅ use hate_by_platform for most toxic
            byp = dd.get("hate_by_platform") or {}
            for k, v in (byp or {}).items():
                try:
                    platform_counts[k] = platform_counts.get(k, 0) + int(v)
                except:
                    pass

        hate_ratio = (hate_all / total_reports) if total_reports > 0 else 0.0

        most_toxic_platform = None
        if platform_counts:
            most_toxic_platform = max(platform_counts.items(), key=lambda x: x[1])[0]

        active_users = None
        time_to_first_review_hours = None

        return {
            # snake_case
            "org_id": org_id,
            "total_reports": int(total_reports),
            "last7d_reports": int(last7d_reports),
            "hate_speech_ratio": float(hate_ratio),
            "most_toxic_platform": most_toxic_platform,
            "active_users": active_users,
            "time_to_first_review_hours": time_to_first_review_hours,
            "hate_reports_total": int(hate_all),
            "hate_reports_last7d": int(hate_7d),

            # camelCase
            "totalReports": int(total_reports),
            "last7dReports": int(last7d_reports),
            "hateSpeechRatio": float(hate_ratio),
            "mostToxicPlatform": most_toxic_platform,
            "activeUsers": active_users,
            "timeToFirstReviewHours": time_to_first_review_hours,
        }

    except Exception as e:
        # ✅ fallback to old scan logic (your current version)
        logger.warning(f"[get_org_stats] aggregates missing or failed -> fallback scan. err={e}")
        ref = _collection_for_org(org_id)

        total_reports = _count_query(ref)

        ref_7d, _, _ = _apply_date_filters(ref, "7d", None, None)
        last7d_reports = _count_query(ref_7d)

        hate_all = _count_query(ref.where("label_id", "in", HATE_LABELS)) if total_reports else 0
        hate_7d = _count_query(ref_7d.where("label_id", "in", HATE_LABELS)) if last7d_reports else 0

        hate_ratio = (hate_all / total_reports) if total_reports > 0 else 0.0

        platform_counts: Dict[str, int] = {}
        hate_ref_30d, _, _ = _apply_date_filters(ref, "30d", None, None)

        try:
            for d in hate_ref_30d.where("label_id", "in", HATE_LABELS).stream():
                data = d.to_dict()
                platform = data.get("source") or data.get("platform") or "unknown"
                platform_counts[platform] = platform_counts.get(platform, 0) + 1
        except Exception:
            platform_counts = {}

        most_toxic_platform = None
        if platform_counts:
            most_toxic_platform = max(platform_counts.items(), key=lambda x: x[1])[0]

        active_users = None
        time_to_first_review_hours = None

        return {
            "org_id": org_id,
            "total_reports": int(total_reports),
            "last7d_reports": int(last7d_reports),
            "hate_speech_ratio": float(hate_ratio),
            "most_toxic_platform": most_toxic_platform,
            "active_users": active_users,
            "time_to_first_review_hours": time_to_first_review_hours,
            "hate_reports_total": int(hate_all),
            "hate_reports_last7d": int(hate_7d),

            "totalReports": int(total_reports),
            "last7dReports": int(last7d_reports),
            "hateSpeechRatio": float(hate_ratio),
            "mostToxicPlatform": most_toxic_platform,
            "activeUsers": active_users,
            "timeToFirstReviewHours": time_to_first_review_hours,
        }
# ================================
# Get Organization Trends
# returns: timeseries + byPlatform (frontend)
# ================================
def get_org_trends(org_id: str, date_range: str = "30d") -> Dict[str, Any]:
    """
    Fast trends via daily aggregates.
    Robust byPlatform extraction (supports map + flattened keys).
    """
    def _extract_hate_by_platform(doc: Dict[str, Any]) -> Dict[str, int]:
        out: Dict[str, int] = {}

        # 1) normal map: {"hate_by_platform": {"X": 1}}
        m = doc.get("hate_by_platform")
        if isinstance(m, dict):
            for p, c in m.items():
                try:
                    out[str(p)] = out.get(str(p), 0) + int(c)
                except Exception:
                    pass

        # 2) flattened keys: {"hate_by_platform.X": 1}
        for k, v in (doc or {}).items():
            if isinstance(k, str) and k.startswith("hate_by_platform."):
                p = k.split(".", 1)[1]
                try:
                    out[p] = out.get(p, 0) + int(v)
                except Exception:
                    pass

        return out

    try:
        dr = (date_range or "30d").lower().strip()
        now = _now_utc()

        if dr == "24h":
            start = (now - timedelta(days=1)).date().isoformat()
        elif dr == "7d":
            start = (now - timedelta(days=7)).date().isoformat()
        elif dr == "30d":
            start = (now - timedelta(days=30)).date().isoformat()
        else:
            start = (now - timedelta(days=90)).date().isoformat()

        end = now.date().isoformat()

        days_ref = _analytics_days_ref(org_id)
        q = (
            days_ref
            .where("date", ">=", start)
            .where("date", "<=", end)
            .order_by("date")
        )

        timeseries: List[Dict[str, Any]] = []
        platform_hate: Dict[str, int] = {}

        for d in q.stream():
            dd = d.to_dict() or {}
            day = dd.get("date") or d.id
            total = int(dd.get("total_reports") or 0)
            hate = int(dd.get("hate_reports") or 0)

            timeseries.append({"date": day, "totalReports": total, "hateReports": hate})

            # ✅ robust extraction
            byp = _extract_hate_by_platform(dd)
            for p, c in byp.items():
                platform_hate[p] = platform_hate.get(p, 0) + int(c)

        # ✅ fallback from meta/all_time (supports both shapes too)
        if not platform_hate:
            try:
                meta = _analytics_meta_ref(org_id).get()
                if meta.exists:
                    meta_data = meta.to_dict() or {}
                    meta_byp = _extract_hate_by_platform(meta_data)
                    for p, c in meta_byp.items():
                        platform_hate[p] = platform_hate.get(p, 0) + int(c)
            except Exception:
                pass

        by_platform = [
            {"platform": p, "hateReports": c}
            for p, c in sorted(platform_hate.items(), key=lambda x: x[1], reverse=True)
        ]

        legacy_trends = {
            t["date"]: {"total": t["totalReports"], "hate": t["hateReports"]}
            for t in timeseries
        }

        return {
            "org_id": org_id,
            "trends": legacy_trends,
            "timeseries": timeseries,
            "byPlatform": by_platform,
        }

    except Exception as e:
        logger.warning(f"[get_org_trends] aggregates missing or failed -> fallback scan. err={e}")

        ref = _collection_for_org(org_id)
        ref, _, _ = _apply_date_filters(ref, date_range, None, None)
        ref = ref.order_by("created_at")

        timeseries_map: Dict[str, Dict[str, int]] = {}
        platform_hate: Dict[str, int] = {}

        for d in ref.stream():
            data = d.to_dict()
            dt = _to_datetime(data.get("created_at")) or _to_datetime(data.get("post_time"))
            if not dt:
                continue

            day = dt.date().isoformat()
            label = data.get("label_id") or "UNKNOWN"
            is_hate = label in HATE_LABELS

            if day not in timeseries_map:
                timeseries_map[day] = {"totalReports": 0, "hateReports": 0}

            timeseries_map[day]["totalReports"] += 1
            if is_hate:
                timeseries_map[day]["hateReports"] += 1
                platform = data.get("source") or data.get("platform") or "unknown"
                platform_hate[platform] = platform_hate.get(platform, 0) + 1

        timeseries = [
            {"date": day, "totalReports": v["totalReports"], "hateReports": v["hateReports"]}
            for day, v in sorted(timeseries_map.items(), key=lambda x: x[0])
        ]

        by_platform = [
            {"platform": p, "hateReports": c}
            for p, c in sorted(platform_hate.items(), key=lambda x: x[1], reverse=True)
        ]

        legacy_trends = {
            day: {"total": v["totalReports"], "hate": v["hateReports"]}
            for day, v in sorted(timeseries_map.items(), key=lambda x: x[0])
        }

        return {
            "org_id": org_id,
            "trends": legacy_trends,
            "timeseries": timeseries,
            "byPlatform": by_platform,
        }
# ================================
# Get Public Trends
# returns: timeseries + byPlatform (admin/public)
# ================================
def get_public_trends(date_range: str = "30d") -> Dict[str, Any]:
    """
    Public/admin trends over reports_public.
    Scans filtered public reports and aggregates by day and harmful platform.
    """
    try:
        ref = db.collection("reports_public")
        ref, _, _ = _apply_date_filters(ref, date_range, None, None)
        ref = ref.order_by("created_at")

        timeseries_map: Dict[str, Dict[str, int]] = {}
        platform_hate: Dict[str, int] = {}

        for d in ref.stream():
            data = d.to_dict() or {}
            dt = _to_datetime(data.get("created_at")) or _to_datetime(data.get("post_time"))
            if not dt:
                continue

            day = dt.date().isoformat()
            label = data.get("label_id") or "UNKNOWN"
            is_hate = label in HATE_LABELS

            if day not in timeseries_map:
                timeseries_map[day] = {"totalReports": 0, "hateReports": 0}

            timeseries_map[day]["totalReports"] += 1

            if is_hate:
                timeseries_map[day]["hateReports"] += 1
                platform = data.get("source") or data.get("platform") or "unknown"
                platform_hate[platform] = platform_hate.get(platform, 0) + 1

        timeseries = [
            {"date": day, "totalReports": v["totalReports"], "hateReports": v["hateReports"]}
            for day, v in sorted(timeseries_map.items(), key=lambda x: x[0])
        ]

        by_platform = [
            {"platform": p, "hateReports": c}
            for p, c in sorted(platform_hate.items(), key=lambda x: x[1], reverse=True)
        ]

        legacy_trends = {
            day: {"total": v["totalReports"], "hate": v["hateReports"]}
            for day, v in sorted(timeseries_map.items(), key=lambda x: x[0])
        }

        return {
            "scope": "public",
            "trends": legacy_trends,
            "timeseries": timeseries,
            "byPlatform": by_platform,
        }

    except Exception as e:
        logger.error("[get_public_trends] failed: %s", e, exc_info=True)
        return {
            "scope": "public",
            "trends": {},
            "timeseries": [],
            "byPlatform": [],
            "error": "Failed to load public trends",
        }

# ================================
# Get Public Wordcloud
# returns: terms (admin/public)
# ================================
def get_public_wordcloud(date_range: str = "30d", top_k: int = 80) -> Dict[str, Any]:
    """
    Public/admin wordcloud over reports_public.
    Scan-based MVP using searchable_tokens, with text/reason fallback.
    """
    try:
        ref = db.collection("reports_public")

        if date_range not in {"all", "all_time"}:
            ref, _, _ = _apply_date_filters(ref, date_range, None, None)

        freq: Dict[str, int] = {}

        for d in ref.stream():
            data = d.to_dict() or {}
            tokens = data.get("searchable_tokens") or []

            if not tokens:
                text = str(data.get("text") or "").strip()
                reason = str(data.get("reason_ar") or "").strip()

                tokens = _tokenize(text)
                if len(tokens) < 8 and reason:
                    tokens += _tokenize(reason)

            for t in tokens:
                token = str(t).lower().strip()
                if not _is_meaningful_token(token):
                    continue
                freq[token] = freq.get(token, 0) + 1

        sorted_terms = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:top_k]
        terms = [{"term": w, "count": c, "category": None} for w, c in sorted_terms]
        legacy_global = [{"word": w, "count": c} for w, c in sorted_terms]

        return {
            "scope": "public",
            "global_wordcloud": legacy_global,
            "terms": terms,
        }

    except Exception as e:
        logger.error("[get_public_wordcloud] failed: %s", e, exc_info=True)
        return {
            "scope": "public",
            "global_wordcloud": [],
            "terms": [],
            "error": "Failed to load public wordcloud",
        }

# ================================
# Get Wordcloud
# returns: terms (frontend)
# ================================
def get_org_wordcloud(org_id: str, date_range: str = "30d", top_k: int = 80) -> Dict[str, Any]:
    """
    Fast wordcloud from daily term aggregates.
    Fallback to scan if missing.
    Supports true all-time mode.
    """
    try:
        dr = (date_range or "30d").lower().strip()
        now = _now_utc()
        end = now.date().isoformat()

        days_ref = _terms_days_ref(org_id)
        q = days_ref.order_by("__name__")

        if dr == "24h":
            start = (now - timedelta(days=1)).date().isoformat()
            q = q.start_at([start]).end_at([end])
        elif dr == "7d":
            start = (now - timedelta(days=7)).date().isoformat()
            q = q.start_at([start]).end_at([end])
        elif dr == "30d":
            start = (now - timedelta(days=30)).date().isoformat()
            q = q.start_at([start]).end_at([end])
        elif dr in {"all", "all_time"}:
            start = None
        else:
            start = (now - timedelta(days=90)).date().isoformat()
            q = q.start_at([start]).end_at([end])

        freq: Dict[str, int] = {}
        for d in q.stream():
            dd = d.to_dict() or {}
            terms_map = dd.get("terms") or {}
            for t, c in (terms_map or {}).items():
                try:
                    token = str(t).lower().strip()
                    if not _is_meaningful_token(token):
                        continue
                    freq[token] = freq.get(token, 0) + int(c)
                except Exception:
                    pass

        sorted_terms = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:top_k]
        terms = [{"term": w, "count": c, "category": None} for w, c in sorted_terms]
        legacy_global = [{"word": w, "count": c} for w, c in sorted_terms]

        return {"org_id": org_id, "global_wordcloud": legacy_global, "terms": terms}

    except Exception as e:
        logger.warning(f"[get_org_wordcloud] aggregates missing or failed -> fallback scan. err={e}")

        ref = _collection_for_org(org_id)

        if date_range not in {"all", "all_time"}:
            ref, _, _ = _apply_date_filters(ref, date_range, None, None)

        freq: Dict[str, int] = {}
        for d in ref.stream():
            data = d.to_dict()
            tokens = data.get("searchable_tokens") or []

            if not tokens:
                text = str(data.get("text") or "").strip()
                reason = str(data.get("reason_ar") or "").strip()

                tokens = _tokenize(text)
                if len(tokens) < 8 and reason:
                    tokens += _tokenize(reason)

            for t in tokens:
                token = str(t).lower().strip()
                if not _is_meaningful_token(token):
                    continue
                freq[token] = freq.get(token, 0) + 1

        sorted_terms = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:top_k]
        terms = [{"term": w, "count": c, "category": None} for w, c in sorted_terms]
        legacy_global = [{"word": w, "count": c} for w, c in sorted_terms]

        return {"org_id": org_id, "global_wordcloud": legacy_global, "terms": terms}
# ================================
# Get Reports (Pagination + Filters)
# supports date_range
# ================================
def get_org_reports(
    org_id: str,
    limit: int = 20,
    page: int = 1,
    category: Optional[str] = None,
    platform: Optional[str] = None,
    date_from: Any = None,
    date_to: Any = None,
    date_range: Optional[str] = None,
    sort: str = "desc",
) -> Dict[str, Any]:
    ref = _collection_for_org(org_id)

    if category:
        ref = ref.where("label_id", "==", category)
    if platform:
        ref = ref.where("source", "==", platform)

    ref, _, _ = _apply_date_filters(ref, date_range, date_from, date_to)

    direction = firestore.Query.DESCENDING if sort == "desc" else firestore.Query.ASCENDING
    ref = ref.order_by("created_at", direction=direction)

    offset = max(0, (int(page) - 1) * int(limit))
    docs = list(ref.limit(int(limit)).offset(offset).stream())

    # total count
    ref_total = _collection_for_org(org_id)
    if category:
        ref_total = ref_total.where("label_id", "==", category)
    if platform:
        ref_total = ref_total.where("source", "==", platform)
    ref_total, _, _ = _apply_date_filters(ref_total, date_range, date_from, date_to)
    total = _count_query(ref_total)

    results: List[Dict[str, Any]] = []
    for d in docs:
        data = d.to_dict()
        data["id"] = d.id
        data["created_at"] = _to_iso(data.get("created_at"))
        if not data.get("post_time"):
            data["post_time"] = data.get("created_at")
        if data.get("text") and not data.get("text_snippet"):
            data["text_snippet"] = str(data["text"])[:240]
        results.append(data)

    return {
        "org_id": org_id,
        "total": int(total),
        "page": int(page),
        "limit": int(limit),
        "results": results,
        "sort": sort,
    }

def _is_index_error(e: Exception) -> bool:
    s = str(e).lower()
    return ("requires an index" in s) or ("failed_precondition" in s) or ("failed precondition" in s)

def _stream_with_fallback_sort(ref, limit: int, offset: int, sort: str):
    reverse = (sort == "desc")
    direction = firestore.Query.DESCENDING if reverse else firestore.Query.ASCENDING

    logger.info(
        "[STREAM SORT] start limit=%s offset=%s sort=%s reverse=%s",
        limit, offset, sort, reverse
    )

    try:
        logger.info("[STREAM SORT] before order_by(created_at)")
        ordered = ref.order_by("created_at", direction=direction)

        logger.info("[STREAM SORT] before ordered.limit().offset().stream()")
        docs = list(ordered.limit(limit).offset(offset).stream())
        logger.info("[STREAM SORT] ordered stream done docs=%s", len(docs))
        return docs

    except Exception as e:
        if not _is_index_error(e):
            logger.error("[STREAM SORT] non-index error: %s", e, exc_info=True)
            raise

        logger.warning("[STREAM SORT] index error -> fallback without order_by. err=%s", e)
        take = max(0, offset) + max(1, limit)

        logger.info("[STREAM SORT] fallback before ref.limit(%s).stream()", take)
        docs = list(ref.limit(take).stream())
        logger.info("[STREAM SORT] fallback raw stream done docs=%s", len(docs))

        def key_fn(doc):
            data = doc.to_dict() or {}
            dt = _to_datetime(data.get("created_at")) or _to_datetime(data.get("post_time"))
            return dt or datetime(1970, 1, 1, tzinfo=timezone.utc)

        docs_sorted = sorted(docs, key=key_fn, reverse=reverse)
        sliced = docs_sorted[offset: offset + limit]
        logger.info("[STREAM SORT] fallback sorted/sliced docs=%s", len(sliced))
        return sliced
# ================================
# Search Reports (tokens-based)
# supports date_range
# ================================
def search_org_reports(
    org_id: str,
    query: str = "",
    limit: int = 20,
    page: int = 1,
    category: Optional[str] = None,
    platform: Optional[str] = None,
    date_from: Any = None,
    date_to: Any = None,
    date_range: Optional[str] = None,
    sort: str = "desc",
) -> Dict[str, Any]:
    q = (query or "").strip().lower()
    tokens = _tokenize(q)

    ref = _collection_for_org(org_id)

    if category:
        ref = ref.where("label_id", "==", category)
    if platform:
        ref = ref.where("source", "==", platform)

    ref, _, _ = _apply_date_filters(ref, date_range, date_from, date_to)

    # ✅ Token search
    if tokens:
        ref = ref.where("searchable_tokens", "array_contains_any", tokens[:10])

    offset = max(0, (int(page) - 1) * int(limit))

    # ✅ هنا الإصلاح الأساسي: order_by مع fallback
    try:
        docs = _stream_with_fallback_sort(ref, int(limit), offset, sort)
    except Exception as e:
        logger.error(f"[search_org_reports] Firestore query failed: {e}", exc_info=True)
        raise

    # total count
    ref_total = _collection_for_org(org_id)
    if category:
        ref_total = ref_total.where("label_id", "==", category)
    if platform:
        ref_total = ref_total.where("source", "==", platform)
    ref_total, _, _ = _apply_date_filters(ref_total, date_range, date_from, date_to)
    if tokens:
        ref_total = ref_total.where("searchable_tokens", "array_contains_any", tokens[:10])

    total = _count_query(ref_total)

    results: List[Dict[str, Any]] = []
    for d in docs:
        data = d.to_dict() or {}
        data["id"] = d.id
        data["created_at"] = _to_iso(data.get("created_at"))
        if not data.get("post_time"):
            data["post_time"] = data.get("created_at")
        if data.get("text") and not data.get("text_snippet"):
            data["text_snippet"] = str(data["text"])[:240]
        results.append(data)

    return {
        "org_id": org_id,
        "query": q,
        "total": int(total),
        "page": int(page),
        "limit": int(limit),
        "results": results,
        "sort": sort,
    }


def get_public_reports(
    limit: int = 50,
    offset: int = 0,
    platform: Optional[str] = None,
    category: Optional[str] = None,
    date_range: str = "7d",
    date_from: Any = None,
    date_to: Any = None,
    sort: str = "desc",
):
    logger.info(
        "[GET PUBLIC REPORTS] start limit=%s offset=%s platform=%s category=%s date_range=%s sort=%s",
        limit, offset, platform, category, date_range, sort
    )

    ref = db.collection("reports_public")

    if platform:
        logger.info("[GET PUBLIC REPORTS] applying platform filter source == %s", platform)
        ref = ref.where("source", "==", platform)

    if category:
        logger.info("[GET PUBLIC REPORTS] applying category filter label_id == %s", category)
        ref = ref.where("label_id", "==", category)

    ref, start_dt, end_dt = _apply_date_filters(ref, date_range, date_from, date_to)
    logger.info("[GET PUBLIC REPORTS] date filters applied start=%s end=%s", start_dt, end_dt)

    direction = firestore.Query.DESCENDING if sort == "desc" else firestore.Query.ASCENDING
    try:
        logger.info("[GET PUBLIC REPORTS] before order_by(created_at)")
        ref = ref.order_by("created_at", direction=direction)

        logger.info("[GET PUBLIC REPORTS] before ordered stream")
        docs = list(ref.limit(limit).offset(offset).stream())
        logger.info("[GET PUBLIC REPORTS] ordered stream done docs=%s", len(docs))
    except Exception as e:
        logger.warning("[GET PUBLIC REPORTS] ordered stream failed -> fallback. err=%s", e, exc_info=True)
        docs = list(ref.limit(offset + limit).stream())[offset:offset + limit]
        logger.info("[GET PUBLIC REPORTS] fallback stream done docs=%s", len(docs))

    logger.info("[GET PUBLIC REPORTS] before total count")
    total = _count_query(ref)
    logger.info("[GET PUBLIC REPORTS] total count done total=%s", total)

    results = []
    for i, d in enumerate(docs, start=1):
        if i == 1:
            logger.info("[GET PUBLIC REPORTS] first result doc_id=%s", d.id)

        data = d.to_dict() or {}
        data["id"] = d.id
        data["created_at"] = _to_iso(data.get("created_at"))
        if not data.get("post_time"):
            data["post_time"] = data.get("created_at")
        if data.get("text") and not data.get("text_snippet"):
            data["text_snippet"] = str(data["text"])[:240]
        results.append(data)

    logger.info("[GET PUBLIC REPORTS] done results=%s total=%s", len(results), total)
    return {"results": results, "total": int(total)}

def search_public_reports(
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    platform: Optional[str] = None,
    category: Optional[str] = None,
    date_range: str = "7d",
    date_from: Any = None,
    date_to: Any = None,
    sort: str = "desc",
):
    logger.info(
        "[SEARCH PUBLIC] start q=%s limit=%s offset=%s platform=%s category=%s date_range=%s sort=%s",
        q, limit, offset, platform, category, date_range, sort
    )

    q = (q or "").strip().lower()
    tokens = _tokenize(q)
    logger.info("[SEARCH PUBLIC] tokens=%s", tokens[:10])

    ref = db.collection("reports_public")
    logger.info("[SEARCH PUBLIC] base collection=reports_public")

    if platform:
        logger.info("[SEARCH PUBLIC] applying platform filter source == %s", platform)
        ref = ref.where("source", "==", platform)

    if category:
        logger.info("[SEARCH PUBLIC] applying category filter label_id == %s", category)
        ref = ref.where("label_id", "==", category)

    ref, start_dt, end_dt = _apply_date_filters(ref, date_range, date_from, date_to)
    logger.info("[SEARCH PUBLIC] date filters applied start=%s end=%s", start_dt, end_dt)

    if tokens:
        logger.info("[SEARCH PUBLIC] applying array_contains_any searchable_tokens")
        ref = ref.where("searchable_tokens", "array_contains_any", tokens[:10])

    logger.info("[SEARCH PUBLIC] before docs fetch")
    docs = _stream_with_fallback_sort(ref, int(limit), int(offset), sort)
    logger.info("[SEARCH PUBLIC] docs fetch done count=%s", len(docs))

    logger.info("[SEARCH PUBLIC] before total count")
    total = _count_query(ref)
    logger.info("[SEARCH PUBLIC] total count done total=%s", total)

    results = []
    for i, d in enumerate(docs, start=1):
        if i == 1:
            logger.info("[SEARCH PUBLIC] first result doc_id=%s", d.id)

        data = d.to_dict() or {}
        data["id"] = d.id
        data["created_at"] = _to_iso(data.get("created_at"))
        if not data.get("post_time"):
            data["post_time"] = data.get("created_at")
        if data.get("text") and not data.get("text_snippet"):
            data["text_snippet"] = str(data["text"])[:240]
        results.append(data)

    logger.info("[SEARCH PUBLIC] done results=%s total=%s", len(results), total)
    return {"results": results, "total": int(total)}
# =========================
# Org Requests / Onboarding (Patch 6)
# =========================
def _org_requests_collection():
    return db.collection("org_requests")


def _users_collection():
    return db.collection("users")


def _safe_text(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def create_org_request(
    requester_email: str,
    organization_name: str,
    organization_slug: str,
    org_id_preview: Optional[str] = None,
    country: Optional[str] = None,
    message: Optional[str] = None,
    requested_plan: str = "Free",
) -> Dict[str, Any]:
    requester_email = (requester_email or "").strip().lower()
    organization_name = (organization_name or "").strip()
    organization_slug = (organization_slug or "").strip()
    requested_plan = (requested_plan or "Free").strip()

    if requested_plan not in {"Free", "Pro", "Enterprise"}:
        requested_plan = "Free"

    ref = _org_requests_collection().document()

    payload = {
        "request_id": ref.id,
        "requester_email": requester_email,
        "organization_name": organization_name,
        "organization_slug": organization_slug,
        "org_id_preview": _safe_text(org_id_preview),
        "country": _safe_text(country),
        "message": _safe_text(message),
        "requested_plan": requested_plan,
        "status": "pending",
        "created_at": firestore.SERVER_TIMESTAMP,
        "reviewed_at": None,
        "reviewed_by_uid": None,
        "reviewed_by_email": None,
        "review_note": None,
        "org_id": None,
        "linked_user_uid": None,
        "user_profile_created": False,
    }

    ref.set(payload)

    return {
        "id": ref.id,
        "request_id": ref.id,
        "requester_email": requester_email,
        "organization_name": organization_name,
        "organization_slug": organization_slug,
        "org_id_preview": _safe_text(org_id_preview),
        "country": _safe_text(country),
        "message": _safe_text(message),
        "requested_plan": requested_plan,
        "status": "pending",
    }


def get_org_request(request_id: str) -> Optional[Dict[str, Any]]:
    snap = _org_requests_collection().document(request_id).get()
    if not snap.exists:
        return None

    data = snap.to_dict() or {}
    data["id"] = snap.id
    data["request_id"] = data.get("request_id") or snap.id
    data["created_at"] = _to_iso(data.get("created_at"))
    data["reviewed_at"] = _to_iso(data.get("reviewed_at"))
    return data


def list_org_requests(status: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    ref = _org_requests_collection()

    if status:
        ref = ref.where("status", "==", status)

    try:
        docs = list(
            ref.order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(int(limit))
            .stream()
        )
    except Exception:
        docs = list(ref.limit(int(limit)).stream())

    out: List[Dict[str, Any]] = []
    for d in docs:
        data = d.to_dict() or {}
        data["id"] = d.id
        data["request_id"] = data.get("request_id") or d.id
        data["created_at"] = _to_iso(data.get("created_at"))
        data["reviewed_at"] = _to_iso(data.get("reviewed_at"))
        out.append(data)

    out.sort(
        key=lambda x: _to_datetime(x.get("created_at")) or datetime(1970, 1, 1, tzinfo=timezone.utc),
        reverse=True,
    )
    return out[: int(limit)]


def update_org_request_status(
    request_id: str,
    *,
    status: str,
    reviewed_by_uid: Optional[str],
    reviewed_by_email: Optional[str],
    org_id: Optional[str] = None,
    review_note: Optional[str] = None,
    linked_user_uid: Optional[str] = None,
    user_profile_created: Optional[bool] = None,
) -> Dict[str, Any]:
    if status not in {"approved", "rejected"}:
        raise ValueError("status must be approved or rejected")

    updates: Dict[str, Any] = {
        "status": status,
        "reviewed_at": firestore.SERVER_TIMESTAMP,
        "reviewed_by_uid": _safe_text(reviewed_by_uid),
        "reviewed_by_email": _safe_text(reviewed_by_email.lower() if reviewed_by_email else None),
    }

    if org_id is not None:
        updates["org_id"] = _safe_text(org_id)

    if review_note is not None:
        updates["review_note"] = _safe_text(review_note)

    if linked_user_uid is not None:
        updates["linked_user_uid"] = _safe_text(linked_user_uid)

    if user_profile_created is not None:
        updates["user_profile_created"] = bool(user_profile_created)

    _org_requests_collection().document(request_id).set(updates, merge=True)

    result = get_org_request(request_id)
    return result or {"id": request_id, "status": status}


def upsert_user_profile(
    uid: str,
    email: str,
    role: str,
    org_id: Optional[str],
    status: str = "active",
) -> Dict[str, Any]:
    uid = str(uid).strip()
    email = (email or "").strip().lower()
    role = (role or "").strip()
    status = (status or "active").strip()

    ref = _users_collection().document(uid)
    snap = ref.get()

    existing = snap.to_dict() or {}
    existing_role = (existing.get("role") or "").strip()

    # لا ننزّل admin إلى org_user بالخطأ
    effective_role = existing_role if existing_role == "admin" and role != "admin" else role
    effective_org_id = existing.get("org_id") if existing_role == "admin" and role != "admin" else org_id

    payload: Dict[str, Any] = {
        "email": email,
        "role": effective_role,
        "org_id": effective_org_id,
        "status": status,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    if not snap.exists:
        payload["created_at"] = firestore.SERVER_TIMESTAMP

    ref.set(payload, merge=True)

    return {
        "uid": uid,
        "email": email,
        "role": effective_role,
        "org_id": effective_org_id,
        "status": status,
    }

# ================================
# User Profiles (Patch 6)
# ================================
def upsert_user_profile(
    uid: str,
    email: str,
    role: str,
    org_id: Optional[str] = None,
    status: str = "active",
) -> Dict[str, Any]:
    """
    Creates or updates a Firestore user profile at users/{uid}.
    """
    uid = str(uid or "").strip()
    email = str(email or "").strip().lower()
    role = str(role or "").strip()
    org_id = (str(org_id).strip() if org_id is not None else None)
    status = str(status or "active").strip()

    if not uid:
        raise ValueError("uid is required")

    if not email:
        raise ValueError("email is required")

    if role not in {"admin", "org_user"}:
        raise ValueError("role must be 'admin' or 'org_user'")

    doc_ref = db.collection("users").document(uid)
    snap = doc_ref.get()

    payload: Dict[str, Any] = {
        "email": email,
        "role": role,
        "status": status,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    if org_id is not None:
        payload["org_id"] = org_id

    if not snap.exists:
        payload["created_at"] = firestore.SERVER_TIMESTAMP

    doc_ref.set(payload, merge=True)

    saved = doc_ref.get()
    data = saved.to_dict() or {}
    data["uid"] = saved.id
    data["created_at"] = _to_iso(data.get("created_at"))
    data["updated_at"] = _to_iso(data.get("updated_at"))
    return data


# ================================
# Organization Requests (Patch 6)
# ================================
def _normalize_org_request_doc(doc) -> Optional[Dict[str, Any]]:
    if not doc or not doc.exists:
        return None

    data = doc.to_dict() or {}
    data["id"] = doc.id
    data["request_id"] = data.get("request_id") or doc.id
    data["created_at"] = _to_iso(data.get("created_at"))
    data["updated_at"] = _to_iso(data.get("updated_at"))
    data["reviewed_at"] = _to_iso(data.get("reviewed_at"))
    return data


def create_org_request(
    requester_email: str,
    organization_name: str,
    organization_slug: str,
    org_id_preview: str,
    country: Optional[str] = None,
    message: Optional[str] = None,
    requested_plan: str = "Free",
) -> Dict[str, Any]:
    """
    Creates a pending organization request in Firestore.
    Collection: org_requests
    """
    requester_email = str(requester_email or "").strip().lower()
    organization_name = str(organization_name or "").strip()
    organization_slug = str(organization_slug or "").strip()
    org_id_preview = str(org_id_preview or "").strip()
    requested_plan = str(requested_plan or "Free").strip()

    if not requester_email:
        raise ValueError("requester_email is required")
    if not organization_name:
        raise ValueError("organization_name is required")
    if not organization_slug:
        raise ValueError("organization_slug is required")
    if not org_id_preview:
        raise ValueError("org_id_preview is required")

    if requested_plan not in {"Free", "Pro", "Enterprise"}:
        requested_plan = "Free"

    doc_ref = db.collection("org_requests").document()

    payload: Dict[str, Any] = {
        "request_id": doc_ref.id,
        "requester_email": requester_email,
        "organization_name": organization_name,
        "organization_slug": organization_slug,
        "org_id_preview": org_id_preview,
        "country": country,
        "message": message,
        "requested_plan": requested_plan,
        "status": "pending",
        "review_note": None,
        "reviewed_by_uid": None,
        "reviewed_by_email": None,
        "reviewed_at": None,
        "org_id": None,
        "linked_user_uid": None,
        "user_profile_created": False,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    doc_ref.set(payload)
    return _normalize_org_request_doc(doc_ref.get()) or {
        "request_id": doc_ref.id,
        "status": "pending",
    }


def get_org_request(request_id: str) -> Optional[Dict[str, Any]]:
    request_id = str(request_id or "").strip()
    if not request_id:
        return None

    doc = db.collection("org_requests").document(request_id).get()
    return _normalize_org_request_doc(doc)


def list_org_requests(
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Lists org requests. We avoid strict Firestore order_by requirements
    and sort in Python to reduce index friction for now.
    """
    limit = max(1, min(int(limit), 200))

    ref = db.collection("org_requests")
    if status:
        ref = ref.where("status", "==", str(status).strip())

    docs = list(ref.stream())

    items: List[Dict[str, Any]] = []
    for doc in docs:
        normalized = _normalize_org_request_doc(doc)
        if normalized:
            items.append(normalized)

    def sort_key(item: Dict[str, Any]):
        dt = _to_datetime(item.get("created_at"))
        return dt or datetime(1970, 1, 1, tzinfo=timezone.utc)

    items.sort(key=sort_key, reverse=True)
    return items[:limit]


def update_org_request_status(
    request_id: str,
    status: str,
    reviewed_by_uid: Optional[str] = None,
    reviewed_by_email: Optional[str] = None,
    org_id: Optional[str] = None,
    review_note: Optional[str] = None,
    linked_user_uid: Optional[str] = None,
    user_profile_created: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    """
    Updates an existing org request status.
    Allowed status values: pending, approved, rejected
    """
    request_id = str(request_id or "").strip()
    status = str(status or "").strip()

    if not request_id:
        raise ValueError("request_id is required")

    if status not in {"pending", "approved", "rejected"}:
        raise ValueError("status must be pending, approved, or rejected")

    doc_ref = db.collection("org_requests").document(request_id)
    snap = doc_ref.get()

    if not snap.exists:
        return None

    payload: Dict[str, Any] = {
        "status": status,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    if reviewed_by_uid is not None:
        payload["reviewed_by_uid"] = str(reviewed_by_uid).strip() or None

    if reviewed_by_email is not None:
        payload["reviewed_by_email"] = str(reviewed_by_email).strip().lower() or None

    if review_note is not None:
        payload["review_note"] = str(review_note).strip() or None

    if org_id is not None:
        payload["org_id"] = str(org_id).strip() or None

    if linked_user_uid is not None:
        payload["linked_user_uid"] = str(linked_user_uid).strip() or None

    if user_profile_created is not None:
        payload["user_profile_created"] = bool(user_profile_created)

    if status in {"approved", "rejected"}:
        payload["reviewed_at"] = firestore.SERVER_TIMESTAMP

    doc_ref.set(payload, merge=True)
    return _normalize_org_request_doc(doc_ref.get())

# ================================
# Update Public Report Review
# ================================
def update_public_report_review(
    doc_id: str,
    review_status: str,
    corrected_label: Optional[str] = None,
    reviewer_note: Optional[str] = None,
    reviewed_by: Optional[str] = None,
) -> bool:
    allowed = {"correct", "incorrect", "needs_review", "unreviewed"}

    doc_id = str(doc_id or "").strip()
    review_status = str(review_status or "").strip()

    if not doc_id:
        raise ValueError("doc_id is required")

    if review_status not in allowed:
        raise ValueError(f"review_status must be one of {allowed}")

    payload: Dict[str, Any] = {
        "review_status": review_status,
        "reviewed_at": firestore.SERVER_TIMESTAMP,
    }

    if corrected_label is not None:
        payload["corrected_label"] = str(corrected_label).strip() or None

    if reviewer_note is not None:
        payload["reviewer_note"] = str(reviewer_note).strip() or None

    if reviewed_by is not None:
        payload["reviewed_by"] = str(reviewed_by).strip() or None

    try:
        doc_ref = db.collection("reports_public").document(doc_id)
        if not doc_ref.get().exists:
            logger.warning("[Firestore REVIEW] report not found: reports_public/%s", doc_id)
            return False

        doc_ref.set(payload, merge=True)
        logger.info("[Firestore] Updated review on reports_public/%s", doc_id)
        return True
    except Exception as e:
        logger.error("[Firestore REVIEW ERROR] %s", e, exc_info=True)
        return False
