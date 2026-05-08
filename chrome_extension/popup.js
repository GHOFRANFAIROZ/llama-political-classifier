// ─────────────────────────────────────────────────────────────
//  Anti-Hate Monitor — popup.js  (v2)
//  Views: onboarding → main → settings
//  Session: refreshed from background on every popup open
// ─────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  ONBOARDING_DONE: "ahm_onboarding_done",
  MODE:            "ahm_selected_mode",
  CACHED_SESSION:  "ahm_cached_session"
};

const CONF_THRESHOLD = 0.65;

// ── Org dead-end scenario types ──────────────────────────────
// "no_auth"   → not logged in at all
// "no_org"    → logged in but no org linked
// null        → everything is fine
// ─────────────────────────────────────────────────────────────

/* ════ Helpers ════ */

async function saveToBackend(record) {
  return chrome.runtime.sendMessage({ type: "saveRecord", data: record });
}

function getDefaultSession() {
  return { checked: false, isAuthenticated: false, role: null, orgId: null, orgName: null };
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object") return getDefaultSession();
  return {
    checked:         Boolean(raw.checked || raw.isAuthenticated || raw.role || raw.orgId || raw.orgName),
    isAuthenticated: Boolean(raw.isAuthenticated),
    role:    raw.role    || null,
    orgId:   raw.orgId   || null,
    orgName: raw.orgName || null
  };
}

function hasOrgAccess(session) {
  return Boolean(
    session?.isAuthenticated &&
    session?.orgId &&
    (session?.role === "org_user" || session?.role === "admin")
  );
}

function detectSource(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("x.com") || host.includes("twitter.com")) return "x";
    if (host.includes("facebook.com") || host.includes("fb.com"))  return "facebook";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("tiktok.com"))    return "tiktok";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    return "web";
  } catch { return "web"; }
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

/* ════ App State ════ */

let currentView   = "onboarding";
let selectedMode  = "public";
let cachedSession = getDefaultSession();
let lastPayload   = null;

/* ════ View system ════ */

function showView(viewName) {
  currentView = viewName;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");
}

/* ════════════════════════════════════════════
   SESSION BRIDGE
   Asks background.js for the live session,
   falls back to cached storage if unavailable.
════════════════════════════════════════════ */

async function refreshSession() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "getSessionState" });
    if (resp?.ok && resp.session) {
      cachedSession = normalizeSession(resp.session);
      // Persist so next open is fast
      await chrome.storage.local.set({ [STORAGE_KEYS.CACHED_SESSION]: cachedSession });
      return;
    }
  } catch {
    // background might not have this handler yet — fall through to cache
  }

  // Fallback: use what's in storage
  const stored = await chrome.storage.local.get(STORAGE_KEYS.CACHED_SESSION);
  cachedSession = normalizeSession(stored[STORAGE_KEYS.CACHED_SESSION]);
}

/* ════════════════════════════════════════════
   ONBOARDING VIEW
════════════════════════════════════════════ */

function initOnboarding() {
  document.getElementById("ob-public-btn").addEventListener("click", () => finishOnboarding("public"));
  document.getElementById("ob-org-btn").addEventListener("click",    () => finishOnboarding("organization"));
}

async function finishOnboarding(mode) {
  selectedMode = mode;
  await chrome.storage.local.set({
    [STORAGE_KEYS.ONBOARDING_DONE]: true,
    [STORAGE_KEYS.MODE]: mode
  });

  showView("main");
  renderMainState();
}

/* ════════════════════════════════════════════
   MAIN VIEW
════════════════════════════════════════════ */

/**
 * Returns the org block reason, or null if access is fine.
 * "no_auth" | "no_org" | null
 */
function getOrgBlockReason() {
  if (selectedMode !== "organization") return null;
  if (hasOrgAccess(cachedSession))     return null;
  if (cachedSession.isAuthenticated)   return "no_org";
  return "no_auth";
}

