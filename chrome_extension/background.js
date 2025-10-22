// تنفيذ script في صفحات Twitter أو Facebook
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (
            tab.url.includes('twitter.com') ||
            tab.url.includes('x.com') ||
            tab.url.includes('facebook.com')
        ) {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
        }
    }
});

// استقبال الرسائل من content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'accountData') {
        console.log('📌 Received Account Data:', request.data);

        // تصحيح اسم المنصة لو لازم
        if (
            request.data.platform === 'Twitter' &&
            (request.data.url.includes('x.com') || request.data.url.includes('twitter.com'))
        ) {
            request.data.platform = 'X (Twitter)';
        }

        saveAccountData(request.data);
    }

    // معالجة بوست قادم من content.js (Twitter/Facebook)
    if (request.type === 'postToClassify') {
        const post = request.data;
        console.log('🧠 Classifying Post:', post);

        fetch("http://127.0.0.1:5000/classify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: post.url || post.text,
                author: post.author || "",
                post_time: post.post_time || "",
                url: post.url || ""
            })
        })
            .then(response => response.json())
            .then(result => {
                console.log("✅ Classification Result:", result.label || result.error);

                // إرسال النتيجة إلى popup.js إذا بدنا نعرضها
                chrome.runtime.sendMessage({
                    type: "classificationResult",
                    label: result.label || result.error
                });
            })
            .catch(error => {
                console.error("❌ Error classifying post:", error);
            });
    }

    // طلب مباشر من الأيقونة العائمة
    if (request.type === "classifyUrl") {
        const urlToClassify = request.url;
        console.log("🧠 Received URL for classification from floating icon:", urlToClassify);

        fetch("http://127.0.0.1:8080/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: urlToClassify, url: urlToClassify })
        })
            .then(response => response.json())
            .then(result => {
                console.log("✅ Classification Result for floating icon:", result.label || result.error);

                // حفظ النتيجة في Google Sheet
                fetch("http://127.0.0.1:5000/save_to_sheet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        text: urlToClassify,
                        url: urlToClassify,
                        author: "Floating Icon",
                        post_time: new Date().toISOString(),
                        classification: result.label,
                        platform: "Manual URL"
                    })
                }).then(() => {
                    console.log("📊 Result from floating icon saved to Google Sheet");
                }).catch(err => {
                    console.error("❌ Error saving floating icon result:", err);
                });

                sendResponse({ classification: result.label || result.error });
            })
            .catch(error => {
                console.error("❌ Error classifying URL from floating icon:", error);
                sendResponse({ classification: "فشل التصنيف." });
            });

        return true; // الاستجابة غير متزامنة
    }
});

// حفظ بيانات الحساب في التخزين المحلي
function saveAccountData(data) {
    chrome.storage.local.get({ accounts: [] }, (result) => {
        const accounts = result.accounts;
        accounts.push(data);
        chrome.storage.local.set({ accounts: accounts }, () => {
            console.log('✅ Account data saved locally.', data);
        });
    });
}
