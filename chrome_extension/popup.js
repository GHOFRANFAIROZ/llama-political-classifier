document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn");
  const fillBtn = document.getElementById("fillBtn");
  const postUrl = document.getElementById("postUrl"); // textarea واحدة
  const result = document.getElementById("result");

  function setStatus(msg, ok = true) {
    result.textContent = msg;
    result.classList.remove("ok", "bad");
    result.classList.add(ok ? "ok" : "bad");
  }

  function detectSource(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes("x.com") || host.includes("twitter.com")) return "x";
      if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
      if (host.includes("instagram.com")) return "instagram";
      if (host.includes("tiktok.com")) return "tiktok";
      if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
      return "web";
    } catch {
      return "web";
    }
  }

  async function getCurrentTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || "";
  }

  fillBtn.addEventListener("click", async () => {
    try {
      const u = await getCurrentTabUrl();
      if (!u) return setStatus("ما قدرت أقرأ رابط الصفحة الحالية.", false);
      postUrl.value = u;
      setStatus("تم ✅");
    } catch (e) {
      setStatus(String(e?.message || e), false);
    }
  });

  btn.addEventListener("click", async () => {
    const value = (postUrl.value || "").trim();
    if (!value) {
      alert("الصقي رابط المنشور");
      return;
    }

    setStatus("⏳ ...");

    const payload = {
      mode: "popup",
      url: value,
      text: "", // popup الحالي هدفه روابط
      author: "Unknown",
      post_time: new Date().toISOString(),
      source: detectSource(value),
    };

    try {
      const resp = await chrome.runtime.sendMessage({ type: "classifyPost", payload });
      if (!resp?.ok) throw new Error(resp?.error || "Request failed");

      const label = resp.result?.label || "Other";
      setStatus(label, true);
    } catch (e) {
      console.error(e);
      setStatus("⚠️ فشل", false);
    }
  });
});
