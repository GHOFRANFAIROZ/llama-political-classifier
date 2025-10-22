from selenium_extractor import extract_tweet_data_with_selenium

tweet_url = "https://x.com/sama/status/1953563605733118317"  # جربي أي تغريدة
data = extract_tweet_data_with_selenium(tweet_url)
print(data)
