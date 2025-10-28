// 🌍 قائمة السيرفرات (Render + Railway)
const SERVERS = [
  "https://my-ai-classifier.onrender.com/classify",              // السيرفر الرئيسي (Render)
  "https://antihatellamaproject-production.up.railway.app/classify" // السيرفر الاحتياطي (Railway)
];

// ⚙️ دالة تصنيف ذكية مع Fallback تلقائي
async function classifyWithFallback(postUrl) {
  for (const server of SERVERS) {
    try {
      console.log(`🔗 المحاولة مع السيرفر: ${server}`);
      const response = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: postUrl })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.label) {
        console.log(`✅ التصنيف من ${server}: ${data.label}`);
        return { label: data.label, server };
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err) {
      console.warn(`⚠️ السيرفر ${server} فشل (${err.message})`);
    }
  }
  throw new Error("❌ جميع السيرفرات غير متاحة حالياً.");
}

// 🪟 التحكم في النافذة العائمة
document.getElementById("floating-icon").addEventListener("click", function () {
  document.getElementById("popup").style.display = "block";
});

document.getElementById("close-popup").addEventListener("click", function () {
  document.getElementById("popup").style.display = "none";
});

// 🚀 دالة الإرسال والتصنيف
async function sendTweetUrl() {
  const tweetUrl = document.getElementById("tweet-url").value.trim();
  const resultDiv = document.getElementById("result");

  if (!tweetUrl) {
    alert("من فضلك أدخل رابط المنشور");
    return;
  }

  resultDiv.textContent = "⏳ جارٍ التصنيف...";
  resultDiv.style.color = "black";

  try {
    const result = await classifyWithFallback(tweetUrl);
    resultDiv.textContent = `✅ التصنيف: ${result.label}`;
    resultDiv.style.color = "green";
    console.log(`📦 من السيرفر: ${result.server}`);
  } catch (error) {
    console.error("❌ فشل التصنيف:", error);
    resultDiv.textContent = "⚠️ جميع السيرفرات مشغولة أو غير متاحة.";
    resultDiv.style.color = "red";
  }
}
