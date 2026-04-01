# sheets_utils.py

import gspread
import json
from google.oauth2 import service_account
import logging

logger = logging.getLogger("sheets-utils")


# ================================
# Load Spreadsheet (Public Mode ONLY)
# ================================
_spreadsheet_cache = None
_worksheet_cache = {}

def get_spreadsheet(GOOGLE_CREDENTIALS_JSON, SHEET_URL, SPREADSHEET_ID):
    """Loads the Google Sheet using credentials."""
    global _spreadsheet_cache

    if _spreadsheet_cache:
        return _spreadsheet_cache

    if not GOOGLE_CREDENTIALS_JSON:
        raise ValueError("GOOGLE_CREDENTIALS_JSON missing")

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
    creds = service_account.Credentials.from_service_account_info(
        creds_info, scopes=scopes
    )
    gc = gspread.authorize(creds)

    if SHEET_URL:
        ss = gc.open_by_url(SHEET_URL)
    elif SPREADSHEET_ID:
        ss = gc.open_by_key(SPREADSHEET_ID)
    else:
        raise ValueError("Missing SHEET_URL or SPREADSHEET_ID")

    _spreadsheet_cache = ss
    return ss


# ================================
# Worksheet creation
# ================================
def ensure_worksheet(ss, title: str, rows: int = 2000, cols: int = 50):
    """Gets or creates a specific worksheet."""
    global _worksheet_cache

    if title in _worksheet_cache:
        return _worksheet_cache[title]

    try:
        ws = ss.worksheet(title)
    except Exception:
        logger.info(f"[Sheets] Creating Worksheet '{title}' ...")
        ws = ss.add_worksheet(title=title, rows=str(rows), cols=str(cols))

    _worksheet_cache[title] = ws
    return ws


# ================================
# Insert Headers
# ================================
def ensure_headers(ws, COMMON_HEADERS):
    try:
        first = ws.row_values(1)
        if not first or all(not c.strip() for c in first):
            ws.append_row(COMMON_HEADERS)
            logger.info(f"[Sheets] Initialized headers for '{ws.title}'")
    except Exception as e:
        logger.warning(f"[Sheets] ensure_headers failed: {e}")


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
    mode = (mode or "").lower()
    source = (source or "").lower()

    # normalize common FB values
    if source in ["fb", "facebook_post", "fb_post", "facebookpost"]:
        source = "facebook"

    # Popup manual input
    if mode == "popup":
        return ensure_worksheet(ss, MANUAL_SHEET_NAME)

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