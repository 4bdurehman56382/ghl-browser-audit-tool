const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");
const { CDP_URL } = require("./lib/chrome");
const { getDefaultContext } = require("./lib/browser-context");
const { isSafeReadOnlyUrl } = require("./lib/safety");

const OUT = outputPath("deep-ghl-audit", "targeted");
fs.mkdirSync(OUT, { recursive: true });

const routes = [
  ["ai-voice-ai", "/ai-agents/voice-ai"],
  ["ai-conversation-ai", "/ai-agents/conversation-ai"],
  ["ai-knowledge-base", "/ai-agents/knowledge-base"],
  ["ai-agent-templates", "/ai-agents/agent-templates"],
  ["ai-content-ai", "/ai-agents/content-ai"],
  ["ai-agent-logs", "/ai-agents/agent-logs"],
  ["ask-ai", "/ask-ai"],
  ["calendar-settings-main", "/calendars/settings"],
  ["calendar-appointment-list", "/calendars/appointments"],
  ["settings-calendar-preferences", "/settings/calendars/preferences"],
  ["settings-calendar-availability", "/settings/calendars/availability"],
  ["settings-calendar-connections", "/settings/calendars/connections"],
  ["automation-workflows", "/automation/workflows"],
  ["automation-folders", "/automation/workflows/folders"],
  ["marketing-trigger-links", "/marketing/trigger-links"],
  ["sites-blogs", "/funnels-websites/blogs"],
  ["sites-analytics", "/funnels-websites/analytics"],
  ["sites-qr-codes", "/funnels-websites/qr-codes"],
  ["sites-client-portal", "/funnels-websites/client-portal"],
];

async function extract(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const texts = (sel, n = 100) => [...document.querySelectorAll(sel)].filter(visible).slice(0, n).map((el) => clean(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title")));
    return {
      url: location.href,
      title: document.title,
      headings: texts("h1,h2,h3,[role='heading']", 80),
      actions: texts("button,[role='button'],a", 180),
      body: clean(document.body.innerText).slice(0, 12000),
    };
  });
}

async function main() {
  const locationId = requireLocationId();
  const base = `https://app.gohighlevel.com/v2/location/${locationId}`;
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = getDefaultContext(browser);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const records = [];
  for (const [name, route] of routes) {
    const record = { name, url: base + route, ok: false, text: {}, screenshot: "" };
    try {
      if (!isSafeReadOnlyUrl(record.url, { base })) {
        throw new Error("Route failed read-only safety validation");
      }
      await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(15000);
      record.text = await extract(page);
      const shot = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: shot, fullPage: true, timeout: 20000 }).catch(() => {});
      if (fs.existsSync(shot)) record.screenshot = path.relative(process.cwd(), shot);
      record.ok = true;
      console.log(`ok ${name}`);
    } catch (error) {
      record.error = error.message;
      console.log(`err ${name}: ${error.message}`);
    }
    records.push(record);
  }
  await page.close().catch(() => {});
  browser.disconnect();
  fs.writeFileSync(path.join(OUT, "targeted-tabs.json"), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(OUT, "targeted-tabs-summary.md"), records.flatMap((r) => [
    `# ${r.name}`,
    `URL: ${r.url}`,
    `Screenshot: ${r.screenshot}`,
    "",
    (r.text.body || "").slice(0, 2500),
    "",
  ]).join("\n"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}

module.exports = { extract, main, routes };
