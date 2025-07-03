from flask import Flask, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
import os
import gspread
from datetime import datetime
from oauth2client.service_account import ServiceAccountCredentials
from extract_utils import extract_text_from_tweet_url

app = Flask(__name__)
load_dotenv()
print("✅ Loaded URL:", os.getenv("GOOGLE_SHEET_URL"))

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = ServiceAccountCredentials.from_json_keyfile_name("client_secrets.json", scope)
sheet_client = gspread.authorize(creds)
spreadsheet = sheet_client.open_by_url(os.getenv("GOOGLE_SHEET_URL"))
sheet = spreadsheet.worksheet("Extension Reports")  # اسم الشيت

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

- "Christians need international protection and a separate administration. The Sunni Islamists burned churches."  
→ Classification: Sectarian Incitement (also includes unverified claims)

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

- "N reports confirm that the new regime has started killing peaceful protesters again."  
→ Classification: Spreading False Information

- "The new rulers are just as brutal as the old ones – only with better PR."  
→ Classification: Spreading False Information

- "The current leadership is no different from Assad – same oppression, different names."  
→ Classification: Spreading False Information

- "The government conceals the files of detainees."  
→ Classification: Spreading False Information (accusation without specifying who or providing evidence)

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

- "The Alawite elite who backed the regime shouldn’t have a seat today. We need a Sunni-led restructuring."  
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

- "If justice doesn’t come through the courts, maybe people will take matters into their own hands."  
→ Classification: Neutral

- "The agents of destruction walk among us... Action is the only answer."  
→ Classification: Neutral (strong tone, but no direct or implied violence)

---

🟣 Other:  
Use when:
- The post is unrelated to politics/violence.
- Or too vague to classify with confidence.

---

📌 Now, classify the following post:
"""
{text}
"""

Return only one of the following labels exactly:
- Call for Violence
- Sectarian Incitement
- Spreading False Information
- Politically Charged but Not Harmful
- Neutral
- Other
'''


@app.route("/classify", methods=["POST"])
def classify():
    data = request.get_json()
    raw_input = data.get("text", "").strip()
    author = data.get("author", "")
    post_time = data.get("post_time", "")
    url = data.get("url", "manual")

    if not raw_input:
        return jsonify({"error": "Empty input"}), 400

    is_twitter_url = raw_input.startswith("https://twitter.com/") or raw_input.startswith("https://x.com/")

    # إذا دخل مباشر بدون رابط، نستخدم النص كما هو
    if not is_twitter_url:
        text = raw_input
    else:
        extracted = extract_text_from_tweet_url(raw_input)
        text = extracted.get("text", "")
        author = extracted.get("author", author)
        url = extracted.get("url", raw_input)
        post_time = extracted.get("timestamp", post_time)
        if not text:
            print("❌ Failed to extract tweet content:", extracted.get("error", "Unknown error"))

    if not text:
        return jsonify({"error": "Could not extract text from the input"}), 400

    prompt = build_prompt(text)

    try:
        response = client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "user", "content": prompt}]
        )
        label = response.choices[0].message.content.strip()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        sheet.append_row([
            now,
            url,
            text,
            author,
            post_time,
            label,
            "extension"
        ])

        return jsonify({"label": label})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
