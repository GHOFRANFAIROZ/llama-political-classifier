from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import logging

# تهيئة logging لتتبع أي أخطاء
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_tweet_data_with_selenium(tweet_url):
    """
    استخرج نص التغريدة، اسم المؤلف، ووقت النشر باستخدام Selenium
    """
    # إعداد Chrome بدون واجهة (headless) ومتوافق مع السيرفر السحابي
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # بدون واجهة
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--ignore-certificate-errors")
    chrome_options.add_argument("--ignore-ssl-errors")
    chrome_options.add_argument("--log-level=3")

    # تحميل ChromeDriver تلقائيًا لأي نسخة Chrome
    driver = webdriver.Chrome(ChromeDriverManager().install(), options=chrome_options)

    data = {
        "text": "",
        "author": "",
        "timestamp": "",
        "url": tweet_url
    }

    try:
        driver.get(tweet_url)

        # الانتظار الذكي لتحميل نص التغريدة
        try:
            tweet_text_element = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, '//div[@data-testid="tweetText"]'))
            )
            data["text"] = tweet_text_element.text
        except Exception:
            data["text"] = ""

        # استخراج اسم المؤلف
        try:
            author_element = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, '//div[@data-testid="User-Names"]//span'))
            )
            data["author"] = author_element.text
        except Exception:
            data["author"] = ""

        # استخراج وقت النشر
        try:
            timestamp_element = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "time"))
            )
            data["timestamp"] = timestamp_element.get_attribute("datetime")
        except Exception:
            data["timestamp"] = ""

    except Exception as e:
        logger.warning(f"⚠️ Error with Selenium on URL {tweet_url}: {e}")

    finally:
        driver.quit()

    return data
