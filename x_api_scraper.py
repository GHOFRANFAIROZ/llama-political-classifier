import tweepy
import os
from dotenv import load_dotenv
import gspread
from oauth2client.service_account import ServiceAccountCredentials

load_dotenv()

# تحميل مفاتيح API لـ X من ملف .env
BEARER_TOKEN = os.getenv("BEARER_TOKEN")

# إعدادات Google Sheets
GOOGLE_SHEETS_SCOPE = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
GOOGLE_SHEETS_CREDENTIALS_FILE = "credentials.json" # الملف الذي أرسله المستخدم
GOOGLE_SHEET_NAME = "Anti-Hate Report" # اسم ملف Google Sheet
GOOGLE_SHEET_WORKSHEET_NAME = "Hashtag Tweets" # اسم الورقة داخل Google Sheet

def get_x_api_client():
    """تهيئة وإرجاع عميل Tweepy لـ X API v2."""
    if not BEARER_TOKEN:
        raise ValueError("BEARER_TOKEN غير موجود في ملف .env")
    
    client = tweepy.Client(BEARER_TOKEN, wait_on_rate_limit=True)
    return client

def get_google_sheet_client():
    """تهيئة وإرجاع عميل gspread لـ Google Sheets."""
    try:
        creds = ServiceAccountCredentials.from_json_keyfile_name(
            GOOGLE_SHEETS_CREDENTIALS_FILE, GOOGLE_SHEETS_SCOPE
        )
        client = gspread.authorize(creds)
        return client
    except Exception as e:
        raise Exception(f"خطأ في تهيئة عميل Google Sheets: {e}")

def write_to_google_sheet(data: list[dict]):
    """كتابة البيانات إلى ورقة Google Sheet المحددة."""
    if not data:
        print("لا توجد بيانات لكتابتها إلى Google Sheet.")
        return

    try:
        sheet_client = get_google_sheet_client()
        spreadsheet = sheet_client.open(GOOGLE_SHEET_NAME)
        worksheet = spreadsheet.worksheet(GOOGLE_SHEET_WORKSHEET_NAME)

        # الرؤوس المطلوبة من المستخدم
        required_headers = ["Tweet URL", "Text", "Author", "Timestamp", "Final URL"]

        # التأكد من أن الرؤوس موجودة في الصف الأول، وإضافتها إذا لم تكن موجودة
        current_headers = worksheet.row_values(1)
        if not current_headers or current_headers != required_headers:
            # إذا كانت الورقة فارغة أو الرؤوس غير مطابقة، نقوم بتحديثها
            worksheet.clear()
            worksheet.append_row(required_headers)

        # تحويل قائمة القواميس إلى قائمة قوائم لتناسب gspread
        rows_to_insert = []
        for item in data:
            row = [
                item.get("Tweet URL", ""),
                item.get("Text", ""),
                item.get("Author", ""),
                item.get("Timestamp", ""),
                item.get("Final URL", "")
            ]
            rows_to_insert.append(row)
        
        worksheet.append_rows(rows_to_insert)
        print(f"تمت كتابة {len(data)} صفوف إلى Google Sheet بنجاح.")
    except Exception as e:
        print(f"خطأ أثناء الكتابة إلى Google Sheet: {e}")

def search_tweets_by_hashtags(hashtags: list[str], max_results: int = 100):
    """البحث عن التغريدات الحديثة باستخدام الهاشتاجات المحددة.

    Args:
        hashtags (list[str]): قائمة بالهاشتاجات للبحث عنها (بدون #).
        max_results (int): الحد الأقصى لعدد التغريدات المراد جلبها (بحد أقصى 100 للوصول المجاني).

    Returns:
        list: قائمة بالتغريدات المستخرجة.
    """
    client = get_x_api_client()
    
    query = " OR ".join([f"#{tag}" for tag in hashtags])
    print(f"Searching for: {query}")
    
    try:
        response = client.search_recent_tweets(
            query,
            tweet_fields=["created_at", "author_id"],
            expansions=["author_id"],
            max_results=max_results
        )
        
        tweets_data = []
        if response.data:
            users = {user["id"]: user for user in response.includes["users"]}
            for tweet in response.data:
                author_username = users.get(tweet.author_id, {}).get("username", "Unknown")
                tweet_url = f"https://x.com/{author_username}/status/{tweet.id}"
                tweets_data.append({
                    "Tweet URL": tweet_url,
                    "Text": tweet.text,
                    "Author": author_username,
                    "Timestamp": tweet.created_at.isoformat(),
                    "Final URL": tweet_url # يمكن أن يكون هذا هو نفسه Tweet URL أو يتم تعديله لاحقًا
                })
        return tweets_data
    except tweepy.TweepyException as e:
        print(f"Error searching tweets: {e}")
        return []

if __name__ == "__main__":
    # طلب الهاشتاجات من المستخدم
    hashtags_input = input("أدخل الهاشتاجات التي تريد البحث عنها (افصل بينها بفاصلة): ")
    hashtags_list = [tag.strip() for tag in hashtags_input.split(",") if tag.strip()]

    if not hashtags_list:
        print("لم يتم إدخال أي هاشتاجات. يرجى المحاولة مرة أخرى.")
    else:
        print(f"جارٍ جلب التغريدات للهاشتاجات: {', '.join(hashtags_list)}")
        tweets = search_tweets_by_hashtags(hashtags_list, max_results=100) # جلب 100 تغريدة كحد أقصى
        
        if tweets:
            print(f"تم العثور على {len(tweets)} تغريدة. جارٍ الكتابة إلى Google Sheet...")
            write_to_google_sheet(tweets)
        else:
            print("لم يتم العثور على تغريدات أو حدث خطأ.")

