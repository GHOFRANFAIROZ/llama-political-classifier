/* ------------------------ Save Record (via Backend) ------------------------ */
async function saveToFirestore(record) {
  chrome.runtime.sendMessage({
    type: "saveRecord",
    data: record
  });
}
/* --------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn");
  const fillBtn = document.getElementById("fillBtn");
  const postUrl = document.getElementById("postUrl");
  const result = document.getElementById("result");

  const lowConfNote = document.getElementById("lowConfNote");
  const contextWrap = document.getElementById("contextWrap");
  const contextText = document.getElementById("contextText");
  const reclassifyBtn = document.getElementById("reclassifyBtn");

  const CONF_THRESHOLD = 0.65;
  let lastPayload = null;

  function setStatus(msg, ok = true) {
    result.textContent = msg;
    result.classList.remove("ok", "bad");
    result.classList.add(ok ? "ok" : "bad");
  }

  function hideContextUI() {
    lowConfNote.style.display = "none";
    contextWrap.style.display = "none";
  }

  function showContextUI() {
    lowConfNote.textContent =
      "تم تصنيف المنشور، لكن النتيجة غير مؤكدة. إذا وُجد سياق إضافي، يُفضَّل إضافته.";
    lowConfNote.style.display = "block";
    contextWrap.style.display = "block";
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

  async function sendClassify(payload) {
    const resp = await chrome.runtime.sendMessage({ type: "classifyPost", payload });
    if (!resp?.ok) throw new Error(resp?.error || "Request failed");
    return resp.result;
  }

  function renderResult(res) {
    const labelAr = res?.label_ar || res?.label || "غير مُصنَّف";
    const reasonAr = res?.reason_ar || res?.reason || "";
    const conf = Number(res?.confidence_score);
    const confSafe = Number.isFinite(conf) ? conf : null;

    let displayText = `✅ تم تصنيف المنشور — الفئة: ${labelAr}`;
    if (reasonAr) displayText += ` — السبب: ${reasonAr}`;
    setStatus(displayText, true);

    if (confSafe !== null && confSafe < CONF_THRESHOLD) {
      showContextUI();
    } else {
      hideContextUI();
    }

    // ✨ Save to Firestore (via backend)
    saveToFirestore({
      url: lastPayload?.url,
      source: lastPayload?.source,
      raw_text: lastPayload?.text || "",
      context: lastPayload?.context || "",
      result_label: labelAr,
      result_reason: reasonAr,
      confidence: confSafe
    });
  }

  fillBtn.addEventListener("click", async () => {
    try {
      const u = await getCurrentTabUrl();
      if (!u) {
        setStatus("تعذّر الحصول على رابط الصفحة الحالية.", false);
        return;
      }
      postUrl.value = u;
      hideContextUI();
      setStatus("✅ تم جلب رابط الصفحة الحالية", true);
    } catch (e) {
      setStatus(String(e?.message || e), false);
    }
  });

  btn.addEventListener("click", async () => {
    const value = (postUrl.value || "").trim();
    if (!value) {
      alert("يرجى لصق رابط المنشور أولاً.");
      return;
    }

    hideContextUI();
    setStatus("⏳ جاري تصنيف المنشور ...", true);

    const payload = {
      mode: "popup",
      url: value,
      text: "",
      author: "Unknown",
      post_time: new Date().toISOString(),
      source: detectSource(value)
    };

    lastPayload = payload;

    try {
      const res = await sendClassify(payload);
      renderResult(res);
    } catch (e) {
      console.error(e);
      setStatus("⚠️ حدث خطأ أثناء التصنيف.", false);
    }
  });

  reclassifyBtn.addEventListener("click", async () => {
    if (!lastPayload) {
      setStatus("لا يوجد طلب سابق لإعادة التصنيف.", false);
      return;
    }

    const ctx = (contextText.value || "").trim();
    if (!ctx) {
      alert("يرجى إضافة سياق.");
      return;
    }

    setStatus("⏳ جاري إعادة التصنيف ...", true);

    const payload2 = { ...lastPayload, context: ctx };
    lastPayload = payload2;

    try {
      const res2 = await sendClassify(payload2);
      renderResult(res2);
    } catch (e) {
      console.error(e);
      setStatus("⚠️ خطأ أثناء إعادة التصنيف.", false);
    }
  });
});