// ==================================
// 🌍 DEV / PROD Switch
// ==================================
const IS_DEV = true;

// 🟢 استخدمي 127.0.0.1 فقط للمحلي، هذا الأكثر استقراراً
const API_BASE = IS_DEV
  ? "http://127.0.0.1:10000"
  : "https://anti-hate-api.mangowave-59e53001.germanywestcentral.azurecontainerapps.io";

// ==================================
// 🌍 Multi-Server Classification
// ==================================
const SERVERS = [
  `${API_BASE}/classify_v2`
];

// ---- fetch مع timeout ----
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ---- classify مع fallback ----
async function classifyWithFallback(payload) {
  for (const endpoint of SERVERS) {
    try {
      console.log(`🌍 Trying server: ${endpoint}`);
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        },
        30000
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data;

    } catch (err) {
      console.warn(`⚠️ Server failed (${endpoint}):`, err.message);
    }
  }
  throw new Error("All classification servers are unavailable");
}

// =====================================
// 🔥 Save record to backend (Firestore)
// =====================================
async function sendRecordToBackend(record) {
  try {
    const res = await fetch(`${API_BASE}/save_record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    const data = await res.json();
    console.log("🔥 Saved to backend:", data);

    return { ok: true, data };
  } catch (err) {
    console.error("❌ Backend save error:", err);
    return { ok: false, error: err.message };
  }
}

// =====================================
// 📨 Message Listener
// =====================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // classification
  if (request?.type === "classifyPost") {
    (async () => {
      try {
        const result = await classifyWithFallback(request.payload);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // save record
  if (request?.type === "saveRecord") {
    (async () => {
      const out = await sendRecordToBackend(request.data);
      sendResponse(out);
    })();
    return true;
  }

});