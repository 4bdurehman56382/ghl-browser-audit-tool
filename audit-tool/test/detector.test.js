const assert = require("node:assert/strict");
const test = require("node:test");

const { detectShutoff } = require("../lib/detector");

function fakePage({ url = "https://app.gohighlevel.com/v2/location/abc/dashboard", body = "", title = "" }) {
  return {
    url: () => url,
    evaluate: async () => ({
      bodyText: body.replace(/\s+/g, " ").trim().slice(0, 8000),
      title,
      bodyLength: body.replace(/\s+/g, " ").trim().length,
    }),
  };
}

test("detects strong admin shutoff signals", async () => {
  const result = await detectShutoff(fakePage({ body: "Access denied. You are not authorized to view this feature." }));
  assert.equal(result.shutoff, true);
  assert.equal(result.type, "access_denied");
});

test("detects login redirects before empty-body classification", async () => {
  const result = await detectShutoff(fakePage({ url: "https://app.gohighlevel.com/login", body: "" }));
  assert.equal(result.shutoff, true);
  assert.equal(result.type, "redirected_to_login");
});

test("can avoid classifying a slow blank page as admin shutoff", async () => {
  const result = await detectShutoff(fakePage({ body: "" }), { detectEmpty: false });
  assert.equal(result.shutoff, false);
});

test("detects maintenance and billing states", async () => {
  assert.equal((await detectShutoff(fakePage({ body: "Payment required. Update billing." }))).type, "billing_issue");
  assert.equal((await detectShutoff(fakePage({ body: "The system is down for maintenance." }))).type, "maintenance");
});
