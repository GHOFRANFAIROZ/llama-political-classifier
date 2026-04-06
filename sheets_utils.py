# sheets_utils.py

import gspread
import json
from google.oauth2 import service_account
import logging

logger = logging.getLogger("sheets-utils")


# ================================
# Caches
# ================================
_spreadsheet_cache = None
_worksheet_cache = {}


# ================================
# Load Spreadsheet (Public Mode ONLY)
# ================================
def get_spreadsheet(GOOGLE_CREDENTIALS_JSON, SHEET_URL, SPREADSHEET_ID):
    """
    Loads the Google Sheet using credentials.
    Returns:
        spreadsheet object on success
        None on failure
    """
    global _spreadsheet_cache

    if _spreadsheet_cache is not None:
        return _spreadsheet_cache

    if not GOOGLE_CREDENTIALS_JSON:
        logger.warning("[Sheets] GOOGLE_CREDENTIALS_JSON missing. Sheets disabled.")
        return None

    if not SHEET_URL and not SPREADSHEET_ID:
        logger.warning("[Sheets] Missing SHEET_URL and SPREADSHEET_ID. Sheets disabled.")
        return None

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    try:
        creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
    except Exception as e:
        logger.warning(f"[Sheets] Invalid GOOGLE_CREDENTIALS_JSON: {e}")
        return None

    try:
        creds = service_account.Credentials.from_service_account_info(
            creds_info,
            scopes=scopes,
        )
        gc = gspread.authorize(creds)
    except Exception as e:
        logger.warning(f"[Sheets] Failed to authorize Google Sheets client: {e}")
        return None

    try:
        if SHEET_URL:
            ss = gc.open_by_url(SHEET_URL)
        else:
            ss = gc.open_by_key(SPREADSHEET_ID)

        _spreadsheet_cache = ss
        logger.info("[Sheets] Spreadsheet connection established successfully.")
        return ss

    except Exception as e:
        logger.warning(f"[Sheets] Failed to open spreadsheet: {e}")
        return None


# ================================
# Worksheet creation
# ================================
def ensure_worksheet(ss, title: str, rows: int = 2000, cols: int = 50):
    """
    Gets or creates a specific worksheet.
    Returns:
        worksheet object on success
        None on failure
    """
    global _worksheet_cache

    if ss is None:
        logger.warning(f"[Sheets] Cannot ensure worksheet '{title}': spreadsheet is unavailable.")
        return None

    if title in _worksheet_cache:
        return _worksheet_cache[title]

    try:
        ws = ss.worksheet(title)
        _worksheet_cache[title] = ws
        return ws
    except Exception:
        pass

    try:
        logger.info(f"[Sheets] Creating worksheet '{title}' ...")
        ws = ss.add_worksheet(title=title, rows=str(rows), cols=str(cols))
        _worksheet_cache[title] = ws
        return ws
    except Exception as e:
        logger.warning(f"[Sheets] Failed to get/create worksheet '{title}': {e}")
        return None


# ================================
# Insert Headers
# ================================
def ensure_headers(ws, COMMON_HEADERS):
    if ws is None:
        logger.warning("[Sheets] ensure_headers skipped: worksheet unavailable.")
        return False

    try:
        first = ws.row_values(1)
        if not first or all(not str(c).strip() for c in first):
            ws.append_row(COMMON_HEADERS)
            logger.info(f"[Sheets] Initialized headers for '{ws.title}'")
        return True
    except Exception as e:
        logger.warning(f"[Sheets] ensure_headers failed for '{getattr(ws, 'title', 'unknown')}': {e}")
        return False


# ================================
# Determine sheet based on mode/source
# ================================
def get_target_worksheet(
    mode: str,
    source: str,
    ss,
    EXTENSION_SHEET_NAME,
    FACEBOOK_SHEET_NAME,
    MANUAL_SHEET_NAME,
    MOBILE_SHEET_NAME,
    COMMON_HEADERS
):
    """
    Returns the appropriate worksheet, or None if Sheets is unavailable.
    """
    if ss is None:
        logger.warning("[Sheets] get_target_worksheet skipped: spreadsheet unavailable.")
        return None

    mode = (mode or "").lower()
    source = (source or "").lower()

    # normalize common FB values
    if source in ["fb", "facebook_post", "fb_post", "facebookpost"]:
        source = "facebook"

    # Popup manual input
    if mode == "popup":
        ws = ensure_worksheet(ss, MANUAL_SHEET_NAME)
        ensure_headers(ws, COMMON_HEADERS)
        return ws

    # Mobile share mode
    if mode == "mobile_share":
        ws = ensure_worksheet(ss, MOBILE_SHEET_NAME)
        ensure_headers(ws, COMMON_HEADERS)
        return ws

    # Facebook posts
    if source == "facebook":
        ws = ensure_worksheet(ss, FACEBOOK_SHEET_NAME)
        ensure_headers(ws, COMMON_HEADERS)
        return ws

    # Default = extension worksheet
    ws = ensure_worksheet(ss, EXTENSION_SHEET_NAME)
    ensure_headers(ws, COMMON_HEADERS)
    return ws