from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
import os
import gspread
import json
from datetime import datetime
from google.oauth2 import service_account
import logging
from flask_cors import CORS

# --- إعداد Flask ---
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- تحميل متغيرات البيئة ---
load_dotenv()

# --- إعداد التسجيل ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- إعداد Groq ---
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# --- إعداد Google Sheets ---
_sheet_cache = None
def get_sheet():
    global _sheet_cache
    if _sheet_cache:
        return _sheet_cache
    try:
        scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        creds_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS") or os.getenv("GOOGLE_CREDENTIALS_JSON")
        
        if not creds_json:
             raise ValueError("GOOGLE_CREDENTIALS_JSON missing")
        
        creds_dict = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=scope)
        sheet_client = gspread.authorize(creds)
        
        sheet_url = os.getenv("SHEET_URL")
        spreadsheet_id = os.getenv("SPREADSHEET_ID")
        
        if sheet_url:
            spreadsheet = sheet_client.open_by_url(sheet_url)
        elif spreadsheet_id:
            spreadsheet = sheet_client.open_by_key(spreadsheet_id)
        else:
             raise ValueError("Missing SHEET_URL or SPREADSHEET_ID")

        return spreadsheet.worksheet("Extension Reports")
        
    except Exception as e:
        logger.error(f"Failed to connect to Google Sheets: {e}")
        raise e

def clean_text(text):
    if not text: return ""
    return text.replace('\n', ' ').strip()[:1000]

def build_prompt(text):
    return f'''
You are an advanced AI content classification agent working on political posts in the Syrian context.

Your task is to analyze the following post and classify it into **only one** of the following categories:
1. Call for Violence
2. Sectarian Incitement
3. Spreading False Information
4. Politically Charged but Not Harmful
5. Neutral
6. Other

Be strict, context-aware, and do not treat vague or emotionally charged language as Neutral if it implies division, misinformation, or incitement. Be especially cautious with sarcasm, indirect blame, or accusations without proof.

---

🔴 Call for Violence:
Posts that directly or indirectly promote violence.
Includes:
- Encouragement to harm, kill, or punish.
- Collective revenge, even implied.
- Words like: “remove them”, “they must pay”, “actions will replace words”.
- Justification of military violence.

✅ Examples:
- "We must remove them before they poison more minds."
→ Classification: Call for Violence

- "Our patience is running out. Soon, actions will replace words."
→ Classification: Call for Violence

- "The Israeli airstrikes on Syria are a justified response to Iranian militias."
→ Classification: Call for Violence

---

🟠 Sectarian Incitement:
Promotes division based on sectarian/religious identity.
Includes:
- Statements against Alawites, Sunnis, Christians as groups.
- Advocating leadership based on sect.
- Demanding separation or autonomy for sects.

✅ Examples:
- "We need a Sunni-led restructuring — anything else is betrayal."
→ Classification: Sectarian Incitement

- "Christians need their own administration. We can’t trust Islamists."
→ Classification: Sectarian Incitement

- "Only international protection can stop the massacres happening in the north."
→ Classification: Sectarian Incitement

---

🟡 Spreading False Information:
Spreads unverified or distorted political claims.
Includes:
- Suggesting conspiracy without evidence.
- Equating transitional government with Assad’s regime without basis.
- Denying documented crimes.
- Making accusations without identifying actors clearly.

✅ Examples:
- "People say Assad ordered the massacres, but did anyone actually see him do it? Maybe we're not seeing the full picture."
→ Classification: Spreading False Information

- "The transitional government is being too cozy with foreign powers. Who do they really work for?"
→ Classification: Spreading False Information

- "The 'liberated areas' were lawless zones ruled by extremists. The media silenced every voice exposing the truth."
→ Classification: Spreading False Information

---

🟤 Politically Charged but Not Harmful:
Strong criticism or sarcasm without falsehoods, hate, or division.
Includes:
- Blaming leadership or war outcomes without promoting hate.
- Frustrated tone or skepticism without distortion.
- Emotionally loaded but truthful posts.

✅ Examples:
- "The transitional government wants us to trust them, but they’ve done nothing yet."
→ Classification: Politically Charged but Not Harmful

- "Nice PR campaign by the new leaders. Let’s see if anything changes."
→ Classification: Politically Charged but Not Harmful

- "Everyone thinks they’re the saviors. People still starve."
→ Classification: Politically Charged but Not Harmful

---

🟢 Neutral:
Verified facts or clear political views without hostility, hate, or manipulation.
Includes:
- Frustration with justice or leadership that does not promote hate.
- Descriptive posts without distortion.

✅ Examples:
- "No weapons outside state authority."
→ Classification: Neutral

- "We need services in the liberated areas."
→ Classification: Neutral

- "Let them live peacefully, but never again in charge."
→ Classification: Neutral

---

🟣 Other:
Use when:
- The post is unrelated to politics/violence.
- Or too vague to classify with confidence.

---
⚠️ IMPORTANT OUTPUT FORMAT (JSON ONLY):
You must respond with a strictly valid JSON object. Do not include any other text.
The JSON must follow this exact structure:
{{
  "label": "WRITE_THE_EXACT_CATEGORY_NAME_HERE",
  "reason": "Write a short sentence explaining why you chose this label."
}}

POST TO ANALYZE:
{text}
'''

# --- فحوصات الصحة ---
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200

@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"}), 200

# --- نقطة نهاية التصنيف ---
@app.route("/classify_v2", methods=["POST", "OPTIONS"])
def classify():
    if request.method == "OPTIONS":
        return _build_cors_preflight_response()

    try:
        data = request.get_json(silent=True) or {}
        
        # استخراج البيانات
        text_to_analyze = data.get("text", "")
        url_link = data.get("url", "")
        
        # 👇👇👇 التعديل الجديد: استقبال الكاتب والوقت
        author = data.get("author", "Unknown")
        post_time = data.get("post_time", "")
        
        raw_input = text_to_analyze if text_to_analyze else url_link
        
        if not raw_input:
            return jsonify({"error": "Empty input"}), 400

        logger.info(f"Analyzing post by {author}: {raw_input[:50]}...")

        # 1. الاتصال بـ Groq
        prompt = build_prompt(raw_input)
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        
        # 2. تحليل الرد
        ai_content = response.choices[0].message.content
        ai_data = json.loads(ai_content)
        
        label = ai_data.get("label", "Other")
        reason = ai_data.get("reason", "No reason provided")
        
        logger.info(f"Result: {label} | Reason: {reason}")

        # 3. التخزين في Google Sheets
        try:
            ws = get_sheet()
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # 👇👇👇 التعديل الجوهري: ملء الأعمدة D و E
            ws.append_row([
                timestamp,               # A
                url_link,                # B
                clean_text(text_to_analyze), # C
                author,                  # D (تم تفعيله)
                post_time,               # E (تم تفعيله)
                label,                   # F
                "extension",             # G
                reason                   # H
            ])
            logger.info("✅ Logged to Sheets")
        except Exception as sheet_error:
            logger.error(f"Sheets logging failed: {sheet_error}")

        return jsonify({
            "label": label,
            "reason": reason,
            "success": True
        }), 200

    except Exception as e:
        logger.error(f"Critical Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

def _build_cors_preflight_response():
    response = jsonify({"status": "cors_ok"})
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type")
    response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
    return response, 200

# --- الصفحة الرئيسية ---
@app.route("/", methods=["GET"])
def home():
    return "My AI Classifier V2 is Running! (Targeting: Extension Reports)", 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
