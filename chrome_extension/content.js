// 🧠 قائمة السيرفرات (Render + Railway)
const SERVERS = [
  "https://my-ai-classifier.onrender.com/classify",              // السيرفر الرئيسي
  "https://antihatellamaproject-production.up.railway.app/classify" // السيرفر الاحتياطي
];

// ⚙️ دالة تصنيف ذكية مع Fallback تلقائي
async function classifyWithFallback(postData) {
  for (const server of SERVERS) {
    try {
      console.log(`🔗 المحاولة مع السيرفر: ${server}`);
      const response = await fetch(server, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: postData.text || postData.url })
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

/* ------------------ باقي الكود الأصلي دون تعديل ------------------ */

function getTwitterAccountData() {
  const username = document.querySelector("div[data-testid=\"UserName\"] span")?.innerText;
  const followers = document.querySelector("a[href$=\"/followers\"] span")?.innerText;
  const verified = !!document.querySelector("svg[aria-label=\"Verified account\"]");
  const creationDate = "Not Available";

  return {
    platform: "X (Twitter)",
    username,
    followers,
    verified,
    creationDate,
    url: window.location.href
  };
}

// ✅ Facebook: معلومات الحساب
function getFacebookAccountData() {
  const username = document.querySelector("h1")?.innerText;
  const followers = document.querySelector("div[data-pagelet=\"ProfileFollowers\"] span")?.innerText;
  const verified = !!document.querySelector("svg[aria-label=\"Verified\"]");
  const creationDate = "Not Available";

  return {
    platform: "Facebook",
    username,
    followers,
    verified,
    creationDate,
    url: window.location.href
  };
}

// ✅ Twitter: النص
function getTweetContent() {
  const article = document.querySelector("article");
  if (!article) return "";
  const langDivs = article.querySelectorAll("div[lang]");
  if (!langDivs || langDivs.length === 0) return "";
  return Array.from(langDivs).map(div => div.innerText.trim()).filter(t => t.length > 0).join(" ");
}

// ✅ Facebook: النص + الكاتب + الوقت
function getFacebookPostContent() {
  let postText = "";
  let author = "";
  let postTime = "";

  const postDiv = document.querySelector("div[data-ad-preview='message'], div[dir='auto']");
  if (postDiv) postText = postDiv.innerText.trim();

  const authorElement = document.querySelector("h2 strong span, h3 strong span, div[role='link'] span");
  if (authorElement) author = authorElement.innerText.trim();

  const timeElement = document.querySelector("abbr, span[aria-hidden='true'] time");
  if (timeElement) postTime = timeElement.getAttribute("title") || timeElement.innerText;

  return {
    text: postText,
    author: author,
    post_time: postTime || new Date().toISOString(),
    url: window.location.href,
    platform: "Facebook"
  };
}

// --- إرسال البيانات ---
setTimeout(() => {
  const isTwitter = window.location.href.includes("twitter.com") || window.location.href.includes("x.com");
  const isFacebook = window.location.href.includes("facebook.com");

  // Twitter/X
  if (isTwitter && window.location.href.includes("/status/")) {
    const tweetText = getTweetContent();
    const accountData = getTwitterAccountData();
    const postTime = document.querySelector("time")?.getAttribute("datetime") || new Date().toISOString();

    const postToClassify = {
      text: tweetText,
      url: window.location.href,
      author: accountData.username,
      post_time: postTime,
      platform: "X (Twitter)"
    };

    classifyWithFallback(postToClassify).then(result => {
      console.log("✅ تصنيف تلقائي:", result.label, "من:", result.server);
    }).catch(err => {
      console.error("❌ فشل التصنيف:", err);
    });
  }

  // Facebook
  if (isFacebook && window.location.href.includes("/posts/")) {
    const fbPost = getFacebookPostContent();

    classifyWithFallback(fbPost).then(result => {
      console.log("✅ تصنيف تلقائي:", result.label, "من:", result.server);
    }).catch(err => {
      console.error("❌ فشل التصنيف:", err);
    });
  }
}, 3000);
