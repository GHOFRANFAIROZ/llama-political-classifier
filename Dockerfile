# استخدام صورة بايثون الرسمية كأساس
FROM python:3.9-slim

# تعيين مجلد العمل
WORKDIR /app

# تثبيت الاعتماديات
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    gnupg \
    ca-certificates \
    libglib2.0-0 \
    libnss3 \
    libfontconfig1 \
    curl \
    --no-install-recommends

# --- تثبيت Google Chrome (آخر نسخة) ---
RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb \
    && dpkg -i /tmp/chrome.deb || apt-get install -fy \
    && rm /tmp/chrome.deb

# --- تثبيت ChromeDriver المتوافق تلقائيًا ---
RUN CHROME_VERSION=$(google-chrome --version | grep -oP '\d+' | head -1) \
    && echo "Detected Chrome version: $CHROME_VERSION" \
    && DRIVER_VERSION=$(curl -s "https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${CHROME_VERSION}") \
    && wget -O /tmp/chromedriver.zip "https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/${DRIVER_VERSION}/linux64/chromedriver-linux64.zip" \
    && unzip /tmp/chromedriver.zip -d /usr/bin/ \
    && mv /usr/bin/chromedriver-linux64/chromedriver /usr/bin/chromedriver \
    && chmod +x /usr/bin/chromedriver \
    && rm -rf /tmp/chromedriver.zip /usr/bin/chromedriver-linux64

# نسخ وتثبيت متطلبات بايثون
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# نسخ باقي المشروع
COPY . .

# تعيين متغير البيئة PORT
ENV PORT 8080

# تشغيل التطبيق
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "app:app"]
