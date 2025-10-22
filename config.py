# config.py
# ========================================
# هذا الملف يجمع كل المفاتيح والإعدادات المهمة للمشروع
# ========================================

from dotenv import load_dotenv
import os

# تحميل القيم من ملف البيئة .env
load_dotenv()

# X API Keys
API_KEY = os.getenv("API_KEY")
API_KEY_SECRET = os.getenv("API_KEY_SECRET")

# GROQ / أي مفاتيح أخرى
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# رابط Google Sheet
GOOGLE_SHEET_URL = os.getenv("GOOGLE_SHEET_URL")

# إعدادات إضافية
DAILY_TWEETS_LIMIT = int(os.getenv("DAILY_TWEETS_LIMIT", 50))
SHEET_NAME = os.getenv("SHEET_NAME", "Hashtag Tweets")

# قائمة سيرفرات Nitter
NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.moomoo.me",
    "https://nitter.net",
    "https://nitter.1d4.us",
    "https://nitter.poast.org"
]