function renderMainState() {
  const badge       = document.getElementById("modeBadge");
  const badgeText   = document.getElementById("badgeText");
  const alert       = document.getElementById("sessionAlert");
  const alertMsg    = document.getElementById("sessionAlertMsg");
  const ctaContainer= document.getElementById("sessionCta");
  const classifyBtn = document.getElementById("btn");

  // Reset
  alert.classList.remove("visible");
  ctaContainer.innerHTML = "";
  classifyBtn.disabled = false;

  if (selectedMode === "public") {
    badge.className    = "mode-badge public";
    badgeText.textContent = "استخدام عام";
    return;
  }

  // Org mode — access OK
  if (hasOrgAccess(cachedSession)) {
    badge.className    = "mode-badge org";
    badgeText.textContent = `تعمل باسم: ${cachedSession.orgName || cachedSession.orgId || "منظمة مرتبطة"}`;
    return;
  }

  // Org mode — BLOCKED
  classifyBtn.disabled = true;
  badge.className    = "mode-badge org-warn";

  const reason = getOrgBlockReason();

  if (reason === "no_org") {
    badgeText.textContent = "لا توجد منظمة مرتبطة";
    alertMsg.textContent  = "أنت مسجل الدخول لكن لا توجد منظمة مرتبطة بهذا الحساب. تواصل مع مدير النظام.";
    ctaContainer.appendChild(makeCta("العودة للاستخدام العام", "cta-public",  () => switchMode("public")));
  } else {
    // no_auth
    badgeText.textContent = "يتطلب تسجيل الدخول";
    alertMsg.textContent  = "وضع المنظمة يتطلب تسجيل الدخول أولًا.";
    ctaContainer.appendChild(makeCta("تسجيل الدخول",           "cta-login",   openLoginPage));
    ctaContainer.appendChild(makeCta("طلب وصول",               "cta-request", openRequestAccessPage));
    ctaContainer.appendChild(makeCta("متابعة كمستخدم عام",     "cta-public",  () => switchMode("public")));
  }

  alert.classList.add("visible");
}

