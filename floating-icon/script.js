const servers = [
  "https://my-ai-classifier.onrender.com/classify",              // Render (الرئيسي)
  "https://antihatellamaproject-production.up.railway.app/classify" // Railway (الاحتياطي)
];
// 🧠 دالة التصنيف مع خاصية Failover
async function classifyPost(postUrl) {
    for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
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
    throw new Error("جميع السيرفرات غير متاحة حالياً.");
}
// 🎛️ التحكم في النافذة العائمة
document.getElementById("floating-icon").addEventListener("click", function () {
    document.getElementById("popup").style.display = "block";
});

document.getElementById("close-popup").addEventListener("click", function () {
    document.getElementById("popup").style.display = "none";
});

// 🚀 دالة الإرسال الفعلية
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
        const result = await classifyPost(tweetUrl);
        resultDiv.textContent = `✅ التصنيف: ${result.label}`;
        resultDiv.style.color = "green";
        console.log(`📦 من السيرفر: ${result.server}`);
    } catch (error) {
        console.error("❌ فشل التصنيف:", error);
        resultDiv.textContent = "⚠️ جميع السيرفرات مشغولة أو غير متاحة.";
        resultDiv.style.color = "red";
    }
}