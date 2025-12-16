// ================================
// 🧠 Multi-Server Fallback (V2)
// Supports: X, Facebook, future platforms
// ================================

const SERVERS = [
  "https://anti-hate-api.mangowave-59e53001.germanywestcentral.azurecontainerapps.io/classify_v2"
  // لاحقاً نضيف:
  // "https://backup-api.domain.com/classify_v2"
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

// ================================
// 📨 Message Bridge (content / popup → server)
// ================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === "classifyPost") {
    (async () => {
      try {
        const result = await classifyWithFallback(request.payload);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // async
  }
});
