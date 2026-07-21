const assert = require("node:assert/strict");
const test = require("node:test");

const { buildHtmlReport, issueText } = require("../lib/report-pdf");

test("issueText prefers scanner issue text", () => {
  assert.equal(issueText({ type: "warning", text: "actual scanner text" }), "actual scanner text");
  assert.equal(issueText({ type: "warning", message: "message text" }), "message text");
});

test("HTML report escapes dynamic page content and includes issue text", () => {
  const html = buildHtmlReport({
    pages: [
      {
        name: "<script>alert(1)</script>",
        url: "https://app.gohighlevel.com/v2/location/abc/dashboard",
        ok: false,
        shutoff: false,
        bodyText: "<img src=x onerror=alert(1)>",
        issues: [{ type: "pageerror", text: "actual scanner text" }],
        screenshots: [],
      },
    ],
    workflows: [],
  }, "abc");

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /actual scanner text/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
