const SHUTOFF_SIGNALS = [
  { type: "access_denied", patterns: [/access denied/i, /not authorized/i, /forbidden/i, /unauthorized/i] },
  { type: "subscription_expired", patterns: [/subscription.*expired/i, /subscription.*required/i, /upgrade your plan/i, /upgrade your account/i] },
  { type: "billing_issue", patterns: [/billing.*required/i, /payment.*required/i, /card.*declined/i, /update.*billing/i] },
  { type: "account_suspended", patterns: [/account.*suspended/i, /account.*disabled/i, /account.*deactivated/i, /account.*locked/i] },
  { type: "feature_disabled", patterns: [/feature.*disabled/i, /feature.*not available/i, /this feature.*unavailable/i] },
  { type: "page_not_found", patterns: [/page not found/i, /404/i, /not found/i, /doesn.t exist/i] },
  { type: "redirected_to_login", patterns: [] },
  { type: "empty_body", patterns: [] },
  { type: "maintenance", patterns: [/maintenance/i, /down for/i, /under construction/i, /coming soon/i] },
];

async function extractReadableContent(page) {
  try {
    return await page.evaluate(() => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      return {
        bodyText: clean(document.body.innerText).slice(0, 8000),
        title: document.title || "",
        bodyLength: clean(document.body.innerText).length,
      };
    });
  } catch {
    return { bodyText: "", title: "", bodyLength: 0 };
  }
}

async function detectShutoff(page, options = {}) {
  const { detectEmpty = true } = options;
  const url = page.url().toLowerCase();
  const content = await extractReadableContent(page);

  if (url.includes("login") || url.includes("signin") || url.includes("sign-in")) {
    return { shutoff: true, reason: "Page redirected to login", type: "redirected_to_login" };
  }

  const combined = (content.bodyText + " " + content.title).toLowerCase();

  for (const signal of SHUTOFF_SIGNALS) {
    if (signal.patterns.length === 0) continue;
    for (const pattern of signal.patterns) {
      if (pattern.test(combined)) {
        return { shutoff: true, reason: `Detected signal: ${signal.type}`, type: signal.type };
      }
    }
  }

  if (detectEmpty && content.bodyLength < 50) {
    return { shutoff: true, reason: "Empty or near-empty page body", type: "empty_body" };
  }

  return { shutoff: false, reason: null, type: null };
}

async function isAdminShutoff(page, options) {
  const result = await detectShutoff(page, options);
  return result.shutoff;
}

module.exports = { detectShutoff, isAdminShutoff, extractReadableContent };
