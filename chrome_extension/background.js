// ==================================
// DEV / PROD Switch  background.js
// ==================================
const IS_DEV = false;

const DEV_API_BASE = "http://127.0.0.1:10000";
const PROD_API_BASE = "https://my-classifier-v2.onrender.com";
const API_BASE = IS_DEV ? DEV_API_BASE : PROD_API_BASE;

// Dashboard URLs
const DASHBOARD_BASE = "http://localhost:3000"; // ← غيّر هذا
const LOGIN_URL = `${DASHBOARD_BASE}/login`;
const REQUEST_ACCESS_URL = `${DASHBOARD_BASE}/request-access`;

// ==================================
// Timeouts
// Render cold start يأخذ 40-60 ثانية.
// نعطيه 70 ثانية على التصنيف، و8 ثواني على الـ ping.
// ==================================
const CLASSIFY_TIMEOUT_MS = 70_000;
const PING_TIMEOUT_MS = 8_000;
const SAVE_TIMEOUT_MS = 15_000;

// ==================================
// Server state (in-memory per SW lifetime)
// ==================================
let serverAwake = false;
let wakePromise = null; // prevent concurrent pings

// ==================================
// fetchWithTimeout
// ==================================
async function fetchWithTimeout(url, options = {}, timeout = 30_000) {
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

// ==================================
// Wake-up ping
// Sends a lightweight GET to /health before the first classify.
// If Render is sleeping, this request wakes it up.
// We wait up to PING_TIMEOUT_MS — if it doesn't respond in time
// we proceed anyway (the classify request itself will wait longer).
// ==================================
async function ensureServerAwake() {
  if (serverAwake) return;

  // Deduplicate: if a ping is already in-flight, wait for it
  if (wakePromise) {
    await wakePromise;
    return;
  }

  wakePromise = (async () => {
    try {
      console.log("🔔 Sending wake-up ping to backend...");
      const res = await fetchWithTimeout(
        `${API_BASE}/health`,
        { method: "GET" },
        PING_TIMEOUT_MS
      );
      if (res.ok) {
        serverAwake = true;
        console.log("✅ Backend is awake.");
      } else {
        console.warn(`⚠️ Ping returned HTTP ${res.status} — proceeding anyway.`);
      }
    } catch (err) {
      // Timeout or network error — proceed anyway, classify will retry
      console.warn("⚠️ Wake-up ping failed or timed out — proceeding anyway:", err.message);
    } finally {
      wakePromise = null;
    }
  })();

  await wakePromise;
}

// Reset wake flag if the service worker restarts (e.g. extension reload)
// This is automatic since serverAwake is in-memory.

// ==================================
// Classification
// ==================================
async function classifyWithFallback(payload) {
  // Step 1: wake the server (best-effort, non-blocking on failure)
  await ensureServerAwake();

  const endpoint = `${API_BASE}/classify_v2`;

  try {
    console.log(`🌍 Classifying via: ${endpoint}`);
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      CLASSIFY_TIMEOUT_MS
    );

    if (!res.ok) {
      // HTTP error from server — not a network issue
      const body = await res.text().catch(() => "");
      throw Object.assign(
        new Error(`HTTP ${res.status}`),
        { type: "http_error", status: res.status, body }
      );
    }

    serverAwake = true; // mark awake on first successful response
    const data = await res.json();

    // Detect backend-level parse/model failure
    // (backend returns ok:200 but signals failure in the payload)
    if (data?.error || data?.status === "error") {
      throw Object.assign(
        new Error(data.error || "Backend returned error status"),
        { type: "model_error" }
      );
    }

    return data;

  } catch (err) {
    // Re-tag timeout errors
    if (err.name === "AbortError") {
      throw Object.assign(
        new Error("Classification timed out — server may be waking up"),
        { type: "timeout" }
      );
    }
    // Network errors
    if (!err.type) {
      err.type = "network_error";
    }
    throw err;
  }
}

// ==================================
// Save record
// ==================================
async function sendRecordToBackend(record) {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/save_record`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      },
      SAVE_TIMEOUT_MS
    );
    const data = await res.json();
    console.log("🔥 Saved to backend:", data);
    return { ok: true, data };
  } catch (err) {
    console.error("❌ Backend save error:", err);
    return { ok: false, error: err.message };
  }
}

// ==================================
// Session State
// ==================================
async function getSessionState() {
  try {
    const stored = await chrome.storage.local.get("ahm_cached_session");
    return { ok: true, session: stored["ahm_cached_session"] || null };
  } catch (err) {
    return { ok: false, session: null, error: err.message };
  }
}

// ==================================
// Navigation
// ==================================
function openTab(url) {
  chrome.tabs.create({ url, active: true });
}

// ==================================
// Message Listener
// ==================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request?.type === "classifyPost") {
    // console.log("CLASSIFY_PAYLOAD", JSON.stringify(request.payload, null, 2));

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

  if (request?.type === "saveRecord") {
    (async () => {
      const out = await sendRecordToBackend(request.data);
      sendResponse(out);
    })();
    return true;
  }

  if (request?.type === "getSessionState") {
    (async () => {
      const out = await getSessionState();
      sendResponse(out);
    })();
    return true;
  }

  if (request?.type === "openLoginPage") {
    openTab(LOGIN_URL);
    sendResponse({ ok: true });
    return true;
  }

  if (request?.type === "openRequestAccessPage") {
    openTab(REQUEST_ACCESS_URL);
    sendResponse({ ok: true });
    return true;
  }

  if (request?.type === "openDashboard") {
    openTab(DASHBOARD_BASE);
    sendResponse({ ok: true });
    return true;
  }

  // ── Relay: popup asks active tab's content script for page context ──
  if (request?.type === "getPageContext") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, reason: "no_active_tab" }); return; }

        const resp = await chrome.tabs.sendMessage(tab.id, { type: "getPageContext" });
        sendResponse(resp);
      } catch (e) {
        // content script not injected on this page, or no X/FB tab
        sendResponse({ ok: false, reason: e.message });
      }
    })();
    return true;
  }

});