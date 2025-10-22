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

        chrome.runtime.sendMessage({ type: "postToClassify", data: postToClassify });
        console.log("🚀 Sent tweet content for classification:", postToClassify);
    }

    // Facebook
    if (isFacebook && window.location.href.includes("/posts/")) {
        const fbPost = getFacebookPostContent();
        chrome.runtime.sendMessage({ type: "postToClassify", data: fbPost });
        console.log("🚀 Sent Facebook post content for classification:", fbPost);
    }
}, 3000);

// --- Listener لطلبات مباشرة من background.js ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "extractTweetData") {
        const tweetText = getTweetContent();
        const accountData = getTwitterAccountData();
        const postTime = document.querySelector("time")?.getAttribute("datetime") || new Date().toISOString();

        sendResponse({
            text: tweetText,
            author: accountData.username || "Unknown",
            post_time: postTime
        });
        return true;
    }
});

// --- أيقونة التبليغ العائمة + النافذة المنبثقة --- //
const style = document.createElement("style");
style.innerHTML = `
@keyframes pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(155, 89, 182, 0.6); }
  70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(155, 89, 182, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(155, 89, 182, 0); }
}

.floating-icon {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad, #6c3483);
  color: white;
  padding: 12px 18px;
  border-radius: 30px;
  cursor: pointer;
  box-shadow: 0 6px 12px rgba(0,0,0,0.25);
  z-index: 9999;
  font-family: "Tahoma","Arial",sans-serif;
  font-size: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  animation: pulse 2s infinite;
  transition: all 0.3s ease-in-out;
}
.floating-icon:hover {
  transform: scale(1.12) translateY(-3px);
  background: linear-gradient(135deg, #a569bd, #884ea0, #633974);
}
.floating-icon:active { transform: scale(0.95); }
.floating-icon .icon { margin-right: 8px; font-size: 18px; }

.popup {
  display: none;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.3);
  z-index: 10000;
  width: 320px;
  text-align: center;
}
#classify-button {
  background: linear-gradient(135deg,#28a745,#218838);
  color:white;
  font-size:15px;
  font-weight:bold;
  padding:10px 18px;
  border:none;
  border-radius:8px;
  cursor:pointer;
  transition:all 0.3s ease-in-out;
  width:100%;
  margin-top:10px;
}
#classify-button:hover {
  background: linear-gradient(135deg,#34d058,#2c974b);
  transform: scale(1.05);
  box-shadow:0 4px 10px rgba(40,167,69,0.4);
}
#classification-result {
  color:black;
  background-color:#f9f9f9;
  padding:8px;
  border-radius:4px;
  margin-top:10px;
  font-size:14px;
  text-align:left;
  white-space:pre-wrap;
}`;
document.head.appendChild(style);

const floatingIconHtml = `
  <div class="floating-icon" id="floating-icon">
    <span class="icon">🚨</span>
    <span>انقر للتبليغ</span>
  </div>
  <div class="popup" id="popup">
    <div class="popup-content">
      <span class="close" id="close-popup">&times;</span>
      <h3>أدخل رابط المنشور</h3>
      <input type="text" id="post-url" placeholder="أدخل رابط المنشور هنا" />
      <button id="classify-button">تصنيف</button>
      <p id="classification-result"></p>
    </div>
  </div>`;
document.body.insertAdjacentHTML("beforeend", floatingIconHtml);

// ✅ منطق الأيقونة
document.getElementById("floating-icon").addEventListener("click", () => {
  document.getElementById("popup").style.display = "block";
  document.getElementById("post-url").value = "";
  document.getElementById("classification-result").innerText = "";
});
document.getElementById("close-popup").addEventListener("click", () => {
  document.getElementById("popup").style.display = "none";
});
document.getElementById("classify-button").addEventListener("click", () => {
  var postUrl = document.getElementById("post-url").value;
  var resultElement = document.getElementById("classification-result");

  if (postUrl) {
    resultElement.innerText = "⏳ جارٍ التصنيف...";
    chrome.runtime.sendMessage({ type: "classifyUrl", url: postUrl }, function (response) {
      if (response && response.classification) {
        resultElement.innerText = `✅ التصنيف: ${response.classification}`;
      } else {
        resultElement.innerText = "❌ فشل التصنيف.";
      }
    });
  } else {
    alert("من فضلك أدخل رابط المنشور");
  }
});
