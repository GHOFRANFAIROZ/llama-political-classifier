import requests
from bs4 import BeautifulSoup
import re

def get_tweet_info(tweet_url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        # 🔁 إصلاح رابط تويتر لو كان من نوع /i/web/status/
        match = re.search(r"status/(\d+)", tweet_url)
        if match:
            tweet_id = match.group(1)
            tweet_url = f"https://twitter.com/anyuser/status/{tweet_id}"

        response = requests.get(tweet_url, headers=headers)
        if response.status_code != 200:
            return {"error": f"HTTP Error {response.status_code}"}

        soup = BeautifulSoup(response.text, 'html.parser')
        text_elements = soup.find_all("meta", attrs={"property": "og:description"})
        if not text_elements:
            return {"error": "Could not find tweet text"}

        tweet_text = text_elements[0].get("content", "").strip()

        return {
            "content": tweet_text,
            "username": "Unknown",
            "displayname": "Unknown",
            "followers": "Unknown",
            "verified": False,
            "tweet_date": "Unknown"
        }

    except Exception as e:
        return {"error": f"Could not fetch tweet: {str(e)}"}