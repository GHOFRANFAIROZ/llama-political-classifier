from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import logging
from datetime import datetime
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import uuid
import time

# ================================
# Import modules (B2 Architecture)
# ================================
from llm_utils import (
    build_prompt,
    fallback_result,
    call_llm_with_backoff,
)

from sheets_utils import (
    get_spreadsheet,
    get_target_worksheet,
)

from dedupe_utils import (
    clean_text,
    make_dedupe_key,
    is_duplicate,
)

from firestore_utils import (
    save_org_report,
    save_public_report,
)

from org_manager import OrgManager

# ================================
# Flask App Initialization
# ================================
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per hour"]
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("anti-hate-api")

load_dotenv()


@app.before_request
def start_timer():
    request.start_time = time.time()
    request.request_id = str(uuid.uuid4())[:8]

    logger.info(
        f"req={request.request_id} "
        f"started method={request.method} "
        f"path={request.path} "
        f"args={dict(request.args)}"
    )

@app.after_request
def log_request(response):
    latency = int((time.time() - request.start_time) * 1000)

    logger.info(
        f"req={request.request_id} "
        f"path={request.path} "
        f"status={response.status_code} "
        f"latency={latency}ms"
    )

    return response


# ================================
# Gemini Settings
# ================================
from google import genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash")

if not GEMINI_API_KEY:
    logger.warning("⚠️ GEMINI_API_KEY is missing")

gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


# ================================
# Sheets Settings (Public Mode ONLY)
# ================================
SHEET_URL = os.getenv("SHEET_URL")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
GOOGLE_CREDENTIALS_JSON = os.getenv("GOOGLE_CREDENTIALS_JSON") or os.getenv(
    "GOOGLE_SHEETS_CREDENTIALS"
)

EXTENSION_SHEET_NAME = os.getenv("EXTENSION_SHEET_NAME", "Extension Reports")
FACEBOOK_SHEET_NAME = os.getenv("FACEBOOK_SHEET_NAME", "Facebook Reports")
MANUAL_SHEET_NAME = os.getenv("MANUAL_SHEET_NAME", "Manual Links")
MOBILE_SHEET_NAME = os.getenv("MOBILE_SHEET_NAME", "Mobile Reports")

COMMON_HEADERS = [
    "Timestamp",
    "URL",
    "Text",
    "Author",
    "Post Time",
    "Label",
    "Source",
    "Reason",
    "DedupeKey",
    "Confidence",
    "Context",
]


# ================================
# Firestore Setup
# ================================
from firebase_admin_setup import db
from firebase_admin import firestore


# ================================
# Organizations Manager
# ================================
org_manager = OrgManager()


# ================================
# Hate Speech Categories
# ================================
CATEGORY_DEFINITIONS = {
    "CALL_FOR_VIOLENCE": {
        "label_en": "Call for Violence",
        "label_ar": "دعوة أو تحريض على العنف",
        "tooltip_ar": "يتضمن دعوة إلى إيذاء جسدي.",
    },
    "SECTARIAN_RELIGIOUS_INCITEMENT": {
        "label_en": "Sectarian / Religious Incitement",
        "label_ar": "تحريض طائفي أو ديني",
        "tooltip_ar": "تحريض ضد طائفة أو دين.",
    },
    "HATE_SPEECH_GROUP": {
        "label_en": "Hate Speech Against a Group",
        "label_ar": "خطاب كراهية ضد جماعة",
        "tooltip_ar": "استهداف جماعة كاملة.",
    },
    "POLITICAL_VIOLENCE_INCITEMENT": {
        "label_en": "Political Violence Incitement",
        "label_ar": "تحريض على العنف السياسي",
        "tooltip_ar": "عنف بسبب الانتماء السياسي.",
    },
    "WAR_CRIMES_DENIAL_JUSTIFICATION": {
        "label_en": "War Crimes Denial / Justification",
        "label_ar": "تبرير/إنكار أذى واسع",
        "tooltip_ar": "تبرير أو إنكار أفعال ضد المدنيين.",
    },
    "TOXIC_PERSONAL_ATTACK": {
        "label_en": "Toxic Personal Attack",
        "label_ar": "هجوم شخصي سام",
        "tooltip_ar": "موجه لشخص واحد.",
    },
    "PROTECTED_POLITICAL_OPINION": {
        "label_en": "Protected Political Opinion",
        "label_ar": "رأي سياسي محمي",
        "tooltip_ar": "نقد سياسي بلا عنف.",
    },
    "NEUTRAL_OTHER": {
        "label_en": "Neutral / Other",
        "label_ar": "محايد / غير ذلك",
        "tooltip_ar": "محتوى عادي.",
    },
}

