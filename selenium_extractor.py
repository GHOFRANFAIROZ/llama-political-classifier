from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

def extract_tweet_data_with_selenium(tweet_url):
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--no-sandbox")

    driver = webdriver.Chrome(options=options)

    try:
        driver.get(tweet_url)

        # انتظار النص
        tweet_text_element = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div[data-testid='tweetText']"))
        )
        tweet_text = tweet_text_element.text

        # انتظار اسم المستخدم (اختياري – إذا ما وُجد نرجع "")
        try:
            author_element = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div[data-testid='User-Name'] span"))
            )
            author = author_element.text
        except:
            author = ""

        # انتظار التاريخ
        try:
            time_element = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.TAG_NAME, "time"))
            )
            timestamp = time_element.get_attribute("datetime") if time_element else ""
        except:
            timestamp = ""

        return {
            "text": tweet_text,
            "author": author,
            "url": tweet_url,
            "timestamp": timestamp
        }

    except Exception as e:
        print(f"❌ Failed to extract tweet content: {e}")
        return {
            "text": "",
            "author": "",
            "url": tweet_url,
            "timestamp": "",
            "error": str(e)
        }

    finally:
        driver.quit()
