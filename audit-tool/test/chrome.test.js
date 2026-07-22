const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { findChrome, isLocalCdpUrl } = require("../lib/chrome");

test("CDP URL guard only allows local HTTP endpoints", () => {
  assert.equal(isLocalCdpUrl("http://127.0.0.1:9222"), true);
  assert.equal(isLocalCdpUrl("http://localhost:9222"), true);
  assert.equal(isLocalCdpUrl("https://127.0.0.1:9222"), false);
  assert.equal(isLocalCdpUrl("http://example.com:9222"), false);
  assert.equal(isLocalCdpUrl("not a url"), false);
});

test("findChrome validates explicit CHROME_PATH", () => {
  const oldChromePath = process.env.CHROME_PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-tool-chrome-"));
  const chrome = path.join(dir, "chrome");
  fs.writeFileSync(chrome, "");

  try {
    process.env.CHROME_PATH = chrome;
    assert.equal(findChrome(), path.resolve(chrome));

    process.env.CHROME_PATH = path.join(dir, "missing");
    assert.throws(() => findChrome(), /CHROME_PATH does not exist/);
  } finally {
    if (oldChromePath === undefined) {
      delete process.env.CHROME_PATH;
    } else {
      process.env.CHROME_PATH = oldChromePath;
    }
  }
});
