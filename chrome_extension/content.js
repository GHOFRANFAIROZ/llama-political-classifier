// ================================
// X (Twitter) - Manual classify only (NO AUTO)
// Inject a 🤖 button on each tweet and classify on click.
//
// Facebook - Manual classify only (NO AUTO)
// Flow: press 🕊️ -> Pick Mode -> user clicks a post -> classify immediately (no second 🕊️ press).
// NO auto-classification. NO click tracking outside Pick Mode.
// ================================

(function () {
  // ------------------------------
  // Shared helpers
  // ------------------------------
  const CONF_THRESHOLD = 0.65;

  function isX() {
    return location.hostname.includes("x.com") || location.hostname.includes("twitter.com");
  }

  function isFacebook() {
    const host = location.hostname;
    return host.includes("facebook.com") || host.includes("fb.com");
  }

  function safeText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function clampContext(str) {
    if (!str) return "";
    let s = str.trim();
    if (s.length > 600) s = s.slice(0, 600);
    return s;
  }

  // ── Translate errorType from background.js into a human message ──
  function errorMessage(err) {
    const type = err?.errorType || "";
    if (type === "timeout")
      return "⏳ السيرفر يستيقظ، يرجى المحاولة مرة ثانية بعد 20 ثانية.";
    if (type === "network_error")
      return "⚠️ لا يوجد اتصال بالإنترنت أو السيرفر غير متاح.";
    if (type === "http_error")
      return `⚠️ السيرفر أرجع خطأ (${err?.status || "؟"}). حاول مرة أخرى.`;
    if (type === "model_error")
      return "⚠️ النموذج لم يتمكن من إرجاع نتيجة. حاول مرة أخرى.";
    return "⚠️ فشل التصنيف. حاول مرة أخرى.";
  }

  // ================================
  // 1) X / Twitter block
  // ================================
  if (isX()) {
    const TOOLTIP_ATTR = "data-smart-monitor-tooltip";
    const BTN_ATTR = "data-smart-monitor-btn";

    function createIconButton() {
      const btn = document.createElement("button");
      btn.setAttribute(BTN_ATTR, "1");
      btn.type = "button";
      btn.textContent = "🤖";
      btn.title = "تصنيف هذا المنشور بالذكاء الاصطناعي";
      btn.style.cursor = "pointer";
      btn.style.border = "none";
      btn.style.background = "transparent";
      btn.style.padding = "0 4px";
      btn.style.marginLeft = "4px";
      btn.style.fontSize = "16px";
      btn.style.lineHeight = "1";
      btn.style.userSelect = "none";
      btn.style.outline = "none";
      return btn;
    }

    function removeExistingTooltip(article) {
      document.querySelectorAll(`[${TOOLTIP_ATTR}="1"]`).forEach((el) => el.remove());
    }

    function createTooltipEl() {
      const tip = document.createElement("div");
      tip.setAttribute(TOOLTIP_ATTR, "1");
      tip.style.position = "absolute";
      tip.style.zIndex = "999999";
      tip.style.maxWidth = "380px";
      tip.style.background = "rgba(255,255,255,0.97)";
      tip.style.border = "1px solid rgba(0,0,0,0.15)";
      tip.style.borderRadius = "12px";
      tip.style.padding = "10px 12px";
      tip.style.boxShadow = "0 6px 18px rgba(0,0,0,0.15)";
      tip.style.fontSize = "12px";
      tip.style.lineHeight = "1.35";
      tip.style.color = "#111";
      tip.style.whiteSpace = "normal";
      tip.style.direction = "rtl";
      tip.style.textAlign = "right";
      return tip;
    }

    function positionTooltipNearArticle(article, tip) {
      const rect = article.getBoundingClientRect();
      tip.style.top = `${window.scrollY + rect.top + 8}px`;
      tip.style.left = `${window.scrollX + rect.right - 400}px`;
    }

    function showTooltipText(article, text, ms = 7000) {
      removeExistingTooltip(article);

      const tip = createTooltipEl();
      tip.textContent = text;

      positionTooltipNearArticle(article, tip);
      document.body.appendChild(tip);

      if (ms && ms > 0) {
        setTimeout(() => {
          if (tip && tip.parentNode) tip.remove();
        }, ms);
      }
    }

    function showTooltipWithContextUI(article, res, onReclassify) {
      removeExistingTooltip(article);

      const labelAr = res?.label_ar || res?.label || "غير مصنف";
      const reasonAr = res?.reason_ar || res?.reason || "";

      const label = escapeHtml(labelAr);
      const reason = escapeHtml(reasonAr);
      const confNum = Number(res?.confidence_score);
      const confSafe = Number.isFinite(confNum) ? confNum : null;

      const tip = createTooltipEl();

      tip.innerHTML = `
        <div style="font-weight:800;font-size:13px;margin-bottom:6px;">${label}</div>
        <div style="margin-top:6px;white-space:pre-wrap;color:#222;">${reason}</div>

        <div style="margin-top:10px;padding:8px 10px;border-radius:10px;border:1px dashed rgba(0,0,0,0.18);background:rgba(0,0,0,0.03);">
          <div style="font-weight:800;color:#333;margin-bottom:6px;">النتيجة غير مؤكدة</div>
          <div style="color:#444;margin-bottom:8px;">
            إذا كان في سياق (سخرية/اقتباس/صورة/نقاش سابق)، اكتب سطرين ثم اضغط إعادة التصنيف.
          </div>

          <textarea
            style="width:100%;min-height:56px;resize:vertical;border-radius:8px;padding:6px 8px;border:1px solid rgba(0,0,0,0.2);outline:none;direction:rtl;text-align:right;font-size:12px;"
            placeholder="مثال: هذا المنشور اقتباس من خطاب… أو رد على تعليق سابق… أو فيه صورة/فيديو يغيّر المعنى…"></textarea>

          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;justify-content:flex-start;">
            <button type="button" style="padding:6px 10px;border-radius:999px;border:none;background:#111;color:#fff;font-size:12px;cursor:pointer;">
              إعادة التصنيف
            </button>
            <span style="font-size:11px;color:#777;">(اختياري، للمواقف الرمادية فقط)</span>
          </div>
        </div>
      `;

      positionTooltipNearArticle(article, tip);
      document.body.appendChild(tip);

      const ta = tip.querySelector("textarea");
      const reBtn = tip.querySelector("button");
      const msg = tip.querySelector("span");

      reBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ctx = clampContext(ta?.value || "");
        if (!ctx) {
          if (msg) msg.textContent = "اكتب سطر/سطرين سياق أولاً.";
          return;
        }
        if (msg) msg.textContent = "⏳ إعادة تصنيف...";
        try {
          const res2 = await onReclassify(ctx);
          const c2 = Number(res2?.confidence_score);
          const c2Safe = Number.isFinite(c2) ? c2 : null;

          if (c2Safe !== null && c2Safe < CONF_THRESHOLD) {
            showTooltipWithContextUI(article, res2, onReclassify);
          } else {
            const label2Ar = res2?.label_ar || res2?.label || "غير مصنف";
            const reason2Ar = res2?.reason_ar || res2?.reason || "";
            showTooltipText(article, `${label2Ar}\n${reason2Ar}`.trim(), 7000);
          }
        } catch (err) {
          if (msg) msg.textContent = errorMessage(err);
        }
      });
    }

    function escapeHtml(str) {
      return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function getTweetTextFromArticle(article) {
      const parts = Array.from(article.querySelectorAll("div[lang]"))
        .map((d) => (d.innerText || "").trim())
        .filter((t) => t.length > 0);
      return parts.join(" ").trim();
    }

    function getAuthorFromArticle(article) {
      // User-Name div يحتوي على: الاسم + handle + أحيانًا وقت
      // نحاول أخذ أول span مستقل يحتوي فقط على الاسم الظاهر
      const userNameDiv =
        article.querySelector('div[data-testid="User-Name"]') ||
        article.querySelector('div[data-testid="UserName"]');

      if (userNameDiv) {
        // الاسم الظاهر عادةً في أول <span> أو <a> مباشر داخل الـ div
        const spans = Array.from(userNameDiv.querySelectorAll("span"))
          .map((s) => (s.innerText || "").trim())
          .filter((t) => t.length > 0 && !t.startsWith("@") && !/^\d/.test(t) && t !== "·");

        if (spans.length > 0) return spans[0];

        // fallback: أول رابط بروفايل
        const profileLink = userNameDiv.querySelector('a[href^="/"][role="link"]');
        const txt = (profileLink?.innerText || "").trim();
        if (txt) return txt.split("\n")[0].trim(); // أول سطر فقط
      }

      // fallback أخير
      const profileLink = article.querySelector('a[href^="/"][role="link"]');
      const txt = (profileLink?.innerText || "").trim();
      return txt ? txt.split("\n")[0].trim() : "Unknown";
    }

    function getPostTimeFromArticle(article) {
      const timeEl = article.querySelector("time");
      const dt = timeEl?.getAttribute("datetime");
      return dt || new Date().toISOString();
    }

    function findActionBar(article) {
      const likeBtn = article.querySelector('button[data-testid="like"]');
      if (likeBtn) return likeBtn.closest("div[role='group']") || likeBtn.parentElement;

      const replyBtn = article.querySelector('button[data-testid="reply"]');
      if (replyBtn) return replyBtn.closest("div[role='group']") || replyBtn.parentElement;

      return article;
    }

    function cleanTweetUrl(url) {
      if (!url) return url;

      let clean = url.split("?")[0];

      clean = clean.replace(/\/status\/(\d+)\/.+$/, "/status/$1");

      return clean;
    }

    function getTweetUrlFromArticle(article) {
      const timeEl = article.querySelector("time");
      const timeLink = timeEl?.closest("a");
      if (timeLink?.href) {
        return cleanTweetUrl(timeLink.href);
      }

      const statusLink = article.querySelector('a[href*="/status/"]');
      if (statusLink?.href) {
        return cleanTweetUrl(statusLink.href);
      }

      return cleanTweetUrl(location.href);
    }
    // ============================================================
    async function classifyXPost(article) {
      const text = safeText(getTweetTextFromArticle(article));
      if (!text || text.length < 5) {
        showTooltipText(article, "تعذر قراءة نص واضح من المنشور. جرّب منشوراً آخر.", 6500);
        return;
      }

      const author = safeText(getAuthorFromArticle(article));
      const post_time = getPostTimeFromArticle(article);
      const url = getTweetUrlFromArticle(article);

      // console.log("EXTRACT_RESULT", {
//   text: text?.slice(0, 100),
//   author,
//   url,
//   post_time
// });

      const basePayload = {
        url,
        text,
        author,
        post_time,
        source: "X"
      };

      showTooltipText(article, "جاري التصنيف… ⏳", 0);

      try {
        const resp = await chrome.runtime.sendMessage({
          type: "classifyPost",
          payload: basePayload
        });

        if (!resp?.ok) throw Object.assign(
          new Error(resp?.error || "Request failed"),
          { errorType: resp?.errorType || "unknown", status: resp?.status || null }
        );

        const res = resp.result;
        const conf = Number(res?.confidence_score);
        const confSafe = Number.isFinite(conf) ? conf : null;

        if (confSafe !== null && confSafe < CONF_THRESHOLD) {
          showTooltipWithContextUI(article, res, async (ctx) => {
            const p2 = { ...basePayload, context: ctx };
            const resp2 = await chrome.runtime.sendMessage({
              type: "classifyPost",
              payload: p2
            });

            if (!resp2?.ok) throw Object.assign(
              new Error(resp2?.error || "Request failed"),
              { errorType: resp2?.errorType || "unknown", status: resp2?.status || null }
            );

            return resp2.result;
          });
        } else {
          const labelAr = res?.label_ar || res?.label || "غير مصنف";
          const reasonAr = res?.reason_ar || res?.reason || "";

          const isFallback = res?.fallback_used === true;
          const labelId = res?.label_id || "";
          const isNeutral = labelId === "NEUTRAL_OTHER";

          if (isFallback && isNeutral) {
            showTooltipText(
              article,
              `⚠️ لم يتأكد النظام من التصنيف.\n${reasonAr}\n\nأعد المحاولة أو أضف سياقًا.`.trim(),
              9000
            );
          } else {
            showTooltipText(article, `${labelAr}\n${reasonAr}`.trim(), 7000);
          }
        }
      } catch (e) {
        console.error("Classification error:", e);
        showTooltipText(article, errorMessage(e), 9000);
      }
    }

    function injectButtons() {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');

      for (const article of articles) {
        if (article.querySelector(`[${BTN_ATTR}="1"]`)) continue;

        const bar = findActionBar(article);
        if (!bar) continue;

        const btn = createIconButton();
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          classifyXPost(article);
        });

        bar.appendChild(btn);
      }
    }

    injectButtons();

    const obs = new MutationObserver(() => injectButtons());
    obs.observe(document.body, { childList: true, subtree: true });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "getPageContext") return;

      try {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

        let best = null;
        let bestTop = Infinity;

        for (const a of articles) {
          const rect = a.getBoundingClientRect();
          if (rect.top >= 0 && rect.top < bestTop) {
            bestTop = rect.top;
            best = a;
          }
        }

        if (!best) best = articles[0] || null;

        if (!best) {
          sendResponse({ ok: false, reason: "no_article" });
          return;
        }

        const text = safeText(getTweetTextFromArticle(best));
        const author = safeText(getAuthorFromArticle(best));
        const time = getPostTimeFromArticle(best);
        const url = getTweetUrlFromArticle(best);

        if (!text || text.length < 5) {
          sendResponse({ ok: false, reason: "no_text" });
          return;
        }

        sendResponse({
          ok: true,
          text,
          author,
          post_time: time,
          url,
          source: "X"
        });
      } catch (e) {
        sendResponse({ ok: false, reason: e.message });
      }

      return true;
    });

    return;
  }
  // ============================================================
  // ============================================================
  // 2) Facebook block
  // ============================================================
  if (!isFacebook()) return;

  const FB_FLOAT_BTN_ID = "smart-monitor-fb-float-btn";
  const FB_TOAST_ID = "smart-monitor-fb-toast";
  const FB_SELECTED_CLASS = "smart-monitor-fb-selected-post";

  let fbPickMode = false;
  let fbPickTimeoutId = null;
  let fbPickClickHandler = null;

  const PICK_MODE_MS = 12000;

  function ensureStyles() {
    if (document.getElementById("smart-monitor-fb-styles")) return;

    const style = document.createElement("style");
    style.id = "smart-monitor-fb-styles";
    style.textContent = `
      :root{
        --sm-white: rgba(255,255,255,0.26);
        --sm-white2: rgba(255,255,255,0.14);
        --sm-line: rgba(255,255,255,0.28);
        --sm-shadow: rgba(0,0,0,0.35);
        --sm-glow: rgba(255,255,255,0.45);
      }

      .${FB_SELECTED_CLASS}{
        outline: 3px solid rgba(255,255,255,0.55) !important;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.15), 0 0 25px rgba(255,255,255,0.28) !important;
        transition: outline 0.2s ease, box-shadow 0.2s ease;
      }

      #${FB_FLOAT_BTN_ID}{
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.65);
        background: radial-gradient(circle at top left, rgba(255,255,255,0.92), rgba(230,230,230,0.9));
        box-shadow: 0 12px 30px rgba(0,0,0,0.35);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 19px;
        cursor: pointer;
        color: #111;
        transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, opacity 0.15s ease;
      }
      #${FB_FLOAT_BTN_ID}.sm-active{
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 16px 35px rgba(0,0,0,0.45);
        background: radial-gradient(circle at top left, rgba(255,255,255,0.98), rgba(235,235,235,0.92));
      }
      #${FB_FLOAT_BTN_ID}.sm-scrolling{ opacity: 0.72; }
      #${FB_FLOAT_BTN_ID}:hover{
        transform: translateY(-1px) scale(1.04);
        box-shadow: 0 14px 32px rgba(0,0,0,0.4);
      }

      #${FB_TOAST_ID}{
        position: fixed;
        right: 18px;
        bottom: 92px;
        z-index: 2147483647;
        max-width: 320px;
        background: radial-gradient(circle at top left, rgba(255,255,255,0.97), rgba(245,245,245,0.92));
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 14px;
        padding: 8px 10px;
        box-shadow: 0 14px 32px rgba(0,0,0,0.35);
        font-size: 11px;
        line-height: 1.35;
        color: rgba(0,0,0,0.9);
        white-space: normal;
        display: none;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }

      #${FB_TOAST_ID} .sm-header{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; }
      #${FB_TOAST_ID} .sm-label{ font-weight:800; font-size:12px; color:#111; }
      #${FB_TOAST_ID} .sm-close{ background:none; border:none; cursor:pointer; font-size:14px; opacity:0.7; }
      #${FB_TOAST_ID} .sm-close:hover{ opacity:1; }
      #${FB_TOAST_ID} .sm-body{ margin-top:4px; white-space:pre-wrap; }
      #${FB_TOAST_ID} .sm-footer{ margin-top:6px; padding-top:6px; border-top:1px solid rgba(0,0,0,0.08); font-size:10px; color:#666; }
      #${FB_TOAST_ID} .sm-btn{ margin-top:8px; padding:6px 10px; font-weight:800; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.20); color: rgba(0,0,0,0.86); }
      #${FB_TOAST_ID} .sm-btn:hover{ filter: brightness(1.05); }
      #${FB_TOAST_ID} .sm-ta{ width:100%; height:46px; resize:none; border-radius:10px; padding:6px 8px; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.16); color: rgba(0,0,0,0.9); outline:none; direction: rtl; text-align: right; margin-top:6px; }
      #${FB_TOAST_ID} .sm-muted{ color: rgba(0,0,0,0.72); }
      #${FB_TOAST_ID} .sm-title{ font-weight:900; margin-bottom:6px; }
      #${FB_TOAST_ID} .sm-row{ display:flex; gap:8px; margin-top:8px; }
      #${FB_TOAST_ID} .sm-row .sm-btn{ flex:1; }

      @media (prefers-reduced-motion: reduce){
        #${FB_FLOAT_BTN_ID}{ animation: none; transition: none; }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function createFloatingButton() {
    const btn = document.createElement("button");
    btn.id = FB_FLOAT_BTN_ID;
    btn.type = "button";
    btn.textContent = "🕊️";
    return btn;
  }

  function ensureFloatingButton() {
    ensureStyles();
    if (document.getElementById(FB_FLOAT_BTN_ID)) return;
    const btn = createFloatingButton();
    document.body.appendChild(btn);
    btn.addEventListener("click", onFloatButtonClick);
  }

  function showToast(html) {
    let toast = document.getElementById(FB_TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = FB_TOAST_ID;
      document.body.appendChild(toast);
    }
    toast.innerHTML = html;
    toast.style.display = "block";

    const closeBtn = toast.querySelector("[data-sm-close]");
    closeBtn?.addEventListener("click", () => { toast.style.display = "none"; });
  }

  function showToastText(text, ms) {
    showToast(`
      <div class="sm-title">نتيجة التصنيف</div>
      <div class="sm-body">${escapeHtml(text)}</div>
    `);
    if (ms && ms > 0) {
      setTimeout(() => {
        const t = document.getElementById(FB_TOAST_ID);
        if (t) t.style.display = "none";
      }, ms);
    }
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isProbablyInComments(el) {
    if (!el) return false;
    const commentSelectors = [
      'div[aria-label="Leave a comment"]',
      'div[aria-label="Comments"]',
      'div[aria-label^="تعليق"]',
      'div[aria-label^="Comment"]',
      'div[data-testid="UFI2Comment/root"]',
      'div[data-testid="UFI2CommentsList/root_depth_0"]',
      'ul[aria-label="Comments"]'
    ];
    for (const sel of commentSelectors) {
      if (el.closest(sel)) return true;
    }
    return false;
  }

  function expandSeeMoreIn(postEl) {
    if (!postEl) return;
    const buttons = postEl.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]');
    buttons.forEach((b) => {
      const txt = (b.innerText || "").trim();
      if (!txt) return;
      if (
        txt === "See more" ||
        txt === "عرض المزيد" ||
        txt === "المزيد" ||
        txt.includes("See more") ||
        (txt.includes("عرض") && txt.includes("المزيد"))
      ) {
        b.click();
      }
    });
  }

  function findMainStoryContainer(postEl) {
    if (!postEl) return null;
    const nestedArticle = postEl.querySelector('div[role="article"] div[role="article"]');
    if (nestedArticle) return nestedArticle;
    const msg = postEl.querySelector('div[data-ad-preview="message"]');
    if (msg) return msg;
    return postEl;
  }

  function detectFbSourceType(postEl) {
    try {
      const nestedArticle = postEl.querySelector('div[role="article"] div[role="article"]');
      if (nestedArticle) return "facebook_shared";
      return "facebook_post";
    } catch (_) {
      return "facebook_post";
    }
  }

  function findBestPostContainerFromTarget(target) {
    if (!target) return null;
    const candidates = [
      'div[role="article"]',
      'div[data-pagelet^="FeedUnit_"]',
      'div[data-ad-preview="message"]',
      'div[data-testid="fbfeed_story"]',
    ];
    for (const sel of candidates) {
      const el = target.closest(sel);
      if (el) {
        const art = el.closest('div[role="article"]');
        return art || el;
      }
    }
    return null;
  }

  function flashHighlight(el) {
    if (!el) return;
    el.classList.add(FB_SELECTED_CLASS);
    setTimeout(() => el.classList.remove(FB_SELECTED_CLASS), 900);
  }

  function enterPickMode() {
    if (fbPickMode) return;
    fbPickMode = true;

    const btn = document.getElementById(FB_FLOAT_BTN_ID);
    if (btn) btn.classList.add("sm-active");

    fbPickClickHandler = async (e) => {
      if (!fbPickMode) return;
      e.preventDefault();
      e.stopPropagation();

      const postEl = findBestPostContainerFromTarget(e.target);
      if (!postEl) {
        showToastText("تعذر العثور على منشور واضح. حاول مرة أخرى.", 4000);
        return;
      }

      exitPickMode(false);
      await classifyFacebookPost(postEl);
    };

    document.body.addEventListener("click", fbPickClickHandler, true);

    showToast(`
      <div class="sm-title">وضع اختيار المنشور</div>
      <div class="sm-body">اضغط على أي منشور في الصفحة ليتم تحليله وتصنيفه بالذكاء الاصطناعي.</div>
      <div class="sm-footer sm-muted">ينتهي وضع الاختيار تلقائياً بعد ثوانٍ إذا لم يتم اختيار منشور.</div>
    `);

    fbPickTimeoutId = setTimeout(() => { exitPickMode(true); }, PICK_MODE_MS);
  }

  function exitPickMode(showMsg) {
    if (!fbPickMode) return;
    fbPickMode = false;

    const btn = document.getElementById(FB_FLOAT_BTN_ID);
    if (btn) btn.classList.remove("sm-active");

    if (fbPickClickHandler) {
      document.body.removeEventListener("click", fbPickClickHandler, true);
      fbPickClickHandler = null;
    }

    if (fbPickTimeoutId) {
      clearTimeout(fbPickTimeoutId);
      fbPickTimeoutId = null;
    }

    if (showMsg) {
      showToastText("انتهى وقت اختيار المنشور بدون اختيار أي منشور.", 3200);
    }
  }

  function renderFbResultWithOptionalContextUI(payloadBase, res) {
    const labelAr = res?.label_ar || res?.label || "غير مصنف";
    const reasonAr = res?.reason_ar || res?.reason || "";

    const label = escapeHtml(labelAr);
    const reason = escapeHtml(reasonAr);
    const confNum = Number(res?.confidence_score);
    const confSafe = Number.isFinite(confNum) ? confNum : null;

    if (confSafe === null || confSafe >= CONF_THRESHOLD) {
      showToastText(`${labelAr}\n${reasonAr}`.trim(), 6500);
      return;
    }

    const toastHtml = `
      <div class="sm-title">نتيجة غير مؤكدة</div>
      <div class="sm-body">
        <div><strong>${label}</strong></div>
        <div style="margin-top:4px;">${reason}</div>
      </div>
      <div class="sm-footer sm-muted">
        إذا كان في سياق (سخرية/اقتباس/صورة/نقاش سابق)، اكتب سطرين ثم اضغط إعادة التصنيف.
      </div>
      <textarea class="sm-ta" placeholder="مثال: هذا المنشور اقتباس من خطاب… أو رد على تعليق سابق… أو فيه صورة/فيديو يغيّر المعنى…"></textarea>
      <div class="sm-row">
        <button type="button" class="sm-btn" data-sm-reclass>إعادة التصنيف</button>
        <button type="button" class="sm-btn" data-sm-close>إغلاق</button>
      </div>
    `;

    showToast(toastHtml);

    const toast = document.getElementById(FB_TOAST_ID);
    const ctxTa = toast?.querySelector("textarea.sm-ta");
    const reBtn = toast?.querySelector("[data-sm-reclass]");
    const msg = toast?.querySelector(".sm-footer");

    reBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ctx = clampContext(ctxTa?.value || "");
      if (!ctx) {
        if (msg) msg.textContent = "اكتب سطر/سطرين سياق أولاً.";
        return;
      }
      if (msg) msg.textContent = "⏳ إعادة تصنيف...";
      try {
        const payload2 = { ...payloadBase, context: ctx };
        const resp2 = await chrome.runtime.sendMessage({ type: "classifyPost", payload: payload2 });
        if (!resp2?.ok) throw Object.assign(
          new Error(resp2?.error || "Request failed"),
          { errorType: resp2?.errorType || "unknown", status: resp2?.status || null }
        );
        renderFbResultWithOptionalContextUI(payload2, resp2.result);
      } catch (err) {
        if (msg) msg.textContent = errorMessage(err);
      }
    });
  }

  async function classifyFacebookPost(postEl) {
    flashHighlight(postEl);

    const mainStory = findMainStoryContainer(postEl) || postEl;
    expandSeeMoreIn(mainStory);

    const payload = {
      url: extractUrl(postEl),
      text: extractText(postEl),
      author: extractAuthor(postEl),
      post_time: extractPostTime(postEl),
      source: detectFbSourceType(postEl)
    };

    if (!payload.text || payload.text.length < 5) {
      showToastText("تعذر قراءة نص واضح من المنشور. جرّب منشور آخر.", 4500);
      return;
    }

    // إظهار "جاري التصنيف" بدون auto-hide
    showToastText("جاري التصنيف… ⏳", 0);

    try {
      const resp = await chrome.runtime.sendMessage({ type: "classifyPost", payload });
      if (!resp?.ok) throw Object.assign(
        new Error(resp?.error || "Request failed"),
        { errorType: resp?.errorType || "unknown", status: resp?.status || null }
      );
      renderFbResultWithOptionalContextUI(payload, resp.result);
    } catch (err) {
      console.error("FB classify error:", err);
      showToastText(errorMessage(err), 9000);
    }
  }

  function extractUrl(postEl) {
    const main = findMainStoryContainer(postEl) || postEl;
    const timeLink =
      main.querySelector("a[aria-hidden='true'][href*='facebook.com']") ||
      postEl.querySelector("a[aria-hidden='true'][href*='facebook.com']");
    return timeLink?.href || location.href;
  }

  function extractText(postEl) {
    const main = findMainStoryContainer(postEl) || postEl;
    const nodes = main.querySelectorAll("div[dir='auto'], span[dir='auto']");
    const parts = [];
    for (const s of nodes) {
      if (isProbablyInComments(s)) continue;
      if (s.closest('[role="button"]')) continue;
      const t = safeText(s.innerText || "");
      if (t.length > 0) parts.push(t);
    }
    return parts.join(" ").trim();
  }

  function extractAuthor(postEl) {
    const main = findMainStoryContainer(postEl) || postEl;
    const strongLink =
      main.querySelector("strong a[role='link']") ||
      postEl.querySelector("strong a[role='link']");
    return safeText(strongLink?.innerText || "Unknown");
  }

  function extractPostTime(postEl) {
    const main = findMainStoryContainer(postEl) || postEl;
    const timeEl =
      main.querySelector("a[aria-hidden='true'] abbr, a[aria-hidden='true'] span") ||
      postEl.querySelector("a[aria-hidden='true'] abbr, a[aria-hidden='true'] span");
    return timeEl?.getAttribute("data-tooltip-content") || new Date().toISOString();
  }

  function onFloatButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (fbPickMode) { exitPickMode(true); } else { enterPickMode(); }
  }

  function initFacebook() {
    ensureFloatingButton();
    let scrollTid = null;
    window.addEventListener("scroll", () => {
      const b = document.getElementById(FB_FLOAT_BTN_ID);
      if (!b) return;
      b.classList.add("sm-scrolling");
      clearTimeout(scrollTid);
      scrollTid = setTimeout(() => b.classList.remove("sm-scrolling"), 160);
    }, { passive: true });
    new MutationObserver(() => ensureFloatingButton()).observe(document.body, { childList: true, subtree: true });
  }

  initFacebook();
})();