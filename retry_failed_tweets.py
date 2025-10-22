# retry_failed_tweets.py
# ========================================
# هذا السكريبت يعيد محاولة معالجة التغريدات الفاشلة المسجلة في failed_tweets.json
# ========================================

import json
import time
from extract_utils import extract_text_from_tweet_url
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# إعداد الاتصال مع Google Sheets
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = ServiceAccountCredentials.from_json_keyfile_name("client_secrets.json", scope)
client = gspread.authorize(creds)

# افتح Google Sheet وورقة العمل المستهدفة
sheet = client.open("Anti-Hate Report").worksheet("Hashtag Tweets")  # عدّل إذا غيرت اسم الورقة

FAILED_FILE = "failed_tweets.json"

def load_failed_tweets():
    try:
        with open(FAILED_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_failed_tweets(failed_list):
    with open(FAILED_FILE, "w", encoding="utf-8") as f:
        json.dump(failed_list, f, ensure_ascii=False, indent=2)

def retry_failed_tweets():
    failed_tweets = load_failed_tweets()
    if not failed_tweets:
        print("✅ لا توجد تغريدات فاشلة لإعادة المحاولة.")
        return

    still_failed = []

    for item in failed_tweets:
        row = item["row"]
        url = item["url"]

        print(f"[{row}] 🔄 إعادة محاولة: {url}")
        data = extract_text_from_tweet_url(url)

        if data.get("text"):
            # خزّن النتائج في الأعمدة B, C, D, E
            sheet.update_cell(row, 2, data.get("text", ""))
            sheet.update_cell(row, 3, data.get("author", ""))
            sheet.update_cell(row, 4, data.get("timestamp", ""))
            sheet.update_cell(row, 5, data.get("url", url))
            print(f"[{row}] ✅ نجحت إعادة المحاولة.")
        else:
            still_failed.append(item)
            print(f"[{row}] ⚠️ ما زالت فاشلة: {data.get('error', 'Unknown error')}")

        time.sleep(3)  # مهلة صغيرة لسلامة الاتصال

    save_failed_tweets(still_failed)
    print("✅ انتهت إعادة المحاولات. التغريدات الفاشلة المتبقية:", len(still_failed))

if __name__ == "__main__":
    retry_failed_tweets()