VALID_LABEL_IDS = set(CATEGORY_DEFINITIONS.keys())

TEXT_LABEL_TO_ID = {
    "call for violence": "CALL_FOR_VIOLENCE",
    "sectarian / religious incitement": "SECTARIAN_RELIGIOUS_INCITEMENT",
    "sectarian incitement": "SECTARIAN_RELIGIOUS_INCITEMENT",
    "hate speech against a group": "HATE_SPEECH_GROUP",
    "political violence incitement": "POLITICAL_VIOLENCE_INCITEMENT",
    "war crimes denial / justification": "WAR_CRIMES_DENIAL_JUSTIFICATION",
    "toxic personal attack": "TOXIC_PERSONAL_ATTACK",
    "protected political opinion": "PROTECTED_POLITICAL_OPINION",
    "neutral": "NEUTRAL_OTHER",
    "other": "NEUTRAL_OTHER",
    "unknown": "NEUTRAL_OTHER",
}

PROMPT_VERSION = "v5"


def normalize_ai_response(ai_data, request_id, path):
    if ai_data is None:
        ai_data = fallback_result("empty_ai_result")

    raw_label_id = str(ai_data.get("label_id") or "").strip().upper()
    if raw_label_id not in VALID_LABEL_IDS:
        logger.warning(
            f"req={request_id} path={path} invalid_label_id={raw_label_id} -> fallback_to_NEUTRAL_OTHER"
        )
        raw_label_id = "NEUTRAL_OTHER"

    cat = CATEGORY_DEFINITIONS[raw_label_id]

    parse_status = str(ai_data.get("parse_status") or "ok").strip()
    fallback_used = bool(ai_data.get("fallback_used", False))
    review_recommended = bool(ai_data.get("review_recommended", False))

    reason_ar = str(ai_data.get("reason_ar") or ai_data.get("reason") or "").strip()

    if fallback_used:
        if not reason_ar:
            reason_ar = "تعذر استخراج تصنيف موثوق من النموذج. يُفضّل التحقق البشري."
        review_recommended = True
        classification_status = "needs_review"
    else:
        if not reason_ar:
            reason_ar = cat["tooltip_ar"]
        classification_status = "ok"

    try:
        conf = float(ai_data.get("confidence_score", 0.0))
    except (TypeError, ValueError):
        conf = 0.0

    conf = max(0.0, min(1.0, conf))

    if raw_label_id == "NEUTRAL_OTHER" and fallback_used:
        classification_status = "needs_review"
        review_recommended = True
        if conf > 0.20:
            conf = 0.20

    logger.info(
        f"req={request_id} path={path} "
        f"label_id={raw_label_id} confidence={conf} "
        f"parse_status={parse_status} fallback_used={fallback_used} "
        f"classification_status={classification_status}"
    )

    return {
        "label_id": raw_label_id,
        "category": cat,
        "reason_ar": reason_ar,
        "confidence_score": conf,
        "parse_status": parse_status,
        "fallback_used": fallback_used,
        "review_recommended": review_recommended,
        "classification_status": classification_status,
    }


def verify_org_token(org_id):
    token = request.headers.get("X-ORG-TOKEN")

    if not token:
        return False

    doc = db.collection("organizations").document(org_id).get()

    if not doc.exists:
        return False

    data = doc.to_dict()

    return data.get("org_token") == token


