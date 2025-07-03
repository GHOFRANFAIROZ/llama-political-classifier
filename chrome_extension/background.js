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
