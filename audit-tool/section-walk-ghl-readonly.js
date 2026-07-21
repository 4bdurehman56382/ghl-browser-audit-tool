const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath } = require("./audit-paths");

const OUT = outputPath("section-walk");
fs.mkdirSync(OUT, { recursive: true });

const sections = ["Dashboard", "Opportunities", "Sites", "Marketing", "Automation", "Reputation", "Reporting"];

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
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().includes("app.gohighlevel.com/v2/location/"));
  if (!page) throw new Error("No GHL location page found");

  const records = [];
  for (const section of sections) {
    const item = page.getByText(section, { exact: true }).first();
    await item.click({ timeout: 10000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3500);
    await page.setViewportSize({ width: 1440, height: 1000 });
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
  await browser.close();
  console.log(`Captured ${records.length} sections`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