def try_public_sheet_write(
    *,
    mode,
    source,
    url,
    text_for_sheet,
    author,
    post_time,
    label_ar,
    reason_ar,
    dedupe_key,
    confidence_score,
    context,
    request_id,
):
    """
    Non-fatal Google Sheets writer for public mode.
    Returns:
      {
        "sheet_title": str,
        "sheet_status": "ok" | "duplicate" | "unavailable" | "write_failed",
        "duplicate": bool
      }
    """
    result = {
        "sheet_title": "unavailable",
        "sheet_status": "unavailable",
        "duplicate": False,
    }

    try:
        ss = get_spreadsheet(GOOGLE_CREDENTIALS_JSON, SHEET_URL, SPREADSHEET_ID)
        ws = get_target_worksheet(
            mode,
            source,
            ss,
            EXTENSION_SHEET_NAME,
            FACEBOOK_SHEET_NAME,
            MANUAL_SHEET_NAME,
            MOBILE_SHEET_NAME,
            COMMON_HEADERS,
        )

        if ws is None:
            logger.warning(f"req={request_id} sheets_unavailable_public_mode=1")
            return result

        result["sheet_title"] = ws.title

        try:
            if is_duplicate(ws, dedupe_key):
                result["duplicate"] = True
                result["sheet_status"] = "duplicate"
                return result

            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ws.append_row(
                [
                    ts,
                    url,
                    clean_text(text_for_sheet),
                    author,
                    post_time,
                    label_ar,
                    source,
                    reason_ar,
                    dedupe_key,
                    confidence_score,
                    context,
                ]
            )

            result["sheet_status"] = "ok"
            return result

        except Exception as e:
            logger.warning(
                f"req={request_id} sheets_write_failed=1 error={e}",
                exc_info=True
            )
            result["sheet_status"] = "write_failed"
            return result

    except Exception as e:
        logger.warning(
            f"req={request_id} sheets_nonfatal_error=1 error={e}",
            exc_info=True
        )
        return result


# ================================
# HEALTH CHECK
# ================================
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200


