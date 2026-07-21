const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");
const { CDP_URL } = require("./lib/chrome");
const { getDefaultContext } = require("./lib/browser-context");
const { loadFunnels } = require("./lib/config");
const { isSafeReadOnlyUrl, safeFileName } = require("./lib/safety");

const OUT = outputPath("deep-ghl-audit", "funnel-tabs");
fs.mkdirSync(OUT, { recursive: true });

const routeParts = ["overview", "products", "publishing", "stats", "sales", "security", "events", "settings"];

function safe(value) {
  return safeFileName(value);
}

async function body(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 12000));
}

async function main() {
  const funnels = loadFunnels(process.env);
  const locationId = requireLocationId();
  const base = `https://app.gohighlevel.com/v2/location/${locationId}/funnels-websites/funnels`;

  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = getDefaultContext(browser);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const records = [];

  for (const funnel of funnels) {
    for (const part of routeParts) {
      let url;
      if (["overview", "products", "publishing"].includes(part)) {
        url = `${base}/${funnel.funnelId}/steps/${funnel.stepId}/${part}`;
      } else {
        url = `${base}/${funnel.funnelId}/${part}`;
      }
      const name = `${safe(funnel.name)}-${part}`;
      const rec = { funnel: funnel.name, part, url, ok: false, screenshot: "", body: "" };
      try {
        if (!isSafeReadOnlyUrl(url, { base })) {
          throw new Error("Route failed read-only safety validation");
        }
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(10000);
        rec.body = await body(page);
        const shot = path.join(OUT, `${name}.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
        if (fs.existsSync(shot)) rec.screenshot = path.relative(process.cwd(), shot);
        rec.ok = true;
        console.log(`ok ${name}`);
      } catch (error) {
        rec.error = error.message;
        console.log(`err ${name}: ${error.message}`);
      }
      records.push(rec);
    }
  }

  await page.close().catch(() => {});
  browser.disconnect();
  fs.writeFileSync(path.join(OUT, "funnel-tabs.json"), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(OUT, "funnel-tabs-summary.md"), records.flatMap((r) => [
    `# ${r.funnel} / ${r.part}`,
    `URL: ${r.url}`,
    `Screenshot: ${r.screenshot}`,
    "",
    r.body.slice(0, 2500),
    "",
  ]).join("\n"));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}

module.exports = { body, main, routeParts, safe };
