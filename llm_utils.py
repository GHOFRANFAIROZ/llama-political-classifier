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
Classify the following content into exactly one safety label.

Rules:
- Use [UserContext] only as supporting context. Do not classify the context itself as separate content.
- reason_ar must be short, clear, and in Arabic.
- confidence_score must be a number between 0 and 1.
- If there is political criticism without hate or incitement, choose PROTECTED_POLITICAL_OPINION.
- If there is no clear hate, incitement, or toxic abuse, choose NEUTRAL_OTHER.
- Base the decision on the strongest explicit evidence in the text.

Content:
{text}
""".strip()


# ================================
# Helpers
# ================================
def _to_float(value: Any, default: float = 0.5) -> float:
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


def _normalize_result(data: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(data, dict):
        return None

    label_id = str(data.get("label_id") or "").strip().upper()
    if label_id not in ALLOWED_LABELS:
        return None

    reason_ar = str(data.get("reason_ar") or "").strip()
    confidence_score = _to_float(data.get("confidence_score", 0.5), default=0.5)

    return {
        "label_id": label_id,
        "reason_ar": reason_ar,
        "confidence_score": confidence_score,
    }


# ================================
# JSON Parsing (STRONGER VERSION)
# ================================
def safe_json_parse(content: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    if content is None:
        return None, "empty_model_response"

    # Best path: structured output parsed by SDK
    if isinstance(content, dict):
        normalized = _normalize_result(content)
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
            normalized = _normalize_result(parsed)
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
            "reason_ar": "",
            "confidence_score": 0.55,
        }, "label_only_fallback"

    logger.warning("Unable to parse model output into valid JSON.")
    return None, "no_valid_json_found"


# ================================
# Fallback result
# ================================
def fallback_result(extra: str = "") -> Dict[str, Any]:
    return {
        "label_id": "NEUTRAL_OTHER",
        "reason_ar": "",
        "confidence_score": 0.35,
        "_fallback_note": extra or "fallback_used",
    }


# ================================
# Extract text
# ================================
def _extract_text(resp: Any) -> Any:
    try:
        if hasattr(resp, "parsed") and resp.parsed:
            return resp.parsed

        if hasattr(resp, "text") and resp.text:
            return resp.text.strip()

        return resp.candidates[0].content.parts[0].text.strip()

    except Exception:
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
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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
                return _extract_text(resp)

            except Exception as e:
                last_err = e

                if attempt < max_attempts:
                    delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                    time.sleep(delay)
                    continue

                raise last_err
    finally:
        try:
            client.close()
        except Exception:
            pass