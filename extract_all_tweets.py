from extract_utils import extract_text_from_tweet_url
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import time
from config import GOOGLE_SHEET_URL, DAILY_TWEETS_LIMIT, SHEET_NAME

# إعداد الاتصال مع Google Sheets
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = ServiceAccountCredentials.from_json_keyfile_name("client_secrets.json", scope)
client = gspread.authorize(creds)

# فتح Google Sheet وورقة العمل المستهدفة
sheet = client.open_by_url(GOOGLE_SHEET_URL).worksheet(SHEET_NAME)

def collect_tweets_by_hashtag():
    # أخذ الهاشتاج من المستخدم
    hashtag = input("أدخل الهاشتاج الذي تريد جمع التغريدات له (بدون #): ").strip()
    count = int(input("كم تغريدة تريد جمعها؟: ").strip())

    # قراءة جميع الروابط من العمود الأول في الورقة
    tweet_urls = sheet.col_values(1)[1:]  # استثناء العنوان
    tweet_urls = tweet_urls[:DAILY_TWEETS_LIMIT]  # تطبيق الحد اليومي

    print(f"ℹ️ جمع التغريدات لهاشتاج: #{hashtag}")
    
    for i, tweet_url in enumerate(tweet_urls, start=2):
        if not tweet_url:
            continue

        print(f"[{i}] ✅ Processing: {tweet_url}")
        data = extract_text_from_tweet_url(tweet_url)

        # تأكد من أنه إذا كانت البيانات موجودة، يتم تخزينها في الأعمدة الصحيحة
        if data:
            sheet.update_cell(i, 2, data.get("text", ""))
            sheet.update_cell(i, 3, data.get("author", ""))
            sheet.update_cell(i, 4, data.get("timestamp", ""))
            sheet.update_cell(i, 5, data.get("url", tweet_url))
        else:
            # في حالة عدم وجود بيانات، يمكنك إضافة رسالة أو ترك الأعمدة فارغة
            print(f"⚠️ Failed to extract data for: {tweet_url}")
            sheet.update_cell(i, 2, "Error")
            sheet.update_cell(i, 3, "Error")
            sheet.update_cell(i, 4, "Error")
            sheet.update_cell(i, 5, tweet_url)

        # مهلة صغيرة بين كل طلب وآخر لضمان عمل النظام بشكل مستقر
        time.sleep(3)  # مهلة بين الطلبات

    print("✅ تم استخراج جميع التغريدات.")

if __name__ == "__main__":
    collect_tweets_by_hashtag()
