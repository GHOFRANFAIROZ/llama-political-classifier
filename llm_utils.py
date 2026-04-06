# llm_utils.py
import json
import logging
import os
import re
import time
from typing import Any, Dict, Optional, Tuple

from google import genai
from google.genai.types import GenerateContentConfig

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
# FULL PROMPT
# ================================
def build_prompt(text: str) -> str:
    return f"""
You are a strict safety classifier for Arabic social media and public-content text.

Return ONLY valid JSON.
Do not return markdown.
Do not wrap the answer in code fences.
Do not add any explanation outside the JSON.
Do not return any keys other than:
- label_id
- reason_ar
- confidence_score

You must classify into exactly one of these labels:
- CALL_FOR_VIOLENCE
- SECTARIAN_RELIGIOUS_INCITEMENT
- HATE_SPEECH_GROUP
- POLITICAL_VIOLENCE_INCITEMENT
- WAR_CRIMES_DENIAL_JUSTIFICATION
- TOXIC_PERSONAL_ATTACK
- PROTECTED_POLITICAL_OPINION
- NEUTRAL_OTHER

Decision rules:
- If the text explicitly calls for killing, attacking, exterminating, expelling, burning, or physically harming people, use CALL_FOR_VIOLENCE.
- If the text incites hatred or hostility against a sect or religion, use SECTARIAN_RELIGIOUS_INCITEMENT.
- If the text dehumanizes or attacks a group based on identity, use HATE_SPEECH_GROUP.
- If the text calls for violence in a political context, use POLITICAL_VIOLENCE_INCITEMENT.
- If the text denies or justifies war crimes or mass atrocities, use WAR_CRIMES_DENIAL_JUSTIFICATION.
- If the text is a direct abusive insult toward a person without broader group-hate or explicit violence, use TOXIC_PERSONAL_ATTACK.
- If the text contains political criticism or opinion without hate or incitement, use PROTECTED_POLITICAL_OPINION.
- Use NEUTRAL_OTHER only if there is no clear hate, incitement, justification of atrocity, or toxic abuse.

Critical guidance:
- Statements like "يجب قتلهم", "اطردوهم من البلد", "يجب حرقهم", "يجب إبادتهم" are NOT neutral.
- Do not choose NEUTRAL_OTHER when there is explicit violent incitement.
- Base the decision on the strongest explicit evidence in the text.
- reason_ar must be short, clear, and in Arabic.
- confidence_score must be a number between 0 and 1.

Return exactly one JSON object in this format:
{{
  "label_id": "CALL_FOR_VIOLENCE",
  "reason_ar": "سبب قصير بالعربية",
  "confidence_score": 0.98
}}

Content:
{json.dumps(text, ensure_ascii=False)}
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


def _strip_code_fences(txt: str) -> str:
    txt = txt.strip()
    txt = re.sub(r"^```(?:json)?\s*", "", txt, flags=re.IGNORECASE)
    txt = re.sub(r"\s*```$", "", txt)
    return txt.strip()


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
# JSON Parsing (STRONGER VERSION)
# ================================
def safe_json_parse(content: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if content is None:
        return None, "empty_model_response"

    # Best path: structured output parsed by SDK
    if isinstance(content, dict):
        normalized = _normalize_result(
            content,
            parse_status="dict_direct",
            fallback_used=False,
            review_recommended=False,
        )
        if normalized:
            return normalized, None
        return None, "invalid_structured_dict"

    txt = str(content).strip()
    if not txt:
        return None, "empty_model_response"

    txt = _strip_code_fences(txt)

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
                fallback_used=False,
                review_recommended=False,
            )
            if normalized:
                note = None if idx == 0 else "json_extracted_from_text"
                return normalized, note
        except json.JSONDecodeError:
            pass

    # last-resort fallback: label-only extraction
    label_match = re.search(
        r"(CALL_FOR_VIOLENCE|SECTARIAN_RELIGIOUS_INCITEMENT|HATE_SPEECH_GROUP|POLITICAL_VIOLENCE_INCITEMENT|WAR_CRIMES_DENIAL_JUSTIFICATION|TOXIC_PERSONAL_ATTACK|PROTECTED_POLITICAL_OPINION|NEUTRAL_OTHER)",
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

    logger.warning("Unable to parse model output into valid JSON. raw=%s", txt[:1200])
    return None, "no_valid_json_found"


# ================================
# Fallback result
# ================================
def fallback_result(extra: str = "") -> Dict[str, Any]:
    return {
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "تعذر استخراج تصنيف موثوق من النموذج.",
        "confidence_score": 0.0,
        "parse_status": extra or "fallback_used",
        "fallback_used": True,
        "review_recommended": True,
        "_fallback_note": extra or "fallback_used",
    }


# ================================
# Extract text
# ================================
def _extract_text(resp: Any) -> Any:
    try:
        # best case: SDK parsed structured output
        if hasattr(resp, "parsed") and resp.parsed:
            return resp.parsed

        # text field
        if hasattr(resp, "text") and resp.text:
            return resp.text.strip()

        # candidates fallback
        candidates = getattr(resp, "candidates", None)
        if candidates:
            parts_text = []
            for cand in candidates:
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

    return str(resp)


# ================================
# Gemini call
# ================================
def call_llm_with_backoff(
    prompt: str,
    model_name: str,
    max_attempts: int = 4,
    base_delay: float = 1.0,
    max_delay: float = 20.0,
) -> Any:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is missing.")
        return fallback_result("missing_gemini_api_key")

    client = genai.Client(api_key=api_key)

    cfg = GenerateContentConfig(
        temperature=0.1,
        max_output_tokens=256,
        response_mime_type="application/json",
        response_json_schema=CLASSIFICATION_SCHEMA,
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
                parsed, parse_note = safe_json_parse(raw_content)

                if parsed:
                    if parse_note:
                        parsed["parse_status"] = parse_note
                        parsed["fallback_used"] = parsed.get("fallback_used", True)
                        parsed["review_recommended"] = parsed.get("review_recommended", True)

                    logger.info(
                        "LLM parsed successfully. label=%s confidence=%s parse_status=%s fallback_used=%s",
                        parsed.get("label_id"),
                        parsed.get("confidence_score"),
                        parsed.get("parse_status", "ok"),
                        parsed.get("fallback_used", False),
                    )
                    return parsed

                logger.warning(
                    "LLM parse failed. parse_note=%s attempt=%s/%s",
                    parse_note,
                    attempt,
                    max_attempts,
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
                    attempt,
                    max_attempts,
                    e,
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