const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildStoreSmokeRoutes,
  buildTieredAuditSummary,
  getDeepDiveReasons,
  normalizeProfile,
  selectDeepDiveCandidates,
} = require("../lib/tiered-audit");

test("audit profile parsing is explicit", () => {
  assert.equal(normalizeProfile("store"), "store");
  assert.equal(normalizeProfile("FULL"), "full");
  assert.throws(() => normalizeProfile("client-x"), /AUDIT_PROFILE/);
});

test("store smoke routes stay inside the supplied location base", () => {
  const routes = buildStoreSmokeRoutes(
    "https://app.gohighlevel.com/v2/location/loc_123",
    (url) => url
  );

  assert.ok(routes.length >= 5);
  assert.ok(routes.every((route) => route.url.startsWith("https://app.gohighlevel.com/v2/location/loc_123/")));
  assert.ok(routes.some((route) => route.url.endsWith("/funnels-websites/stores")));
  assert.ok(routes.some((route) => route.url.endsWith("/payments/products")));
});

test("deep dive reasons focus on actionable store audit signals", () => {
  const reasons = getDeepDiveReasons({
    ok: false,
    shutoff: false,
    issues: [{ type: "page_timeout", text: "thin page" }, { type: "error", text: "console boom" }],
    pageData: {
      stats: { overflowX: true },
      images: [{ src: "https://example.test/missing.png", width: 0, height: 0 }],
      fields: [{ required: true, label: "", placeholder: "", name: "" }],
    },
  });

  assert.ok(reasons.includes("page did not load cleanly"));
  assert.ok(reasons.includes("slow or thin page content"));
  assert.ok(reasons.includes("console errors detected"));
  assert.ok(reasons.includes("horizontal overflow detected"));
  assert.ok(reasons.includes("1 image(s) may be broken"));
  assert.ok(reasons.includes("1 required field(s) lack labels"));
});

test("deep dive candidates are ranked and limited", () => {
  const records = [
    { name: "ok", url: "https://example.test/ok", ok: true, issues: [], pageData: { stats: {} } },
    { name: "timeout", url: "https://example.test/timeout", ok: false, issues: [{ type: "page_timeout" }], pageData: { stats: {} } },
    { name: "overflow", url: "https://example.test/overflow", ok: true, issues: [], pageData: { stats: { overflowX: true } } },
  ];

  const candidates = selectDeepDiveCandidates(records, 1);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "timeout");

  const summary = buildTieredAuditSummary(records, 5);
  assert.equal(summary.profile, "store");
  assert.equal(summary.smokePages, 3);
  assert.equal(summary.deepDiveCandidates.length, 2);
});