# ================================
# CLASSIFY V2 (B2)
# ================================
@limiter.limit("20 per minute")
@app.route("/classify_v2", methods=["POST"])
def classify_v2():
    try:
        data = request.get_json(silent=True) or {}

        org_name = (data.get("org_name") or "").strip()
        org_metadata = org_manager.get_or_create_org(org_name) if org_name else None

        mode = data.get("mode", "extension")
        source = data.get("source", "extension")
        text = data.get("text", "")
        url = data.get("url", "")
        author = data.get("author", "Unknown")
        post_time = data.get("post_time", "")

        context = (
            data.get("context")
            or data.get("user_context")
            or data.get("userContext")
            or ""
        )

        raw_input = text if text else url
        if not raw_input:
            return jsonify({"error": "Empty input"}), 400

        prompt_input = raw_input + (f"\n\n[UserContext]\n{context}" if context else "")
        prompt = build_prompt(prompt_input)

        ai_data = call_llm_with_backoff(prompt, DEFAULT_MODEL)

        normalized = normalize_ai_response(
            ai_data=ai_data,
            request_id=request.request_id,
            path=request.path,
        )

        raw_label_id = normalized["label_id"]
        cat = normalized["category"]
        reason_ar = normalized["reason_ar"]
        conf = normalized["confidence_score"]
        parse_status = normalized["parse_status"]
        fallback_used = normalized["fallback_used"]
        review_recommended = normalized["review_recommended"]
        classification_status = normalized["classification_status"]

        text_for_sheet = text + (f"\n\n[UserContext]\n{context}" if context else "")
        dedupe_key = make_dedupe_key(source, url, text)

        duplicate = False
        sheet_title = "org_firestore_only" if org_metadata else "unavailable"
        sheet_status = "not_applicable" if org_metadata else "unavailable"

        if org_metadata:
            save_org_report(
                org_metadata["org_id"],
                {
                    "text": text,
                    "url": url,
                    "author": author,
                    "post_time": post_time,
                    "label_id": raw_label_id,
                    "reason_ar": reason_ar,
                    "confidence_score": conf,
                    "source": source,
                    "context": context,
                    "dedupe_key": dedupe_key,
                    "parse_status": parse_status,
                    "fallback_used": fallback_used,
                    "review_recommended": review_recommended,
                    "classification_status": classification_status,
                },
            )
        else:
            sheet_result = try_public_sheet_write(
                mode=mode,
                source=source,
                url=url,
                text_for_sheet=text_for_sheet,
                author=author,
                post_time=post_time,
                label_ar=cat["label_ar"],
                reason_ar=reason_ar,
                dedupe_key=dedupe_key,
                confidence_score=conf,
                context=context,
                request_id=request.request_id,
            )

            duplicate = sheet_result["duplicate"]
            sheet_title = sheet_result["sheet_title"]
            sheet_status = sheet_result["sheet_status"]

            save_public_report(
                {
                    "text": text,
                    "url": url,
                    "author": author,
                    "post_time": post_time,
                    "label_id": raw_label_id,
                    "reason_ar": reason_ar,
                    "confidence_score": conf,
                    "source": source,
                    "context": context,
                    "dedupe_key": dedupe_key,
                    "parse_status": parse_status,
                    "fallback_used": fallback_used,
                    "review_recommended": review_recommended,
                    "classification_status": classification_status,
                    "sheet_status": sheet_status,
                }
            )

        return jsonify(
            {
                "label_id": raw_label_id,
                "label_en": cat["label_en"],
                "label_ar": cat["label_ar"],
                "reason_ar": reason_ar,
                "confidence_score": conf,
                "prompt_version": PROMPT_VERSION,
                "dedupe_key": dedupe_key,
                "duplicate": duplicate,
                "success": True,
                "sheet": sheet_title,
                "sheet_status": sheet_status,
                "org_id": org_metadata["org_id"] if org_metadata else None,
                "label": cat["label_ar"],
                "reason": reason_ar,
                "parse_status": parse_status,
                "fallback_used": fallback_used,
                "review_recommended": review_recommended,
                "classification_status": classification_status,
            }
        ), 200

    except Exception as e:
        logger.error(f"[CLASSIFY ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


# ================================
# MOBILE SHARE (B2)
# ================================
@limiter.limit("20 per minute")
@app.route("/mobile_share", methods=["POST"])
def mobile_share():
    try:
        data = request.get_json(silent=True) or {}

        org_name = (data.get("org_name") or "").strip()
        org_metadata = org_manager.get_or_create_org(org_name) if org_name else None

        mode = "mobile_share"
        source = data.get("source", "mobile")
        text = data.get("text", "")
        url = data.get("url", "")
        author = data.get("author", "MobileUser")
        post_time = data.get("post_time", "")
        client = data.get("client", "mobile_share")

        context = (
            data.get("context")
            or data.get("user_context")
            or data.get("userContext")
            or ""
        )

        raw_input = text if text else url
        if not raw_input:
            return jsonify({"error": "Empty input"}), 400

        prompt_input = raw_input + (f"\n\n[UserContext]\n{context}" if context else "")
        prompt = build_prompt(prompt_input)

        ai_data = call_llm_with_backoff(prompt, DEFAULT_MODEL)

        normalized = normalize_ai_response(
            ai_data=ai_data,
            request_id=request.request_id,
            path=request.path,
        )

        raw_label_id = normalized["label_id"]
        cat = normalized["category"]
        reason_ar = normalized["reason_ar"]
        conf = normalized["confidence_score"]
        parse_status = normalized["parse_status"]
        fallback_used = normalized["fallback_used"]
        review_recommended = normalized["review_recommended"]
        classification_status = normalized["classification_status"]

        text_for_sheet = text + (f"\n\n[UserContext]\n{context}" if context else "")
        dedupe_key = make_dedupe_key(source, url, text)

        duplicate = False
        sheet_title = "org_firestore_only" if org_metadata else "unavailable"
        sheet_status = "not_applicable" if org_metadata else "unavailable"

        if org_metadata:
            save_org_report(
                org_metadata["org_id"],
                {
                    "text": text,
                    "url": url,
                    "author": author,
                    "post_time": post_time,
                    "label_id": raw_label_id,
                    "reason_ar": reason_ar,
                    "confidence_score": conf,
                    "source": source,
                    "context": context,
                    "dedupe_key": dedupe_key,
                    "parse_status": parse_status,
                    "fallback_used": fallback_used,
                    "review_recommended": review_recommended,
                    "classification_status": classification_status,
                },
            )
        else:
            sheet_result = try_public_sheet_write(
                mode=mode,
                source=source,
                url=url,
                text_for_sheet=text_for_sheet,
                author=author,
                post_time=post_time,
                label_ar=cat["label_ar"],
                reason_ar=reason_ar,
                dedupe_key=dedupe_key,
                confidence_score=conf,
                context=context,
                request_id=request.request_id,
            )

            duplicate = sheet_result["duplicate"]
            sheet_title = sheet_result["sheet_title"]
            sheet_status = sheet_result["sheet_status"]

            save_public_report(
                {
                    "text": text,
                    "url": url,
                    "author": author,
                    "post_time": post_time,
                    "label_id": raw_label_id,
                    "reason_ar": reason_ar,
                    "confidence_score": conf,
                    "source": source,
                    "context": context,
                    "dedupe_key": dedupe_key,
                    "parse_status": parse_status,
                    "fallback_used": fallback_used,
                    "review_recommended": review_recommended,
                    "classification_status": classification_status,
                    "sheet_status": sheet_status,
                }
            )

        msg_lines = [f"🧠 التصنيف: {cat['label_ar']}"]
        if reason_ar:
            msg_lines.append(f"📝 السبب: {reason_ar}")
        if review_recommended or conf < 0.45:
            msg_lines.append("🔎 يُفضّل التحقق البشري لهذه الحالة.")

        return jsonify(
            {
                "label_id": raw_label_id,
                "label_en": cat["label_en"],
                "label_ar": cat["label_ar"],
                "reason_ar": reason_ar,
                "confidence_score": conf,
                "prompt_version": PROMPT_VERSION,
                "duplicate": duplicate,
                "success": True,
                "message_ar": "\n".join(msg_lines),
                "source": source,
                "client": client,
                "sheet": sheet_title,
                "sheet_status": sheet_status,
                "org_id": org_metadata["org_id"] if org_metadata else None,
                "parse_status": parse_status,
                "fallback_used": fallback_used,
                "review_recommended": review_recommended,
                "classification_status": classification_status,
            }
        ), 200

    except Exception as e:
        logger.error(f"[MOBILE ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


# ================================
# UNIFIED SAVE RECORD (Public + Org)
# ================================
@app.route("/save_record", methods=["POST"])
def save_record():
    try:
        data = request.get_json() or {}

        org_id = data.get("org_id") or data.get("org_token")

        clean_text_val = (data.get("raw_text") or data.get("text") or "").lower()
        clean_reason = (data.get("reason_ar") or data.get("result_reason") or "").lower()
        data["searchable_text"] = f"{clean_text_val} {clean_reason}".strip()

        if org_id:
            ok = save_org_report(org_id, data)
            return jsonify({
                "ok": ok,
                "mode": "org",
                "sheet": "org_firestore_only",
                "sheet_status": "not_applicable",
            }), 200

        save_public_report(data)

        sheet_result = try_public_sheet_write(
            mode="extension",
            source=data.get("source", "extension"),
            url=data.get("url", ""),
            text_for_sheet=data.get("raw_text") or data.get("text") or "",
            author=data.get("author", "Unknown"),
            post_time=data.get("post_time", ""),
            label_ar=data.get("result_label", ""),
            reason_ar=data.get("result_reason", ""),
            dedupe_key=data.get("dedupe_key", ""),
            confidence_score=data.get("confidence", ""),
            context=data.get("context", ""),
            request_id=getattr(request, "request_id", "unknown"),
        )

        return jsonify(
            {
                "ok": True,
                "mode": "public",
                "sheet": sheet_result["sheet_title"],
                "sheet_status": sheet_result["sheet_status"],
                "duplicate": sheet_result["duplicate"],
            }
        ), 200

    except Exception as e:
        logger.error(f"[SAVE_RECORD ERROR] {e}", exc_info=True)
        return jsonify({"ok": False, "error": str(e)}), 500


# ================================
# ROOT ENDPOINT
# ================================
@app.route("/")
def home():
    return "My AI Classifier V2 (Modular B2 Architecture) is Running!", 200


# ================================
# ORG MODE ENDPOINTS
# ================================
@app.route("/org/<org_id>/stats", methods=["GET"])
def get_org_stats(org_id):
    from firestore_utils import get_org_stats

    try:
        stats = get_org_stats(org_id)
        return jsonify(stats), 200
    except Exception as e:
        logger.error(f"[STATS ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/org/<org_id>/trends", methods=["GET"])
def get_org_trends(org_id):
    from firestore_utils import get_org_trends
    try:
        date_range = request.args.get("date_range", "30d")
        data = get_org_trends(org_id, date_range=date_range)
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"[TRENDS ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/org/<org_id>/wordcloud", methods=["GET"])
def get_org_wordcloud(org_id):
    from firestore_utils import get_org_wordcloud

    try:
        data = get_org_wordcloud(org_id)
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"[WORDCLOUD ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/org/<org_id>/reports", methods=["GET"])
def get_org_reports_route(org_id):
    from firestore_utils import get_org_reports

    try:
        limit = int(request.args.get("limit", 20))
        page = int(request.args.get("page", 1))

        category = request.args.get("category")
        platform = request.args.get("platform")
        date_from = request.args.get("date_from")
        date_to = request.args.get("date_to")

        sort = request.args.get("sort", "desc").lower()
        if sort not in ["asc", "desc"]:
            sort = "desc"

        data = get_org_reports(
            org_id=org_id,
            limit=limit,
            page=page,
            category=category,
            platform=platform,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
        )

        return jsonify(data), 200

    except Exception as e:
        logger.error(f"[REPORTS ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@app.route("/org/<org_id>/search", methods=["GET"])
def search_org_reports(org_id):
    from firestore_utils import search_org_reports

    try:
        query = request.args.get("query", "").strip()
        limit = int(request.args.get("limit", 20))
        page = int(request.args.get("page", 1))

        category = request.args.get("category")
        platform = request.args.get("platform")
        date_from = request.args.get("date_from")
        date_to = request.args.get("date_to")
        sort = request.args.get("sort", "desc").lower()

        data = search_org_reports(
            org_id=org_id,
            query=query,
            limit=limit,
            page=page,
            category=category,
            platform=platform,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
        )

        return jsonify(data), 200

    except Exception as e:
        logger.error(f"[SEARCH ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


# ================================
# SIMPLE SEARCH API (Public)
# ================================
@limiter.limit("60 per minute")
@app.route("/api/reports/search", methods=["GET"])
def search_reports():
    try:
        from firestore_utils import search_public_reports

        q = request.args.get("q", "", type=str).strip()
        platform = request.args.get("platform", "", type=str).strip()
        classification = request.args.get("classification", "", type=str).strip()
        date_range = request.args.get("date_range", "7d", type=str)
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)

        logger.info(
            f"req={request.request_id} [PUBLIC SEARCH ROUTE] "
            f"q={q} platform={platform} classification={classification} "
            f"date_range={date_range} limit={limit} offset={offset}"
        )

        data = search_public_reports(
            q=q,
            limit=limit,
            offset=offset,
            platform=platform or None,
            category=classification or None,
            date_range=date_range,
            sort="desc",
        )

        logger.info(
            f"req={request.request_id} [PUBLIC SEARCH ROUTE] done results={len(data.get('results', []))} total={data.get('total')}"
        )

        return jsonify(data), 200

    except Exception as e:
        logger.error(f"req={getattr(request, 'request_id', 'unknown')} [PUBLIC SEARCH ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# ================================
# ORGS LIST (for dashboard)
# ================================
@app.route("/orgs", methods=["GET"])
def list_organizations():
    try:
        logger.info(f"req={request.request_id} [ORGS ROUTE] start")
        orgs = org_manager.list_orgs()
        logger.info(f"req={request.request_id} [ORGS ROUTE] done count={len(orgs)}")
        return jsonify({"results": orgs}), 200
    except Exception as e:
        logger.error(f"req={getattr(request, 'request_id', 'unknown')} [ORGS ERROR] {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


# ==============================
# RUN SERVER
# ==============================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)