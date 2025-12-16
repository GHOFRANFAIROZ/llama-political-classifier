// ================================
// X (Twitter) - Manual classify only (NO AUTO)
// Inject a 🤖 button on each tweet and classify on click.
// ================================

(function () {
  const ROBOT_BTN_ATTR = "data-anti-hate-robot-btn";
  const TOOLTIP_ATTR = "data-anti-hate-tooltip";

  function isX() {
    return location.hostname.includes("x.com") || location.hostname.includes("twitter.com");
  }

  if (!isX()) return;

  // -------- Helpers: extract tweet data --------
  function getTweetUrlFromArticle(article) {
    // Find any anchor that includes "/status/"
    const a = article.querySelector('a[href*="/status/"]');
    if (!a) return location.href;
    const href = a.getAttribute("href");
    if (!href) return location.href;
    return new URL(href, location.origin).toString();
  }

  function getTweetTextFromArticle(article) {
    const parts = Array.from(article.querySelectorAll('div[lang]'))
      .map((d) => (d.innerText || "").trim())
      .filter((t) => t.length > 0);
    return parts.join(" ").trim();
  }

  function getAuthorFromArticle(article) {
    // Try to find username area
    const userNameEl =
      article.querySelector('div[data-testid="User-Name"]') ||
      article.querySelector('div[data-testid="UserName"]') ||
      article.querySelector('div[data-testid="User-Name"] span') ||
      article.querySelector('div[data-testid="UserName"] span');

    // fallback: first "a" that goes to profile
    const profileLink = article.querySelector('a[href^="/"][role="link"]');

    const txt = (userNameEl?.innerText || profileLink?.innerText || "").trim();
    return txt || "Unknown";
  }

  function getPostTimeFromArticle(article) {
    const timeEl = article.querySelector("time");
    const dt = timeEl?.getAttribute("datetime");
    return dt || new Date().toISOString();
  }

  function findActionBar(article) {
    // In X, action buttons are typically within a div[data-testid="reply"] etc.
    // We try to locate the row containing reply/retweet/like.
    const likeBtn = article.querySelector('button[data-testid="like"]');
    if (likeBtn) return likeBtn.closest("div[role='group']") || likeBtn.parentElement;
    const group = article.querySelector("div[role='group']");
    return group || null;
  }

  // -------- UI: tooltip --------
  function removeExistingTooltip(article) {
    const old = article.querySelector(`[${TOOLTIP_ATTR}="1"]`);
    if (old) old.remove();
  }

  function showTooltip(article, text) {
    removeExistingTooltip(article);

    const tip = document.createElement("div");
    tip.setAttribute(TOOLTIP_ATTR, "1");
    tip.style.position = "absolute";
    tip.style.zIndex = "999999";
    tip.style.maxWidth = "360px";
    tip.style.background = "rgba(255,255,255,0.95)";
    tip.style.border = "1px solid rgba(0,0,0,0.15)";
    tip.style.borderRadius = "10px";
    tip.style.padding = "10px 12px";
    tip.style.boxShadow = "0 6px 18px rgba(0,0,0,0.15)";
    tip.style.fontSize = "12px";
    tip.style.lineHeight = "1.35";
    tip.style.color = "#111";
    tip.style.whiteSpace = "pre-wrap";

    tip.textContent = text;

    // Place near top-right of the tweet
    const rect = article.getBoundingClientRect();
    tip.style.top = `${window.scrollY + rect.top + 8}px`;
    tip.style.left = `${window.scrollX + rect.right - 380}px`;

    document.body.appendChild(tip);

    // Auto-hide after 7 seconds
    setTimeout(() => {
      if (tip && tip.parentNode) tip.remove();
    }, 7000);
  }

  // -------- Create robot button --------
  function createRobotButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(ROBOT_BTN_ATTR, "1");
    btn.title = "تصنيف هذه التغريدة";
    btn.style.cursor = "pointer";
    btn.style.border = "none";
    btn.style.background = "transparent";
    btn.style.fontSize = "16px";
    btn.style.marginLeft = "6px";
    btn.style.padding = "4px 6px";
    btn.style.borderRadius = "8px";

    // simple hover effect
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "rgba(29,155,240,0.12)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
    });

    btn.textContent = "🤖";
    return btn;
  }

  async function classifyArticle(article) {
    const payload = {
      url: getTweetUrlFromArticle(article),
      text: getTweetTextFromArticle(article),
      author: getAuthorFromArticle(article),
      post_time: getPostTimeFromArticle(article),
      source: "extension"
    };

    showTooltip(article, "⏳ جاري التصنيف...");

    try {
      const resp = await chrome.runtime.sendMessage({ type: "classifyPost", payload });
      if (!resp?.ok) throw new Error(resp?.error || "Request failed");

      const label = resp.result?.label || "Other";
      const reason = resp.result?.reason || "";
      showTooltip(article, `${label}\n${reason}`);
    } catch (e) {
      console.error("Classification error:", e);
      showTooltip(article, "⚠️ فشل التصنيف. تأكدي أن السيرفر شغال.");
    }
  }

  function injectButtons() {
    const articles = document.querySelectorAll("article");
    for (const article of articles) {
      const actionBar = findActionBar(article);
      if (!actionBar) continue;

      // Already has robot?
      if (actionBar.querySelector(`[${ROBOT_BTN_ATTR}="1"]`)) continue;

      const btn = createRobotButton();
      btn.addEventListener("click", () => classifyArticle(article));

      // Append at end of action bar
      actionBar.appendChild(btn);
    }
  }

  // Run now + observe new tweets while scrolling
  injectButtons();
  const obs = new MutationObserver(() => injectButtons());
  obs.observe(document.body, { childList: true, subtree: true });
})();
