const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath, requireLocationId } = require("./audit-paths");

const LOCATION_ID = requireLocationId();
const BASE = `https://app.gohighlevel.com/v2/location/${LOCATION_ID}`;
const OUT = outputPath("deep-ghl-audit", "missed-retry-30s");
const SHOTS = path.join(OUT, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const routes = [
  { name: "automation-workflows", path: "/automation/workflows", expect: ["Automation", "Workflows"], minBody: 650 },
  { name: "automation-workflow-folders", path: "/automation/workflows/folders", expect: ["Automation", "Workflows"], minBody: 650 },

  { name: "calendar-settings-main", path: "/calendars/settings", expect: ["Calendars", "Calendar settings"], minBody: 500 },

  { name: "sites-forms-old-route", path: "/funnels-websites/forms", expect: ["Forms"], minBody: 500 },
  { name: "sites-forms-actual-route", path: "/form-builder/main", expect: ["Forms"], minBody: 500 },
  { name: "sites-surveys-old-route", path: "/funnels-websites/surveys", expect: ["Surveys"], minBody: 500 },
  { name: "sites-surveys-actual-route", path: "/survey-builder/main", expect: ["Surveys"], minBody: 500 },
  { name: "sites-url-redirects", path: "/funnels-websites/url-redirects", expect: ["Redirect"], minBody: 500 },
  { name: "sites-domains", path: "/funnels-websites/domains", expect: ["Domains"], minBody: 500 },
  { name: "sites-blogs-old-route", path: "/funnels-websites/blogs", expect: ["Blogs"], minBody: 500 },
  { name: "sites-blogs-actual-route", path: "/blogs", expect: ["Blogs"], minBody: 500 },
  { name: "sites-analytics-old-route", path: "/funnels-websites/analytics", expect: ["Analytics"], minBody: 500 },
  { name: "sites-analytics-actual-route", path: "/analytics", expect: ["Analytics"], minBody: 500 },
  { name: "sites-qr-codes-old-route", path: "/funnels-websites/qr-codes", expect: ["QR"], minBody: 500 },
  { name: "sites-qr-codes-actual-route", path: "/qr-codes", expect: ["QR"], minBody: 500 },

  { name: "payments-orders", path: "/payments/orders", expect: ["Orders"], minBody: 500 },
  { name: "payments-subscriptions", path: "/payments/subscriptions", expect: ["Subscriptions"], minBody: 500 },
  { name: "payments-transactions", path: "/payments/transactions", expect: ["Transactions"], minBody: 500 },
  { name: "payments-products", path: "/payments/products", expect: ["Products"], minBody: 500 },
  { name: "payments-settings", path: "/payments/settings", expect: ["Payments", "Settings"], minBody: 500 },

  { name: "reputation-reviews", path: "/reputation/reviews", expect: ["Reviews"], minBody: 500 },
  { name: "reputation-listings", path: "/reputation/listings", expect: ["Listings"], minBody: 500 },

  { name: "reporting-call-reporting", path: "/reporting/call-reporting", expect: ["Call"], minBody: 500 },
  { name: "reporting-attribution-report", path: "/reporting/attribution-report", expect: ["Attribution"], minBody: 500 },

  { name: "settings-staff", path: "/settings/my-staff", expect: ["Staff", "Team", "User"], minBody: 500 },
  { name: "settings-phone-numbers", path: "/settings/phone_numbers", expect: ["Phone"], minBody: 500 },
  { name: "settings-email-services", path: "/settings/email-services", expect: ["Email"], minBody: 500 },
  { name: "settings-domains", path: "/settings/domains", expect: ["Domains"], minBody: 500 },
  { name: "settings-custom-fields", path: "/settings/custom-fields", expect: ["Custom Fields"], minBody: 500 },
  { name: "settings-custom-values", path: "/settings/custom-values", expect: ["Custom Values"], minBody: 500 },
  { name: "settings-pipelines", path: "/settings/pipelines", expect: ["Pipelines"], minBody: 500 },

  { name: "memberships-communities", path: "/memberships/communities/groups", expect: ["Communities"], minBody: 500 },
];

function loadExtraRoutes() {
  const configPath = process.env.GHL_RETRY_ROUTES_JSON;
  if (!configPath) return [];
  return JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
}

routes.push(...loadExtraRoutes());

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

async function pageFacts(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const texts = (selector, limit = 120) =>
      [...document.querySelectorAll(selector)]
        .filter(visible)
        .slice(0, limit)
        .map((el) => clean(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title")));

    return {
      url: location.href,
      title: document.title,
      body: clean(document.body.innerText).slice(0, 14000),
      headings: texts("h1,h2,h3,[role='heading']", 80),
      actions: texts("button,[role='button'],a", 180),
      fields: [...document.querySelectorAll("input,textarea,select")]
        .filter(visible)
        .slice(0, 120)
        .map((el) => ({
          tag: el.tagName,
          type: el.getAttribute("type") || "",
          placeholder: el.getAttribute("placeholder") || "",
          aria: el.getAttribute("aria-label") || "",
          valuePresent: Boolean(el.value),
        })),
      stats: {
        bodyLength: clean(document.body.innerText).length,
        skeletonBlocks: [...document.querySelectorAll("*")].filter((el) => {
          const className = String(el.className || "").toLowerCase();
          return className.includes("skeleton") || className.includes("loading");
        }).length,
        buttons: document.querySelectorAll("button,[role='button']").length,
        links: document.querySelectorAll("a[href]").length,
      },
    };
  });
}

function isMeaningful(facts, route) {
  const body = (facts.body || "").toLowerCase();
  if ((facts.stats?.bodyLength || 0) < route.minBody) return false;
  if (route.expect?.length) {
    return route.expect.some((word) => body.includes(word.toLowerCase()));
  }
  return true;
}

async function waitForMeaningful(page, route) {
  const started = Date.now();
  let lastFacts = null;
  while (Date.now() - started < 30000) {
    lastFacts = await pageFacts(page).catch(() => null);
    if (lastFacts && isMeaningful(lastFacts, route)) {
      return { status: "loaded_before_30s", waitedMs: Date.now() - started, facts: lastFacts };
    }
    await page.waitForTimeout(750);
  }
  lastFacts = await pageFacts(page).catch(() => lastFacts);
  return { status: "timed_out_at_30s", waitedMs: Date.now() - started, facts: lastFacts || {} };
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const records = [];

  for (const route of routes) {
    const url = BASE + route.path;
    const record = {
      name: route.name,
      url,
      status: "not_started",
      waitedMs: 0,
      screenshot: "",
      facts: {},
      error: "",
      capturedAt: new Date().toISOString(),
    };

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      const result = await waitForMeaningful(page, route);
      record.status = result.status;
      record.waitedMs = result.waitedMs;
      record.facts = result.facts;

      const shotPath = path.join(SHOTS, `${safeName(route.name)}.png`);
      await page.screenshot({ path: shotPath, fullPage: true, timeout: 20000 }).catch((error) => {
        record.error = `screenshot failed: ${error.message}`;
      });
      if (fs.existsSync(shotPath)) record.screenshot = path.relative(process.cwd(), shotPath);
    } catch (error) {
      record.status = "navigation_error";
      record.error = error.message;
      const shotPath = path.join(SHOTS, `${safeName(route.name)}-error.png`);
      await page.screenshot({ path: shotPath, fullPage: true, timeout: 10000 }).catch(() => {});
      if (fs.existsSync(shotPath)) record.screenshot = path.relative(process.cwd(), shotPath);
    }

    records.push(record);
    const len = record.facts?.stats?.bodyLength ?? 0;
    console.log(`${records.length}/${routes.length} ${record.status} ${route.name} body=${len} wait=${Math.round(record.waitedMs / 1000)}s`);
  }

  await page.close().catch(() => {});
  fs.writeFileSync(path.join(OUT, "missed-retry-30s.json"), JSON.stringify(records, null, 2));

  const summary = [
    "# Missed Pages Retry - 30 Second Wait",
    "",
    `Captured: ${new Date().toISOString()}`,
    `Routes retried: ${records.length}`,
    "",
    "## Still Could Not Audit Fully",
    "",
    ...records
      .filter((r) => r.status !== "loaded_before_30s")
      .map((r) => `- ${r.name}: ${r.status}, body length ${r.facts?.stats?.bodyLength || 0}, screenshot \`${r.screenshot || "[none]"}\``),
    "",
    "## Loaded And Audited",
    "",
    ...records
      .filter((r) => r.status === "loaded_before_30s")
      .map((r) => `- ${r.name}: loaded in ${(r.waitedMs / 1000).toFixed(1)}s, screenshot \`${r.screenshot}\``),
    "",
    "## Page Notes",
    "",
    ...records.flatMap((r) => [
      `### ${r.name}`,
      "",
      `URL: ${r.url}`,
      `Status: ${r.status}`,
      `Waited: ${(r.waitedMs / 1000).toFixed(1)}s`,
      `Screenshot: ${r.screenshot || "[none]"}`,
      "",
      "Body sample:",
      (r.facts?.body || "").slice(0, 1800) || "[blank]",
      "",
    ]),
  ].join("\n");

  fs.writeFileSync(path.join(OUT, "missed-retry-30s-summary.md"), summary);
  console.log(`Wrote ${path.join(OUT, "missed-retry-30s-summary.md")}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
