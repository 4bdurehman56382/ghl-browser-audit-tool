const STORE_SMOKE_ROUTES = [
  { name: "stores", path: "/funnels-websites/stores" },
  { name: "products", path: "/payments/products" },
  { name: "orders", path: "/payments/orders" },
  { name: "transactions", path: "/payments/transactions" },
  { name: "domains", path: "/funnels-websites/domains" },
  { name: "analytics", path: "/funnels-websites/analytics" },
  { name: "url redirects", path: "/funnels-websites/url-redirects" },
];

const DEFAULT_DEEP_DIVE_LIMIT = 12;

function normalizeProfile(value) {
  const profile = String(value || "full").trim().toLowerCase();
  if (["full", "store"].includes(profile)) return profile;
  throw new Error("AUDIT_PROFILE must be either full or store.");
}

function buildStoreSmokeRoutes(base, normalizeUrl) {
  if (!base) return [];
  return STORE_SMOKE_ROUTES.map((route) => ({
    name: `store smoke > ${route.name}`,
    url: normalizeUrl(base + route.path),
  }));
}

function getIssueTypes(record) {
  return (record?.issues || [])
    .map((issue) => String(issue?.type || "").trim())
    .filter(Boolean);
}

function getDeepDiveReasons(record) {
  const reasons = [];
  const pageData = record?.pageData || {};
  const stats = pageData.stats || {};
  const issueTypes = getIssueTypes(record);

  if (!record?.ok && !record?.shutoff) reasons.push("page did not load cleanly");
  if (record?.shutoff) reasons.push("feature appears unavailable");
  if (issueTypes.includes("page_timeout")) reasons.push("slow or thin page content");
  if (issueTypes.includes("navigation_error")) reasons.push("navigation failed");
  if (issueTypes.includes("pageerror")) reasons.push("runtime page error");
  if (issueTypes.includes("error")) reasons.push("console errors detected");
  if (stats.overflowX) reasons.push("horizontal overflow detected");

  const images = Array.isArray(pageData.images) ? pageData.images : [];
  const brokenImages = images.filter((img) => (img.src || "") && (!img.width || !img.height)).length;
  if (brokenImages > 0) reasons.push(`${brokenImages} image(s) may be broken`);

  const fields = Array.isArray(pageData.fields) ? pageData.fields : [];
  const requiredFieldsWithoutLabels = fields.filter((field) => field.required && !field.label && !field.placeholder && !field.name).length;
  if (requiredFieldsWithoutLabels > 0) reasons.push(`${requiredFieldsWithoutLabels} required field(s) lack labels`);

  return [...new Set(reasons)];
}

function scoreDeepDive(record) {
  const reasons = getDeepDiveReasons(record);
  let score = reasons.length;
  if (!record?.ok && !record?.shutoff) score += 3;
  if (getIssueTypes(record).includes("navigation_error")) score += 3;
  if (getIssueTypes(record).includes("page_timeout")) score += 2;
  if (record?.pageData?.stats?.overflowX) score += 1;
  return score;
}

function selectDeepDiveCandidates(records, limit = DEFAULT_DEEP_DIVE_LIMIT) {
  return (records || [])
    .map((record) => ({
      name: record.name,
      url: record.url,
      score: scoreDeepDive(record),
      reasons: getDeepDiveReasons(record),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}

function buildTieredAuditSummary(records, limit = DEFAULT_DEEP_DIVE_LIMIT) {
  const candidates = selectDeepDiveCandidates(records, limit);
  return {
    profile: "store",
    strategy: "smoke-first, signal-based deep dive",
    smokePages: (records || []).length,
    deepDiveCandidates: candidates,
  };
}

module.exports = {
  DEFAULT_DEEP_DIVE_LIMIT,
  STORE_SMOKE_ROUTES,
  buildStoreSmokeRoutes,
  buildTieredAuditSummary,
  getDeepDiveReasons,
  normalizeProfile,
  scoreDeepDive,
  selectDeepDiveCandidates,
};
