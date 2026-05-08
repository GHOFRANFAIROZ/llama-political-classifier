import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional, Tuple

from google import genai
from google.genai.types import GenerateContentConfig, ThinkingConfig

logger = logging.getLogger("anti-hate-llm")

ALLOWED_LABELS = [
    "CALL_FOR_VIOLENCE",
    "SECTARIAN_RELIGIOUS_INCITEMENT",
    "HATE_SPEECH_GROUP",
    "POLITICAL_VIOLENCE_INCITEMENT",
    "WAR_CRIMES_DENIAL_JUSTIFICATION",
    "TOXIC_PERSONAL_ATTACK",
    "PROTECTED_POLITICAL_OPINION",
    "NEUTRAL_OTHER",
]

LABEL_ALIASES = {
    "CALL_FOR_VIOLENCE": "CALL_FOR_VIOLENCE",
    "VIOLENCE": "CALL_FOR_VIOLENCE",
    "INCITEMENT_TO_VIOLENCE": "CALL_FOR_VIOLENCE",
    "DIRECT_VIOLENCE_INCITEMENT": "CALL_FOR_VIOLENCE",

    "SECTARIAN_RELIGIOUS_INCITEMENT": "SECTARIAN_RELIGIOUS_INCITEMENT",
    "SECTARIAN_INCITEMENT": "SECTARIAN_RELIGIOUS_INCITEMENT",
    "RELIGIOUS_INCITEMENT": "SECTARIAN_RELIGIOUS_INCITEMENT",

    "HATE_SPEECH_GROUP": "HATE_SPEECH_GROUP",
    "HATE_SPEECH": "HATE_SPEECH_GROUP",
    "GROUP_HATE": "HATE_SPEECH_GROUP",
    "TARGETED_HATE": "HATE_SPEECH_GROUP",

    "POLITICAL_VIOLENCE_INCITEMENT": "POLITICAL_VIOLENCE_INCITEMENT",
    "POLITICAL_VIOLENCE": "POLITICAL_VIOLENCE_INCITEMENT",

    "WAR_CRIMES_DENIAL_JUSTIFICATION": "WAR_CRIMES_DENIAL_JUSTIFICATION",
    "WAR_CRIMES_JUSTIFICATION": "WAR_CRIMES_DENIAL_JUSTIFICATION",
    "WAR_CRIMES_DENIAL": "WAR_CRIMES_DENIAL_JUSTIFICATION",

    "TOXIC_PERSONAL_ATTACK": "TOXIC_PERSONAL_ATTACK",
    "PERSONAL_ATTACK": "TOXIC_PERSONAL_ATTACK",
    "TOXIC": "TOXIC_PERSONAL_ATTACK",
    "INSULT": "TOXIC_PERSONAL_ATTACK",

    "PROTECTED_POLITICAL_OPINION": "PROTECTED_POLITICAL_OPINION",
    "POLITICAL_OPINION": "PROTECTED_POLITICAL_OPINION",
    "POLITICAL_CRITICISM": "PROTECTED_POLITICAL_OPINION",

    "NEUTRAL_OTHER": "NEUTRAL_OTHER",
    "NEUTRAL": "NEUTRAL_OTHER",
    "OTHER": "NEUTRAL_OTHER",
}

CLASSIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "label_id": {
            "type": "string",
            "enum": ALLOWED_LABELS,
        },
        "reason_ar": {
            "type": "string",
            "maxLength": 80,
        },
        "confidence_score": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
        },
    },
    "required": ["label_id", "reason_ar", "confidence_score"],
    "additionalProperties": False,
}


