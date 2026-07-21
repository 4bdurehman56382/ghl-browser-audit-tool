const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isSafeReadOnlyUrl,
  normalizeGhlUrl,
  safeFileName,
  safeNameFromUrl,
} = require("../lib/safety");

const base = "https://app.gohighlevel.com/v2/location/abc123";

test("normalizeGhlUrl strips volatile UI params and hash", () => {
  const url = normalizeGhlUrl("/dashboard?modal=1&drawer=2&keep=yes#panel", base);
  assert.equal(url, `${base}/dashboard?keep=yes`);
});

test("read-only URL safety stays inside the exact location scope", () => {
  assert.equal(isSafeReadOnlyUrl(`${base}/dashboard`, { base }), true);
  assert.equal(isSafeReadOnlyUrl("https://app.gohighlevel.com/v2/location/abc1234/dashboard", { base }), false);
  assert.equal(isSafeReadOnlyUrl("https://evil.example/v2/location/abc123/dashboard", { base }), false);
});

test("read-only URL safety rejects risky actions", () => {
  for (const term of ["logout", "delete", "disconnect", "oauth", "export", "import", "webhook"]) {
    assert.equal(isSafeReadOnlyUrl(`${base}/settings/${term}`, { base }), false, term);
  }
});

test("safe file names remove secrets and odd characters", () => {
  assert.equal(safeFileName("https://example.test/a weird/path?x=1", 40), "example-test-a-weird-path-x-1");
  assert.equal(safeNameFromUrl(`${base}/settings/custom-fields?modal=1`), "settings-custom-fields");
});
