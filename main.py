import gspread
from oauth2client.service_account import ServiceAccountCredentials
from tweet_utils import get_tweet_info
import re

def is_tweet_url(text):
    return re.match(r'https?://(www\.)?(twitter|x)\.com/.+/status/\d+', text.strip()) is not None

scope = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]

creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", scope)
client = gspread.authorize(creds)

sheet = client.open_by_url(
    "https://docs.google.com/spreadsheets/d/1eZs0_OgBT2ynxPwFzKMhpT5bMBwaBUYxJc4JhsiznDY/edit"
).sheet1

rows = sheet.get_all_records()
print(f"Number of reports: {len(rows)}")

for row in rows:
    post_input = row.get("Post or Account Link") or ""  
    if is_tweet_url(post_input):
        print("🔗 Twitter link detected!")
        tweet_data = get_tweet_info(post_input)

        if tweet_data["error"]:
            print(f"⚠️ Error extracting tweet: {tweet_data['error']}")
            continue
        text_to_classify = tweet_data["text"]
        print(f"Tweet by @{tweet_data['username']} on {tweet_data['created_at']}:")
        print(text_to_classify)
    else:
        print("📝 Plain text detected.")
        text_to_classify = post_input