# ================================
# PROMPT
# ================================
def build_prompt(text: str) -> str:
    return f"""
You are a strict classifier for Arabic harmful-content monitoring.

Your task is NOT to decide whether you agree with the text.
Your task is ONLY to classify the content exactly as written.

Return ONLY valid JSON. No prose. No explanation. No markdown. No code fences.
reason_ar must be ONE very short sentence in Arabic, maximum 12 words. Be concise.
The response must start with {{ and end with }}.
Do not write anything before or after the JSON object.
Do not add any keys other than: label_id, reason_ar, confidence_score

You must classify into exactly one of these labels:
- CALL_FOR_VIOLENCE
- SECTARIAN_RELIGIOUS_INCITEMENT
- HATE_SPEECH_GROUP
- POLITICAL_VIOLENCE_INCITEMENT
- WAR_CRIMES_DENIAL_JUSTIFICATION
- TOXIC_PERSONAL_ATTACK
- PROTECTED_POLITICAL_OPINION
- NEUTRAL_OTHER

Definition rules:
- CALL_FOR_VIOLENCE = explicit calls to kill, attack, burn, expel, exterminate, physically harm, or destroy people.
- SECTARIAN_RELIGIOUS_INCITEMENT = hatred/incitement against a sect or religion.
- HATE_SPEECH_GROUP = dehumanizing or hateful attack against a group based on identity.
- POLITICAL_VIOLENCE_INCITEMENT = violence urged against political actors/groups in a political context.
- WAR_CRIMES_DENIAL_JUSTIFICATION = denial or justification of mass atrocities or war crimes.
- TOXIC_PERSONAL_ATTACK = insulting/abusive attack against a specific individual without broader group hate or explicit violence.
- PROTECTED_POLITICAL_OPINION = political criticism/opinion without hate or violence.
- NEUTRAL_OTHER = only if none of the above applies.

Critical instructions:
- If the text says "يجب قتل..." or "اقتلو..." or "يجب حرق..." or "يجب إباد..." or "اطردو..." then it is NOT neutral.
- Any explicit call for killing or physical harm must be CALL_FOR_VIOLENCE.
- Do not sanitize, reinterpret, soften, or excuse violent wording.
- Classify the strongest explicit meaning in the text.
- If violent wording is explicit, do not choose NEUTRAL_OTHER.

Examples:
Input: "يجب قتل الجميع"
Output: {{"label_id":"CALL_FOR_VIOLENCE","reason_ar":"النص يتضمن دعوة صريحة إلى القتل.","confidence_score":0.99}}

Input: "اقتلوهم جميعاً"
Output: {{"label_id":"CALL_FOR_VIOLENCE","reason_ar":"النص يحرض بشكل مباشر على القتل.","confidence_score":0.99}}

Input: "هؤلاء يجب طردهم من البلد"
Output: {{"label_id":"CALL_FOR_VIOLENCE","reason_ar":"النص يتضمن تحريضاً مباشراً على الإيذاء أو الإقصاء القسري.","confidence_score":0.9}}

Input: "أنا أختلف مع هذه الحكومة وسياساتها"
Output: {{"label_id":"PROTECTED_POLITICAL_OPINION","reason_ar":"النص يعبر عن رأي سياسي دون تحريض أو كراهية.","confidence_score":0.95}}

Input: "هذا محتوى عادي بلا تحريض"
Output: {{"label_id":"NEUTRAL_OTHER","reason_ar":"النص لا يتضمن تحريضاً أو كراهية أو إساءة مباشرة.","confidence_score":0.95}}

Now classify this content and return ONLY the JSON object.
If [UserContext] is present, use it to refine classification only. Do not quote it in reason_ar.
reason_ar must be ONE very short sentence in Arabic, maximum 12 words. Be concise.

{text}
""".strip()


# ================================
# Helpers
# ================================
def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return default
    if num < 0:
        return 0.0
    if num > 1:
        return 1.0
    return num


def _strip_prose_and_fences(txt: str) -> str:
    """
    Remove any prose/preamble before the first JSON object,
    and any trailing markdown fences.

    Handles cases like:
      - "Here is the JSON requested:\n```json\n{...}\n```"
      - "```json\n{...}\n```"
      - "{...}"  (already clean)
    """
    txt = txt.strip()

    # Remove trailing fences first
    txt = re.sub(r"\s*```\s*$", "", txt).strip()

    # Find the first { — everything before it is prose/fences
    first_brace = txt.find("{")
    if first_brace == -1:
        # No JSON object found at all — return as-is for downstream handling
        return txt

    return txt[first_brace:].strip()


