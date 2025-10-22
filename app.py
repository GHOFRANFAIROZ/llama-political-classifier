from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
import os
import gspread
import json
from datetime import datetime
from google.oauth2 import service_account
from extract_utils import extract_text_from_tweet_url
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import logging
from flask_cors import CORS 

app = Flask(__name__)
CORS(app)

# --- Load environment variables ---
load_dotenv()
print("✅ Loaded URL:", os.getenv("GOOGLE_SHEET_URL"))

# --- Logging ---
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
    if _sheet_cache: return _sheet_cache

    try:
        scope = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        creds_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS")
        creds_dict = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=scope)
        sheet_client = gspread.authorize(creds)
        spreadsheet = sheet_client.open_by_key(os.getenv("SPREADSHEET_ID"))
        tab_name = os.getenv("SHEET_TAB_NAME")
        _sheet_cache = spreadsheet.worksheet(tab_name) if tab_name else spreadsheet.sheet1
        return _sheet_cache
    except Exception as e:
        logger.error(f"Google Sheets init failed: {e}")
        raise

def append_row_safe(ws, row_values, retries=2, sleep_seconds=1.0):
    import time
    for attempt in range(retries + 1):
        try:
            ws.append_row(row_values, value_input_option="USER_ENTERED")
            return True
        except Exception as e:
            logger.warning(f"Append row attempt {attempt+1} failed: {e}")
            if attempt < retries:
                time.sleep(sleep_seconds)
            else:
                raise

# --- Selenium Extraction ---
def extract_text_from_tweet_url(tweet_url):
    logger.info(f"Starting Selenium to extract URL: {tweet_url}")
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--ignore-certificate-errors")
    chrome_options.add_argument("--ignore-ssl-errors")
    chrome_options.add_argument("--window-size=1920,1080")

    try:
        driver = webdriver.Chrome(ChromeDriverManager().install(), options=chrome_options)
        driver.set_page_load_timeout(15)
        driver.get(tweet_url)

        tweet_text_element = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div[data-testid='tweetText']"))
        )
        tweet_text = tweet_text_element.text

        author = ""
        try:
            author_element = driver.find_element(By.CSS_SELECTOR, "div[data-testid='User-Name'] span")
            author = author_element.text
        except:
            pass

        timestamp = ""
        try:
            time_element = driver.find_element(By.TAG_NAME, "time")
            timestamp = time_element.get_attribute("datetime")
        except:
            pass

        driver.quit()
        return {"text": tweet_text, "author": author, "timestamp": timestamp, "url": tweet_url}

    except Exception as e:
        logger.error(f"Selenium failed: {e}")
        try: driver.quit()
        except: pass
        return {"text": "", "error": str(e), "url": tweet_url}

# --- Build prompt function ---
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
'''

# --- Health check ---
@app.route("/healthz", methods=["GET"])
def healthz():
    return jsonify({"status": "ok"}), 200

# --- API endpoint ---
@app.route("/classify", methods=["POST"])
def classify():
    data = request.get_json(silent=True) or {}
    raw_input = (data.get("text") or "").strip()
    if not raw_input: return jsonify({"error": "Empty input"}), 400

    try:
        is_tweet_url = raw_input.startswith("https://x.com/") or raw_input.startswith("https://twitter.com/")
        if is_tweet_url:
            extracted = extract_text_from_tweet_url(raw_input)
            text = extracted.get("text","")
            if not text: return jsonify({"error": f"Failed to extract text from URL: {extracted.get('error','Unknown error')}"}), 500
            author, post_time, url = extracted.get("author","Unknown"), extracted.get("timestamp",""), extracted.get("url",raw_input)
        else:
            text, author, post_time, url = raw_input, "", "", "manual"

        prompt = build_prompt(text)
        model_name = DEFAULT_MODEL  # استخدمنا default model
        response = client.chat.completions.create(model=model_name, messages=[{"role":"user","content":prompt}])
        label = response.choices[0].message.content.strip()

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ws = get_sheet()
        append_row_safe(ws, [now, url, text, author, post_time, label, "extension"])

        return jsonify({"label": label})

    except Exception as e:
        logger.error(f"Error in /classify endpoint: {e}")
        return jsonify({"error": str(e)}), 500

# --- الصفحة الرئيسية ---
@app.route("/")
def home():
    return "<h2>🚀 تم تشغيل السيرفر بنجاح!</h2><p>نقطة النهاية للتصنيف متاحة على: <code>/classify</code></p>"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
