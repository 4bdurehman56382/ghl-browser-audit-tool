const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");

const LOCATION_ID = requireLocationId();
const BASE = `https://app.gohighlevel.com/v2/location/${LOCATION_ID}`;
const OUT = outputPath("deep-ghl-audit");
const SHOTS = path.join(OUT, "screenshots");
const MAX_PAGES = Number(process.env.MAX_PAGES || 120);

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

function normalizeUrl(url) {
  try {
    const u = new URL(url, BASE);
    u.hash = "";
    const badParams = ["modal", "drawer", "showModal"];
    for (const p of badParams) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return "";
  }
}

function safeName(url) {
  const u = new URL(url);
  return (u.pathname.replace(`/v2/location/${LOCATION_ID}/`, "") || "root")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .toLowerCase() || "page";
}

function shouldVisit(url) {
  if (!url) return false;
  if (!url.startsWith(BASE)) return false;
  const lower = url.toLowerCase();
  const deny = [
    "signout",
    "logout",
    "delete",
    "remove",
    "disconnect",
    "unsubscribe",
    "checkout",
    "purchase",
    "impersonate",
    "oauth",
    "callback",
    "export",
    "import",
  ];
  return !deny.some((x) => lower.includes(x));
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
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });

  const queue = seeds.map((path) => ({ url: normalizeUrl(BASE + path), depth: 0, seed: true }));
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

  while (queue.length && records.length < MAX_PAGES) {
    const item = queue.shift();
    const url = normalizeUrl(item.url);
    if (!shouldVisit(url) || visited.has(url)) continue;
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
        .map((x) => normalizeUrl(x.href))
        .filter(shouldVisit);
      for (const link of internalLinks) {
        if (!visited.has(link) && item.depth < 1 && queue.length + records.length < MAX_PAGES) {
          queue.push({ url: link, depth: item.depth + 1, seed: false });
        }
      }
    } catch (error) {
      record.issues.push({ type: "navigation", message: error.message });
    }

    record.issues.push(...networkIssues.slice(beforeIssues, beforeIssues + 30));
    records.push(record);
    console.log(`${records.length}/${MAX_PAGES} ${record.ok ? "ok" : "err"} ${url}`);
  }

  await page.close().catch(() => {});

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
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
