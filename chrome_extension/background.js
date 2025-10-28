// ===== 🧠 نظام Multi-Server Fallback (Render + Railway) =====
const SERVERS = [
  "https://my-ai-classifier.onrender.com/classify",  // 🌐 Render (الرئيسي)
  "https://antihatellamaproject-production.up.railway.app/classify" // 🛰️ Railway (الاحتياطي)
];

// دالة طلب مع مهلة زمنية (Timeout) - **تم التعديل هنا**
async function fetchWithTimeout(resource, options = {}, timeout = 30000) { // 🛑 تم زيادة المهلة إلى 30 ثانية
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// دالة عامة للتصنيف مع التبديل التلقائي بين السيرفرات - **تم التعديل هنا**
async function classifyWithFallback(textOrUrl) {
  for (const server of SERVERS) {
    try {
      console.log(`🌍 الاتصال بالسيرفر: ${server}`);
      const res = await fetchWithTimeout(server, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textOrUrl })
      }, 30000); // 🛑 تم تمرير المهلة الجديدة هنا أيضاً

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.label) return { success: true, label: data.label, server };
      if (data.error) throw new Error(data.error);
    } catch (err) {
      console.warn(`⚠️ السيرفر ${server} فشل (${err.message})`);
    }
  }
  return { success: false, label: "❌ جميع السيرفرات مشغولة أو غير متاحة" }; // 🛑 تم تحسين رسالة الخطأ
}

// ===== 🧩 تشغيل content.js تلقائياً على الصفحات المطلوبة =====
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

// ===== 📨 استقبال الرسائل من content.js أو popup =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // 📦 استقبال بيانات الحساب
  if (request.type === 'accountData') {
    console.log('📌 Received Account Data:', request.data);

    // تصحيح الاسم لو المنصة X
    if (
      request.data.platform === 'Twitter' &&
      (request.data.url.includes('x.com') || request.data.url.includes('twitter.com'))
    ) {
      request.data.platform = 'X (Twitter)';
    }

    saveAccountData(request.data);
  }

  // 🧠 استقبال منشور لتصنيفه (من content.js)
  if (request.type === 'postToClassify') {
    (async () => {
      const post = request.data;
      const inputText = post.url || post.text;
      const result = await classifyWithFallback(inputText);
      console.log("✅ Classification Result:", result.label);
      chrome.runtime.sendMessage({
        type: "classificationResult",
        label: result.label
      });
    })();
    return true;
  }

  // 🚀 استقبال رابط مباشر من الأيقونة العائمة (floating icon) أو النافذة المنبثقة
  if (request.type === "classifyUrl") {
    (async () => {
      const urlToClassify = request.url;
      console.log("🧠 Received URL for classification:", urlToClassify);

      const result = await classifyWithFallback(urlToClassify);
      console.log("✅ Classification (popup/icon):", result.label);

      // 🛑 إرسال نتيجة أكثر تفصيلاً للنافذة المنبثقة
      sendResponse({
        success: result.success,
        classification: result.label,
        server: result.server
      });
    })().catch(err => {
      console.error("❌ Error classifying URL:", err);
      sendResponse({ success: false, classification: "فشل التصنيف." });
    });

    return true; // لأننا نستخدم await (استجابة غير متزامنة)
  }
});

// ===== 💾 تخزين بيانات الحسابات محلياً =====
function saveAccountData(data) {
  chrome.storage.local.get({ accounts: [] }, (result) => {
    const accounts = result.accounts;
    accounts.push(data);
    chrome.storage.local.set({ accounts: accounts }, () => {
      console.log('✅ Account data saved locally.', data);
    });
  });
}
