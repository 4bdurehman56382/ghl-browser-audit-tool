const assert = require("node:assert/strict");
const test = require("node:test");

const { WORKFLOW_SELECTORS } = require("../lib/workflows");

test("workflow selectors are valid DOM CSS selectors", () => {
  for (const selector of WORKFLOW_SELECTORS) {
    assert.doesNotThrow(() => documentlessSelectorCheck(selector), selector);
  }
});

function documentlessSelectorCheck(selector) {
  if (selector.includes(":has-text(")) {
    throw new Error("Playwright-only selector is not valid for document.querySelectorAll");
  }
  // This catches syntax errors without needing a browser DOM implementation.
  new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
