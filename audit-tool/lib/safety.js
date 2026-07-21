const DEFAULT_DENY_TERMS = [
  "signout",
  "logout",
  "delete",
  "remove",
  "disconnect",
  "unsubscribe",
  "checkout",
  "purchase",
  "impersonate",
  "oauth",
  "callback",
  "export",
  "import",
  "webhook",
];

const DEFAULT_IGNORED_PARAMS = ["modal", "drawer", "showModal", "preview"];

function normalizeGhlUrl(url, base, ignoredParams = DEFAULT_IGNORED_PARAMS) {
  try {
    const raw = String(url || "");
    const baseUrl = new URL(base || "https://app.gohighlevel.com/");
    let normalized;
    if (/^https?:\/\//i.test(raw)) {
      normalized = new URL(raw);
    } else if (raw.startsWith("/v2/")) {
      normalized = new URL(raw, baseUrl.origin);
    } else if (raw.startsWith("/") && baseUrl.pathname.includes("/v2/location/")) {
      normalized = new URL(`${baseUrl.pathname.replace(/\/$/, "")}${raw}`, baseUrl.origin);
    } else {
      const childBase = baseUrl.toString().endsWith("/") ? baseUrl.toString() : `${baseUrl.toString()}/`;
      normalized = new URL(raw, childBase);
    }
    normalized.hash = "";
    for (const param of ignoredParams) normalized.searchParams.delete(param);
    return normalized.toString();
  } catch {
    return "";
  }
}

function isSafeReadOnlyUrl(url, options = {}) {
  const {
    base = "https://app.gohighlevel.com/",
    allowedOrigin = "https://app.gohighlevel.com",
    denyTerms = DEFAULT_DENY_TERMS,
  } = options;

  if (!url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.origin !== allowedOrigin) return false;
  if (base) {
    const baseUrl = new URL(base, allowedOrigin).toString();
    const childBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const current = parsed.toString();
    if (current !== baseUrl && !current.startsWith(childBase)) return false;
  }

  const haystack = decodeURIComponent(`${parsed.pathname}?${parsed.searchParams}`).toLowerCase();
  return !denyTerms.some((term) => haystack.includes(term.toLowerCase()));
}

function safeFileName(value, maxLength = 100) {
  return String(value || "")
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .toLowerCase() || "page";
}

function safeNameFromUrl(url, maxLength = 100) {
  try {
    const parsed = new URL(url);
    return safeFileName(parsed.pathname.replace(/\/v2\/location\/[^/]+\//, "") || "root", maxLength);
  } catch {
    return safeFileName(url, maxLength);
  }
}

module.exports = {
  DEFAULT_DENY_TERMS,
  DEFAULT_IGNORED_PARAMS,
  isSafeReadOnlyUrl,
  normalizeGhlUrl,
  safeFileName,
  safeNameFromUrl,
};
