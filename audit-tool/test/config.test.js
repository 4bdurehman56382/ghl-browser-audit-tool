const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const {
  loadFunnels,
  loadRetryRoutes,
  optionalLocationId,
  parsePositiveInteger,
  requireLocationId,
  resolveOutputRoot,
} = require("../lib/config");

function tempJson(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-tool-test-"));
  const file = path.join(dir, "fixture.json");
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

test("location IDs are required and sanitized", () => {
  assert.equal(optionalLocationId({}), "");
  assert.equal(requireLocationId({ GHL_LOCATION_ID: "abc_123-XYZ" }), "abc_123-XYZ");
  assert.throws(() => requireLocationId({}), /Set GHL_LOCATION_ID/);
  assert.throws(() => optionalLocationId({ GHL_LOCATION_ID: "../secret" }), /may only contain/);
});

test("positive integer env parsing rejects NaN and zero", () => {
  assert.equal(parsePositiveInteger(undefined, 200, "MAX_PAGES"), 200);
  assert.equal(parsePositiveInteger("12", 200, "MAX_PAGES"), 12);
  assert.throws(() => parsePositiveInteger("abc", 200, "MAX_PAGES"), /MAX_PAGES/);
  assert.throws(() => parsePositiveInteger("0", 200, "MAX_PAGES"), /MAX_PAGES/);
});

test("relative output overrides resolve against the workspace root argument", () => {
  const root = resolveOutputRoot(
    { AUDIT_OUTPUT_DIR: "tmp-output" },
    "/unused/default",
    "/repo/root"
  );
  assert.equal(root, path.resolve("/repo/root/tmp-output"));
});

test("funnel JSON is schema-checked", () => {
  const validPath = tempJson([{ name: "Main Funnel", funnelId: "fun_123", stepId: "step_123" }]);
  assert.deepEqual(loadFunnels({ GHL_FUNNELS_JSON: validPath }), [
    { name: "Main Funnel", funnelId: "fun_123", stepId: "step_123" },
  ]);

  const badPath = tempJson([{ name: "Missing IDs" }]);
  assert.throws(() => loadFunnels({ GHL_FUNNELS_JSON: badPath }), /name, funnelId, and stepId/);
});

test("retry route JSON is schema-checked and normalized", () => {
  const validPath = tempJson([{ name: "slow-page", path: "/slow", expect: ["Ready"], minBody: 25 }]);
  assert.deepEqual(loadRetryRoutes({ GHL_RETRY_ROUTES_JSON: validPath }), [
    { name: "slow-page", path: "/slow", expect: ["Ready"], minBody: 25 },
  ]);

  const badPath = tempJson([{ name: "relative", path: "slow" }]);
  assert.throws(() => loadRetryRoutes({ GHL_RETRY_ROUTES_JSON: badPath }), /absolute path/);
});
