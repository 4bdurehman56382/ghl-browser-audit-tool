const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");
const { CDP_URL } = require("./lib/chrome");
const { getDefaultContext } = require("./lib/browser-context");
const { parsePositiveInteger } = require("./lib/config");
const { isSafeReadOnlyUrl, normalizeGhlUrl, safeNameFromUrl } = require("./lib/safety");

const OUT = outputPath("deep-ghl-audit");
const SHOTS = path.join(OUT, "screenshots");

fs.mkdirSync(SHOTS, { recursive: true });

const seeds = [
  "/dashboard",
  "/ask-ai",
  "/conversations/conversations",
  "/calendars/view",
  "/contacts/smart_list/All",
  "/opportunities/list",
  "/payments/proposals-estimates",
  "/payments/invoices",
  "/payments/orders",
  "/payments/subscriptions",
  "/payments/transactions",
  "/payments/products",
  "/payments/settings",
  "/vibe",
  "/ai-agents/getting-started",
  "/marketing/social-planner",
  "/marketing/emails",
  "/marketing/templates",
  "/marketing/affiliate-manager",
  "/automation/workflows",
  "/funnels-websites/funnels",
  "/funnels-websites/websites",
  "/funnels-websites/stores",
  "/funnels-websites/forms",
  "/funnels-websites/surveys",
  "/funnels-websites/chat-widget",
  "/funnels-websites/url-redirects",
  "/funnels-websites/domains",
  "/memberships/client-portal/dashboard",
  "/memberships/courses/products",
  "/memberships/communities/groups",
  "/memberships/certificates",
  "/media-storage",
  "/reputation/overview",
  "/reputation/reviews",
  "/reputation/listings",
  "/reporting/reports",
  "/reporting/call-reporting",
  "/reporting/attribution-report",
  "/reporting/google-ads",
  "/reporting/facebook-ads",
  "/integration",
  "/settings/profile",
  "/settings/company",
  "/settings/my-staff",
  "/settings/calendars",
  "/settings/phone_numbers",
  "/settings/email-services",
  "/settings/domains",
  "/settings/tags",
  "/settings/custom-fields",
  "/settings/custom-values",
  "/settings/pipelines",
  "/settings/objects",
];

function normalizeUrl(url, base) {
  return normalizeGhlUrl(url, base);
}

function safeName(url) {
  return safeNameFromUrl(url, 100);
}

function shouldVisit(url, base) {
  return isSafeReadOnlyUrl(normalizeUrl(url, base), { base });
}

async function extractFacts(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const sample = (selector, mapper, limit = 100) =>
      [...document.querySelectorAll(selector)].filter(visible).slice(0, limit).map(mapper);
    const elementText = (el) => clean(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "");
    const tableLike = sample("table, [role='table'], .n-data-table, .hl-table", (el) => elementText(el).slice(0, 2500), 12);
    const links = sample("a[href]", (el) => ({
      text: elementText(el).slice(0, 160),
      href: el.href || el.getAttribute("href") || "",
    }), 260);

    return {
      url: location.href,
      title: document.title,
      h: sample("h1,h2,h3,[role='heading']", (el) => elementText(el).slice(0, 180), 80),
      buttons: sample("button,[role='button'],input[type='button'],input[type='submit']", (el) => ({
        text: elementText(el).slice(0, 160),
        disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
      }), 220),
      fields: sample("input,select,textarea", (el) => ({
        type: el.getAttribute("type") || el.tagName.toLowerCase(),
        name: el.getAttribute("name") || "",
        placeholder: el.getAttribute("placeholder") || "",
        label: el.getAttribute("aria-label") || "",
        valuePresent: Boolean(el.value),
        required: Boolean(el.required) || el.getAttribute("aria-required") === "true",
      }), 120),
      links,
      tableLike,
      body: clean(document.body.innerText).slice(0, 16000),
      stats: {
        linkCount: document.querySelectorAll("a[href]").length,
        buttonCount: document.querySelectorAll("button,[role='button']").length,
        fieldCount: document.querySelectorAll("input,select,textarea").length,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      },
    };
  });
}