def _extract_first_json_object(txt: str) -> Optional[str]:
    start = txt.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(txt)):
        ch = txt[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return txt[start:i + 1]

    return None

def _looks_truncated(txt: str) -> bool:
    """
    Returns True if txt looks like a JSON object cut off mid-stream.
    Heuristic: starts with { but does not end with }
    """
    t = txt.strip()
    return t.startswith("{") and not t.endswith("}")    


def _normalize_label(label: Any) -> Optional[str]:
    raw = str(label or "").strip().upper()
    raw = raw.replace("-", "_").replace(" ", "_")
    normalized = LABEL_ALIASES.get(raw, raw)
    if normalized in ALLOWED_LABELS:
        return normalized
    return None


def _normalize_result(
    data: Any,
    parse_status: str = "ok",
    fallback_used: bool = False,
    review_recommended: bool = False,
) -> Optional[Dict[str, Any]]:
    if not isinstance(data, dict):
        return None

    raw_label = (
        data.get("label_id")
        or data.get("label")
        or data.get("classification")
        or data.get("category")
    )
    label_id = _normalize_label(raw_label)
    if not label_id:
        return None

    reason_ar = (
        data.get("reason_ar")
        or data.get("reason")
        or data.get("explanation")
        or data.get("rationale")
        or ""
    )
    reason_ar = str(reason_ar or "").strip()

    confidence_score = _to_float(
        data.get("confidence_score", data.get("confidence", data.get("score", 0.0))),
        default=0.0,
    )

    return {
        "label_id": label_id,
        "reason_ar": reason_ar,
        "confidence_score": confidence_score,
        "parse_status": parse_status,
        "fallback_used": fallback_used,
        "review_recommended": review_recommended,
    }


# ================================
# JSON Parsing
# ================================
def safe_json_parse(content: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if content is None:
        return None, "empty_model_response"

    if content == "__TRUNCATED_MAX_TOKENS__":
        return None, "truncated_output"

    # Best path: SDK returned a dict directly (structured output worked)
    if isinstance(content, dict):
        normalized = _normalize_result(content, parse_status="dict_direct")
        if normalized:
            return normalized, None
        return None, "invalid_structured_dict"

    # Handle non-dict objects (typed SDK responses, Pydantic models, etc.)
    if not isinstance(content, str):
        # Try model_dump() for Pydantic v2
        if hasattr(content, "model_dump"):
            try:
                d = content.model_dump()
                normalized = _normalize_result(d, parse_status="model_dump")
                if normalized:
                    return normalized, None
            except Exception:
                pass
        # Try vars()
        if hasattr(content, "__dict__"):
            try:
                d = vars(content)
                normalized = _normalize_result(d, parse_status="vars_dict")
                if normalized:
                    return normalized, None
            except Exception:
                pass
        # Try JSON round-trip
        try:
            d = json.loads(json.dumps(content, default=str))
            if isinstance(d, dict):
                normalized = _normalize_result(d, parse_status="json_roundtrip")
                if normalized:
                    return normalized, None
        except Exception:
            pass
        # Convert to string and fall through
        content = str(content)

    txt = content.strip()
    if not txt:
        return None, "empty_model_response"

    # ── KEY FIX: strip prose preamble and code fences before parsing ──
    txt = _strip_prose_and_fences(txt)

    candidates = [txt]
    extracted = _extract_first_json_object(txt)
    if extracted and extracted != txt:
        candidates.append(extracted)

    for idx, candidate in enumerate(candidates):
        try:
            parsed = json.loads(candidate)
            normalized = _normalize_result(
                parsed,
                parse_status="json_direct" if idx == 0 else "json_extracted_from_text",
            )
            if normalized:
                note = None if idx == 0 else "json_extracted_from_text"
                return normalized, note
        except json.JSONDecodeError:
            pass

    # Last-resort: label-only regex extraction
    label_match = re.search(
        r"(CALL_FOR_VIOLENCE|SECTARIAN_RELIGIOUS_INCITEMENT|HATE_SPEECH_GROUP"
        r"|POLITICAL_VIOLENCE_INCITEMENT|WAR_CRIMES_DENIAL_JUSTIFICATION"
        r"|TOXIC_PERSONAL_ATTACK|PROTECTED_POLITICAL_OPINION|NEUTRAL_OTHER)",
        txt,
    )
    if label_match:
        return {
            "label_id": label_match.group(1),
            "reason_ar": "تم استخراج التصنيف جزئيًا من رد النموذج.",
            "confidence_score": 0.40,
            "parse_status": "label_only_fallback",
            "fallback_used": True,
            "review_recommended": True,
        }, "label_only_fallback"

    status = "truncated_output" if _looks_truncated(txt) else "no_valid_json_found"
    logger.warning("Unable to parse model output. status=%s raw=%s", status, txt[:1200])
    return None, status


# ================================
# Fallback result
# ================================
def fallback_result(extra: str = "") -> Dict[str, Any]:
    if extra == "truncated_output":
        reason = "الرد جاء مقطوعًا من النموذج. يُنصح بإعادة المحاولة."
    elif extra == "missing_gemini_api_key":
        reason = "مفتاح النموذج غير متوفر."
    elif extra == "llm_call_failed":
        reason = "فشل الاتصال بالنموذج بعد عدة محاولات."
    else:
        reason = "تعذر استخراج تصنيف موثوق من النموذج."

    return {
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": reason,
        "confidence_score": 0.0,
        "parse_status": extra or "fallback_used",
        "fallback_used": True,
        "review_recommended": True,
        "_fallback_note": extra or "fallback_used",
    }

# ================================
# Extract text from SDK response
# ================================
def _extract_text(resp: Any) -> Any:
    try:
                # فحص مبكر: إذا الرد منتهي بـ MAX_TOKENS، لا نحاول parse
        try:
            top_candidate = (getattr(resp, "candidates", None) or [None])[0]
            if top_candidate is not None:
                finish_reason = getattr(top_candidate, "finish_reason", None)
                if finish_reason and "MAX_TOKENS" in str(finish_reason).upper():
                    logger.warning("Response truncated (MAX_TOKENS) — skipping parse.")
                    return "__TRUNCATED_MAX_TOKENS__"
        except Exception:
            pass
        # Best case: SDK parsed structured output as dict
        if hasattr(resp, "parsed") and resp.parsed is not None:
            parsed = resp.parsed
            if isinstance(parsed, dict):
                return parsed
            if hasattr(parsed, "model_dump"):
                try:
                    return parsed.model_dump()
                except Exception:
                    pass
            if hasattr(parsed, "__dict__"):
                try:
                    return vars(parsed)
                except Exception:
                    pass
            try:
                return json.loads(
                    json.dumps(parsed, default=lambda o: vars(o) if hasattr(o, "__dict__") else str(o))
                )
            except Exception:
                pass

        # Text field (plain string response)
        if hasattr(resp, "text") and resp.text:
            return resp.text.strip()

        # Candidates fallback
        candidates = getattr(resp, "candidates", None)
        if candidates:
            parts_text = []
            for cand in candidates:
                # Skip truncated candidates — their output is incomplete JSON
                finish_reason = getattr(cand, "finish_reason", None)
                finish_name = str(finish_reason).upper() if finish_reason else ""
                if "MAX_TOKENS" in finish_name:
                    logger.warning("Candidate finish_reason=MAX_TOKENS — output truncated, skipping.")
                    continue

                content = getattr(cand, "content", None)
                if not content:
                    continue
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    part_text = getattr(part, "text", None)
                    if part_text:
                        parts_text.append(part_text.strip())
            if parts_text:
                return "\n".join(parts_text).strip()

    except Exception:
        pass

    # Do NOT return str(resp) — it produces an unreadable SDK object string
    # that poisons the parser. Return None so caller treats it as empty.
    return None


# ================================
# Gemini call with backoff
# ================================
def call_llm_with_backoff(
    prompt: str,
    model_name: str,
    max_attempts: int = 4,
    base_delay: float = 0.5,   # reduced: model inconsistency ≠ server overload
    max_delay: float = 4.0,    # reduced: no need to wait 20s between retries
) -> Any:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is missing.")
        return fallback_result("missing_gemini_api_key")

    client = genai.Client(api_key=api_key)

    cfg = GenerateContentConfig(
        temperature=0.1,
        max_output_tokens=800,
        response_mime_type="application/json",
        response_json_schema=CLASSIFICATION_SCHEMA,
        thinking_config=ThinkingConfig(thinking_budget=0),
    )

    last_err = None

    try:
        for attempt in range(1, max_attempts + 1):
            try:
                resp = client.models.generate_content(
                    model=model_name,
                    contents=[{"role": "user", "parts": [{"text": prompt}]}],
                    config=cfg,
                )

                raw_content = _extract_text(resp)

                # ── DEBUG: remove this block after confirming fix is stable ──
            
                # ──────────────────────────────────────────────────────────────

                parsed, parse_note = safe_json_parse(raw_content)

                if parsed:
                    is_low_quality = (
                        parsed.get("parse_status") in (
                            "label_only_fallback",
                            "truncated_output",
                        )
                        or parsed.get("fallback_used") is True
                        or _to_float(parsed.get("confidence_score"), default=0.0) < 0.65
                    )

                    # إذا كانت النتيجة low-quality وعندنا attempts باقية، نعيد المحاولة
                    if is_low_quality and attempt < max_attempts:
                        logger.warning(
                            "Low-quality parse (status=%s fallback=%s) on attempt %s/%s — retrying.",
                            parsed.get("parse_status"),
                            parsed.get("fallback_used"),
                            attempt,
                            max_attempts,
                        )
                        delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                        time.sleep(delay)
                        continue

                  # نقبل النتيجة: إما جيدة، أو آخر attempt
                    if parse_note:
                        parsed["parse_status"] = parse_note
                        parsed["fallback_used"] = parsed.get("fallback_used", True)
                        parsed["review_recommended"] = parsed.get("review_recommended", True)

                    logger.info(
                        "LLM parsed successfully. label=%s confidence=%s "
                        "parse_status=%s fallback_used=%s attempt=%s",
                        parsed.get("label_id"),
                        parsed.get("confidence_score"),
                        parsed.get("parse_status", "ok"),
                        parsed.get("fallback_used", False),
                        attempt,
                    )
                    return parsed

                logger.warning(
                    "LLM parse failed. parse_note=%s attempt=%s/%s",
                    parse_note, attempt, max_attempts,
                )

                if attempt < max_attempts:
                    delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                    time.sleep(delay)
                    continue

                return fallback_result(parse_note or "parse_failed")

            except Exception as e:
                last_err = e
                logger.warning(
                    "Gemini call failed on attempt %s/%s: %s",
                    attempt, max_attempts, e,
                )
                if attempt < max_attempts:
                    delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                    time.sleep(delay)
                    continue

                logger.exception("Gemini call failed after all retries.")
                return fallback_result("llm_call_failed")

    finally:
        try:
            client.close()
        except Exception:
            pass
