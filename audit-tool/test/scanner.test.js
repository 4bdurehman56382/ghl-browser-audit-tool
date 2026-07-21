const assert = require("node:assert/strict");
const test = require("node:test");

const { isPageMeaningful, safeName, waitForPageReady } = require("../lib/scanner");

test("safeName strips location IDs from screenshot names", () => {
  assert.equal(
    safeName("https://app.gohighlevel.com/v2/location/abc123/settings/custom-fields?modal=1"),
    "settings-custom-fields"
  );
});

test("isPageMeaningful uses visible body length", () => {
  assert.equal(isPageMeaningful("short", 10), false);
  assert.equal(isPageMeaningful("long enough text", 10), true);
});

test("waitForPageReady returns loaded when a SPA becomes meaningful", async () => {
  const bodies = ["Loading", "Still loading", "Dashboard ready with enough useful content"];
  const page = {
    evaluate: async () => {
      const body = bodies.shift() || "Dashboard ready with enough useful content";
      return { bodyText: body, title: "Dashboard", bodyLength: body.length };
    },
  };

  const result = await waitForPageReady(page, "/dashboard", 20, {
    timeoutMs: 500,
    sleep: async () => {},
  });

  assert.equal(result.status, "loaded");
  assert.equal(result.checks, 3);
  assert.match(result.bodyText, /Dashboard ready/);
});