async function main() {
  const locationId = requireLocationId();
  const base = `https://app.gohighlevel.com/v2/location/${locationId}`;
  const maxPages = parsePositiveInteger(process.env.MAX_PAGES, 120, "MAX_PAGES");
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = getDefaultContext(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const queue = seeds.map((routePath) => ({ url: normalizeUrl(base + routePath, base), depth: 0, seed: true }));
  const visited = new Set();
  const records = [];
  const networkIssues = [];

  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (url.includes("gohighlevel") && status >= 400) {
      networkIssues.push({ status, url: url.slice(0, 220) });
    }
  });
  page.on("pageerror", (error) => networkIssues.push({ status: "pageerror", url: error.message.slice(0, 220) }));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      networkIssues.push({ status: message.type(), url: message.text().slice(0, 220) });
    }
  });

  while (queue.length && records.length < maxPages) {
    const item = queue.shift();
    const url = normalizeUrl(item.url, base);
    if (!shouldVisit(url, base) || visited.has(url)) continue;
    visited.add(url);

    const beforeIssues = networkIssues.length;
    const record = {
      url,
      depth: item.depth,
      seed: item.seed,
      ok: false,
      capturedAt: new Date().toISOString(),
      screenshot: "",
      facts: {},
      issues: [],
    };

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(6500);
      record.facts = await extractFacts(page);
      const shot = path.join(SHOTS, `${String(records.length + 1).padStart(3, "0")}-${safeName(url)}.png`);
      await page.screenshot({ path: shot, fullPage: true, timeout: 20000 }).catch((error) => {
        record.issues.push({ type: "screenshot", message: error.message });
      });
      if (fs.existsSync(shot)) record.screenshot = path.relative(process.cwd(), shot);
      record.ok = true;

      const internalLinks = (record.facts.links || [])
        .map((x) => normalizeUrl(x.href, base))
        .filter((link) => shouldVisit(link, base));
      for (const link of internalLinks) {
        if (!visited.has(link) && item.depth < 1 && queue.length + records.length < maxPages) {
          queue.push({ url: link, depth: item.depth + 1, seed: false });
        }
      }
    } catch (error) {
      record.issues.push({ type: "navigation", message: error.message });
    }

    record.issues.push(...networkIssues.slice(beforeIssues, beforeIssues + 30));
    records.push(record);
    console.log(`${records.length}/${maxPages} ${record.ok ? "ok" : "err"} ${url}`);
  }

  await page.close().catch(() => {});
  browser.disconnect();

  const jsonPath = path.join(OUT, "deep-crawl.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ records, networkIssues }, null, 2));

  const summary = [
    "# Deep GHL Read-Only Crawl Summary",
    "",
    `Captured: ${new Date().toISOString()}`,
    `Pages captured: ${records.length}`,
    "",
    ...records.flatMap((r, i) => [
      `## ${i + 1}. ${safeName(r.url)}`,
      "",
      `URL: ${r.url}`,
      `Screenshot: ${r.screenshot || "[not captured]"}`,
      `OK: ${r.ok}`,
      "",
      "Headings:",
      ...((r.facts.h || []).slice(0, 20).map((x) => `- ${x}`)),
      "",
      "Visible body sample:",
      (r.facts.body || "").slice(0, 2000),
      "",
      "Visible buttons/actions:",
      ...((r.facts.buttons || []).slice(0, 40).map((b) => `- ${b.text || "[unlabeled]"}${b.disabled ? " (disabled)" : ""}`)),
      "",
      "Fields sample:",
      ...((r.facts.fields || []).slice(0, 30).map((f) => `- ${f.type} ${f.label || f.placeholder || f.name || "[unlabeled]"}${f.required ? " required" : ""}`)),
      "",
      `Horizontal overflow: ${Boolean(r.facts.stats?.overflowX)}`,
      `Issues observed during page: ${r.issues.length}`,
      "",
    ]),
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "deep-crawl-summary.md"), summary);
  console.log(`Wrote ${jsonPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}

module.exports = { extractFacts, main, normalizeUrl, safeName, shouldVisit };
