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

# --- Flask setup ---
app = Flask(__name__)
CORS(app)

# --- Load environment variables ---
load_dotenv()

# --- Logging setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Groq API Client ---
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)
DEFAULT_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# --- Google Sheets setup ---
_sheet_cache = None
def get_sheet():
    global _sheet_cache
    if _sheet_cache:
        return _sheet_cache
    scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
    creds_dict = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=scope)
    sheet_client = gspread.authorize(creds)
    spreadsheet = sheet_client.open_by_key(os.getenv("SPREADSHEET_ID"))
    tab_name = os.getenv("SHEET_TAB_NAME")
    _sheet_cache = spreadsheet.worksheet(tab_name) if tab_name else spreadsheet.sheet1
    return _sheet_cache


# --- Prompt Builder ---
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

{text}
'''


# --- HEALTH CHECKS ---
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "path": "/health"}), 200

@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok", "path": "/healthz"}), 200


# --- CLASSIFY ENDPOINT ---
@app.route("/classify", methods=["POST"])
def classify():
    try:
        data = request.get_json(silent=True) or {}
        raw_input = (data.get("text") or "").strip()
        if not raw_input:
            return jsonify({"error": "Empty input"}), 400

        prompt = build_prompt(raw_input)
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}]
        )
        label = response.choices[0].message.content.strip()

        ws = get_sheet()
        ws.append_row([datetime.now().strftime("%Y-%m-%d %H:%M:%S"), raw_input, label, "extension"])

        return jsonify({"label": label}), 200
    except Exception as e:
        logger.error(f"Classification failed: {e}")
        return jsonify({"error": str(e)}), 500


# --- ROOT PAGE ---
@app.route("/", methods=["GET"])
def home():
    return """
    <h2>🚀 Flask server is running successfully!</h2>
    <p>Health check available at: <a href='/healthz'>/healthz</a></p>
    <p>Classification endpoint: <code>/classify</code></p>
    """, 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"✅ Running on port {port}")
    app.run(host="0.0.0.0", port=port)
