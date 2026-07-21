const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");
const { CDP_URL } = require("./lib/chrome");
const { getDefaultContext } = require("./lib/browser-context");
const { isSafeReadOnlyUrl } = require("./lib/safety");

const OUT = outputPath("section-walk");
fs.mkdirSync(OUT, { recursive: true });

const sections = [
  ["Dashboard", "/dashboard"],
  ["Opportunities", "/opportunities/list"],
  ["Sites", "/funnels-websites/funnels"],
  ["Marketing", "/marketing/social-planner"],
  ["Automation", "/automation/workflows"],
  ["Reputation", "/reputation/overview"],
  ["Reporting", "/reporting/reports"],
];

const safe = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function facts(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const texts = (sel, limit = 120) => [...document.querySelectorAll(sel)]
      .filter(visible)
      .slice(0, limit)
      .map((el) => clean(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title")));
    return {
      url: location.href,
      title: document.title,
      h: texts("h1,h2,h3,[role='heading']", 60),
      buttons: texts("button,[role='button'],a", 160),
      body: clean(document.body.innerText).slice(0, 10000),
    };
  });
}

async function main() {
  const locationId = requireLocationId();
  const base = `https://app.gohighlevel.com/v2/location/${locationId}`;
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = getDefaultContext(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const records = [];
  for (const [section, route] of sections) {
    const url = base + route;
    if (!isSafeReadOnlyUrl(url, { base })) {
      records.push({ section, url, error: "Route failed read-only safety validation" });
      continue;
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const file = path.join(OUT, `${safe(section)}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    const record = { section, screenshot: path.relative(process.cwd(), file), ...(await facts(page).catch((e) => ({ error: e.message }))) };
    records.push(record);
  }

  fs.writeFileSync(path.join(OUT, "section-walk.json"), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(OUT, "section-walk-summary.md"), records.flatMap((r) => [
    `# ${r.section}`,
    "",
    `URL: ${r.url}`,
    `Screenshot: ${r.screenshot}`,
    "",
    "Headings:",
    ...(r.h || []).slice(0, 25).map((x) => `- ${x}`),
    "",
    "Visible body sample:",
    (r.body || "").slice(0, 1800),
    "",
  ]).join("\n"));
  await page.close().catch(() => {});
  browser.disconnect();
  console.log(`Captured ${records.length} sections`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}

module.exports = { facts, main, sections };