function makeCta(label, className, onClick) {
  const btn = document.createElement("button");
  btn.className = `cta-btn ${className}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function openLoginPage() {
  chrome.runtime.sendMessage({ type: "openLoginPage" });
}

function openRequestAccessPage() {
  chrome.runtime.sendMessage({ type: "openRequestAccessPage" });
}

function initMain() {
  document.getElementById("openSettingsBtn").addEventListener("click", () => {
    renderSettingsState();
    showView("settings");
  });

  document.getElementById("fillBtn").addEventListener("click", async () => {
    try {
      const u = await getCurrentTabUrl();
      if (!u) { setStatus("تعذّر الحصول على رابط الصفحة.", false); return; }
      document.getElementById("postUrl").value = u;
      hideContextUI();
      setStatus("✅ تم جلب الرابط", true);
    } catch (e) { setStatus(String(e?.message || e), false); }
  });

  document.getElementById("btn").addEventListener("click", async () => {
    const value = (document.getElementById("postUrl").value || "").trim();
    if (!value) { alert("يرجى لصق رابط المنشور أولاً."); return; }

    hideContextUI();
    setSubmitNotice("", "info");
    setStatus("⏳ جاري التصنيف...", true);

    const source = detectSource(value);
    let payload;

    // ── If the current tab is X, try to pull real text from the page ──
    if (source === "x") {
      try {
        const ctx = await chrome.runtime.sendMessage({ type: "getPageContext" });
        if (ctx?.ok && ctx.text) {
          // Use real extracted text + meta
          payload = {
            mode: "popup",
            url:       ctx.url       || value,
            text:      ctx.text,
            author:    ctx.author    || "Unknown",
            post_time: ctx.post_time || new Date().toISOString(),
            source:    "X"
          };
          setStatus("⏳ جاري التصنيف (نص مستخرج من الصفحة)...", true);
        }
      } catch (_) {
        // content script not available — fall through to URL-only
      }
    }

    // ── Fallback: URL-only (for non-X links or when extraction fails) ──
    if (!payload) {
      payload = {
        mode: "popup", url: value, text: "",
        author: "Unknown",
        post_time: new Date().toISOString(),
        source
      };
    }

    lastPayload = payload;

    try {
      const res = await sendClassify(payload);
      await renderResult(res);
    } catch (e) {
      console.error(e);
      setStatus("⚠️ حدث خطأ أثناء التصنيف.", false);
    }
  });

  document.getElementById("reclassifyBtn").addEventListener("click", async () => {
    if (!lastPayload) { setStatus("لا يوجد طلب سابق.", false); return; }
    const ctx = (document.getElementById("contextText").value || "").trim();
    if (!ctx) { alert("يرجى إضافة سياق."); return; }

    setStatus("⏳ جاري إعادة التصنيف...", true);
    const payload2 = { ...lastPayload, context: ctx };
    lastPayload = payload2;

    try {
      const res2 = await sendClassify(payload2);
      await renderResult(res2);
    } catch (e) {
      console.error(e);
      setStatus("⚠️ خطأ أثناء إعادة التصنيف.", false);
    }
  });
}

/* Classify helpers */

function setStatus(msg, ok = true) {
  const el = document.getElementById("result");
  el.textContent = msg;
  el.className = "status " + (ok ? "ok" : "bad");
}

function hideContextUI() {
  document.getElementById("lowConfNote").style.display = "none";
  document.getElementById("contextWrap").style.display = "none";
}

function showContextUI() {
  const note = document.getElementById("lowConfNote");
  note.textContent = "النتيجة غير مؤكدة. يمكنك إضافة سياق لتحسين الدقة.";
  note.style.display = "block";
  document.getElementById("contextWrap").style.display = "block";
}

function setSubmitNotice(message = "", type = "info") {
  const el = document.getElementById("submitNotice");
  if (!message) {
    el.style.display = "none";
    el.textContent = "";
    el.className = "submit-notice";
    return;
  }
  el.textContent = message;
  el.style.display = "block";
  el.className = `submit-notice ${type}`;
}

async function renderResult(res) {
  const labelAr  = res?.label_ar  || res?.label  || "غير مُصنَّف";
  const reasonAr = res?.reason_ar || res?.reason  || "";
  const conf     = Number(res?.confidence_score);
  const confSafe = Number.isFinite(conf) ? conf : null;

  let displayText = `✅ الفئة: ${labelAr}`;
  if (reasonAr) displayText += ` — ${reasonAr}`;
  setStatus(displayText, true);

  (confSafe !== null && confSafe < CONF_THRESHOLD) ? showContextUI() : hideContextUI();

  await maybeSaveRecord({
    url:           lastPayload?.url,
    source:        lastPayload?.source,
    raw_text:      lastPayload?.text || "",
    context:       lastPayload?.context || "",
    result_label:  labelAr,
    result_reason: reasonAr,
    confidence:    confSafe,
    selected_mode: selectedMode
  });
}

async function maybeSaveRecord(record) {
  if (selectedMode === "public") {
    try {
      const out = await saveToBackend(record);
      if (!out?.ok) { setSubmitNotice("تم التصنيف، لكن فشل حفظ السجل.", "bad"); return; }
      setSubmitNotice("", "info");
    } catch { setSubmitNotice("تم التصنيف، لكن حدث خطأ أثناء الحفظ.", "bad"); }
    return;
  }
  // Org save — coming in next phase
  setSubmitNotice("تم التصنيف. حفظ سجلات المنظمة سيُفعَّل بعد ربط الجلسة التنظيمية.", "warn");
}

/* ════════════════════════════════════════════
   SETTINGS VIEW
════════════════════════════════════════════ */

function renderSettingsState() {
  const modeVal = document.getElementById("settingsModeValue");
  const sAuth   = document.getElementById("s-auth");
  const sOrg    = document.getElementById("s-org");
  const swPub   = document.getElementById("sw-public-btn");
  const swOrg   = document.getElementById("sw-org-btn");

  if (selectedMode === "public") {
    modeVal.textContent = "استخدام عام";
    modeVal.className   = "cmd-value public";
    sAuth.textContent   = cachedSession.isAuthenticated ? "مسجل الدخول" : "غير مطلوب";
    sOrg.textContent    = "—";
  } else {
    const orgLabel = cachedSession.orgName || cachedSession.orgId || null;
    modeVal.textContent = orgLabel ? `باسم: ${orgLabel}` : "باسم منظمة (غير مفعّل)";
    modeVal.className   = "cmd-value org";
    sAuth.textContent   = cachedSession.isAuthenticated ? "مسجل الدخول" : "يتطلب تسجيل دخول";
    sOrg.textContent    = orgLabel || "—";
  }

  swPub.classList.toggle("active-sw", selectedMode === "public");
  swOrg.classList.toggle("active-sw", selectedMode === "organization");
}

function initSettings() {
  document.getElementById("backBtn").addEventListener("click", () => showView("main"));

  document.getElementById("sw-public-btn").addEventListener("click", () => switchMode("public"));
  document.getElementById("sw-org-btn").addEventListener("click",    () => switchMode("organization"));
}

async function switchMode(mode) {
  selectedMode = mode;
  await chrome.storage.local.set({ [STORAGE_KEYS.MODE]: mode });
  renderSettingsState();
  renderMainState();
  // If we're in settings, go back to main so the user sees the new state
  if (currentView === "settings") showView("main");
}

/* ════════════════════════════════════════════
   BOOT
════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", async () => {
  initOnboarding();
  initMain();
  initSettings();

  // 1. Load persisted mode + onboarding flag
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.ONBOARDING_DONE,
    STORAGE_KEYS.MODE
  ]);
  selectedMode = stored[STORAGE_KEYS.MODE] || "public";

  // 2. Refresh session from background (non-blocking for UI)
  await refreshSession();

  // 3. Decide which view to show
  if (!stored[STORAGE_KEYS.ONBOARDING_DONE]) {
    showView("onboarding");
  } else {
    showView("main");
    renderMainState();
  }
});