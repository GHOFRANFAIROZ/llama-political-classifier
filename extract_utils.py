import requests
from bs4 import BeautifulSoup
import re
from selenium_extractor import extract_tweet_data_with_selenium
import json

# قائمة سيرفرات Nitter
NITTER_INSTANCES = [
    "https://nitter.privacydev.net",
    "https://nitter.moomoo.me",
    "https://nitter.net",
    "https://nitter.1d4.us",
    "https://nitter.poast.org"
]

FAILED_TWEETS_FILE = "failed_tweets.json"

def save_failed_tweet(tweet_url):
    """احفظ التغريدات الفاشلة في ملف JSON"""
    try:
        with open(FAILED_TWEETS_FILE, "r") as f:
            failed = json.load(f)
    except:
        failed = []

    if tweet_url not in failed:
        failed.append(tweet_url)
        with open(FAILED_TWEETS_FILE, "w") as f:
            json.dump(failed, f, indent=2)

def extract_text_from_tweet_url(original_url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }

    # استخراج اسم المستخدم و ID التغريدة من رابط تويتر
    match = re.search(r"(?:twitter\.com|x\.com)/([^/]+)/status/(\d+)", original_url)
    if not match:
        save_failed_tweet(original_url)
        return {
            "text": "",
            "author": "",
            "url": original_url,
            "timestamp": "",
            "error": "Invalid Twitter URL format"
        }

    username, tweet_id = match.group(1), match.group(2)

    # محاولة Nitter أولاً
    for instance in NITTER_INSTANCES:
        try:
            nitter_url = f"{instance}/{username}/status/{tweet_id}"
            response = requests.get(nitter_url, headers=headers, timeout=10)

            if response.status_code != 200:
                continue

            soup = BeautifulSoup(response.text, 'html.parser')

            tweet_element = soup.find("div", class_="tweet-content media-body")
            tweet_text = tweet_element.get_text(strip=True) if tweet_element else ""

            author_element = soup.find("a", class_="fullname")
            author = author_element.get_text(strip=True) if author_element else username

            date_element = soup.find("span", class_="tweet-date")
            timestamp = date_element.find("a")["title"] if date_element and date_element.find("a") else ""

            if tweet_text:
                return {
                    "text": tweet_text,
                    "author": author,
                    "url": original_url,
                    "timestamp": timestamp
                }

        except Exception:
            continue

    # إذا كل المحاولات فشلت، جرب باستخدام Selenium
    print("⚠️ Nitter failed. Trying Selenium fallback...")
    selenium_result = extract_tweet_data_with_selenium(original_url)

    # تحقق من نتيجة Selenium
    if not selenium_result.get("text"):
        return {
            "text": "",
            "author": selenium_result.get("author", ""),
            "url": original_url,
            "timestamp": selenium_result.get("timestamp", ""),
            "error": "empty or private tweet"
        }

    return selenium_result
