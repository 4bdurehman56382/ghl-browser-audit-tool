const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");

const OUT = outputPath("deep-ghl-audit", "funnel-tabs");
fs.mkdirSync(OUT, { recursive: true });

function loadFunnels() {
  const configPath = process.env.GHL_FUNNELS_JSON;
  if (!configPath) {
    throw new Error("Set GHL_FUNNELS_JSON to a JSON file containing [{ name, funnelId, stepId }].");
  }
  return JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
}

const funnels = loadFunnels();

const LOCATION_ID = requireLocationId();
const BASE = `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/funnels-websites/funnels`;
const routeParts = ["overview", "products", "publishing", "stats", "sales", "security", "events", "settings"];

function safe(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function body(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 12000));
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const records = [];

  for (const funnel of funnels) {
    for (const part of routeParts) {
      let url;
      if (["overview", "products", "publishing"].includes(part)) {
        url = `${BASE}/${funnel.funnelId}/steps/${funnel.stepId}/${part}`;
      } else {
        url = `${BASE}/${funnel.funnelId}/${part}`;
      }
      const name = `${safe(funnel.name)}-${part}`;
      const rec = { funnel: funnel.name, part, url, ok: false, screenshot: "", body: "" };
      try {
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
  fs.writeFileSync(path.join(OUT, "funnel-tabs.json"), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(OUT, "funnel-tabs-summary.md"), records.flatMap((r) => [
    `# ${r.funnel} / ${r.part}`,
    `URL: ${r.url}`,
    `Screenshot: ${r.screenshot}`,
    "",
    r.body.slice(0, 2500),
    "",
  ]).join("\n"));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
