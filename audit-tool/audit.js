#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("playwright-core");
const { outputPath } = require("./audit-paths");
const { launchChrome, printWarning, CDP_URL } = require("./lib/chrome");
const { scanSinglePage } = require("./lib/scanner");
const { crawlAllWorkflows } = require("./lib/workflows");
const { generatePdf } = require("./lib/report-pdf");
const { injectCursor, hideCursor } = require("./lib/cursor");
const { optionalLocationId, parsePositiveInteger } = require("./lib/config");
const { getDefaultContext } = require("./lib/browser-context");
const { isSafeReadOnlyUrl, normalizeGhlUrl, safeFileName } = require("./lib/safety");

const LOCATION_ID = optionalLocationId();
const BASE = LOCATION_ID ? `https://app.gohighlevel.com/v2/location/${LOCATION_ID}` : "";
const OUT = outputPath();
const SCREENSHOTS_DIR = path.join(OUT, "screenshots");
const MAX_PAGES = parsePositiveInteger(process.env.MAX_PAGES, 200, "MAX_PAGES");
const OPEN_TABS_ONLY = process.env.OPEN_TABS_ONLY === "1";
const ALLOW_ALL_GHL_TABS = process.env.AUDIT_ALLOW_ALL_GHL_TABS === "1";

const GOPAGE_SELECTORS = [
  "a[href*='gohighlevel']",
  "button",
  "[role='button']",
  "a",
  ".nav-item",
  "[class*='sidebar'] a",
  "[class*='menu'] a",
  "[class*='nav'] a",
];

function normalizeUrl(url) {
  return normalizeGhlUrl(url, BASE || "https://app.gohighlevel.com/");
}

function shouldVisit(url) {
  const normalized = normalizeUrl(url);
  return isSafeReadOnlyUrl(normalized, { base: BASE || "https://app.gohighlevel.com/" });
}

function shouldCaptureOpenTab(url) {
  const normalized = normalizeGhlUrl(url, "https://app.gohighlevel.com/");
  if (!normalized) return false;
  if (!ALLOW_ALL_GHL_TABS && BASE && normalized !== BASE && !normalized.startsWith(`${BASE}/`)) return false;
  return isSafeReadOnlyUrl(normalized, { base: BASE || "https://app.gohighlevel.com/" });
}

function buildSeedRoutes() {
  if (!BASE) return [];
  const routes = [
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
    "/ai-agents/voice-ai",
    "/ai-agents/conversation-ai",
    "/ai-agents/knowledge-base",
    "/ai-agents/agent-templates",
    "/ai-agents/content-ai",
    "/ai-agents/agent-logs",
    "/marketing/social-planner",
    "/marketing/emails",
    "/marketing/templates",
    "/marketing/affiliate-manager",
    "/marketing/trigger-links",
    "/automation/workflows",
    "/automation/workflows/folders",
    "/funnels-websites/funnels",
    "/funnels-websites/websites",
    "/funnels-websites/stores",
    "/funnels-websites/forms",
    "/funnels-websites/surveys",
    "/funnels-websites/chat-widget",
    "/funnels-websites/url-redirects",
    "/funnels-websites/domains",
    "/funnels-websites/blogs",
    "/funnels-websites/analytics",
    "/funnels-websites/qr-codes",
    "/funnels-websites/client-portal",
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
    "/settings/calendars/preferences",
    "/settings/calendars/availability",
    "/settings/calendars/connections",
    "/settings/phone_numbers",
    "/settings/email-services",
    "/settings/domains",
    "/settings/tags",
    "/settings/custom-fields",
    "/settings/custom-values",
    "/settings/pipelines",
    "/settings/objects",
  ];
  return routes.map((r) => ({
    name: r.replace(/^\//, "").replace(/\//g, " > "),
    url: normalizeUrl(BASE + r),
  }));
}

async function discoverInternalLinks(page) {
  try {
    const rawLinks = await page.evaluate((selectors) => {
      const base = "https://app.gohighlevel.com";
      const found = new Set();
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const href = el.href || el.getAttribute("href") || "";
          if (href.startsWith(base) || href.startsWith("/v2/")) {
            try {
              const u = new URL(href, base);
              u.hash = "";
              ["modal", "drawer"].forEach((p) => u.searchParams.delete(p));
              found.add(u.toString());
            } catch {}
          }
        }
      }
      return [...found];
    }, ["a[href]"]);
    return rawLinks;
  } catch {
    return [];
  }
}

async function askConfirmation() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("\x1b[1;33m  Do you want to continue? (yes/no): \x1b[0m", (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === "yes" || answer.toLowerCase().trim() === "y");
    });
  });
}

async function main() {
  console.log("\x1b[1;36m" + "█".repeat(68) + "\x1b[0m");
  console.log("\x1b[1;36m  GHL Audit Tool v2.0.0\x1b[0m");
  console.log("\x1b[1;36m  Read-Only Browser Automation for GoHighLevel\x1b[0m");
  console.log("\x1b[1;36m" + "█".repeat(68) + "\x1b[0m");

  printWarning();

  if (!LOCATION_ID && !OPEN_TABS_ONLY) {
    throw new Error("Set GHL_LOCATION_ID for a full audit, or set OPEN_TABS_ONLY=1 for explicit open-tab capture.");
  }

  if (!LOCATION_ID && OPEN_TABS_ONLY) {
    console.log("\x1b[1;33m  OPEN_TABS_ONLY=1 set. Location-specific crawl and workflows will be skipped.\x1b[0m\n");
  }

  const confirmed = await askConfirmation();
  if (!confirmed) {
    console.log("\x1b[1;31m  Audit cancelled by user.\x1b[0m\n");
    process.exit(0);
  }

  console.log("\n\x1b[1;32m  Starting audit...\x1b[0m\n");

  const chromeResult = await launchChrome();
  console.log(`\x1b[1;32m  ✓ Chrome DevTools Protocol ready (${chromeResult.launched ? "freshly launched" : "already running"})\x1b[0m\n`);

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    console.log("\x1b[1;32m  ✓ Connected to browser via CDP\x1b[0m\n");
  } catch (error) {
    console.error(`\x1b[1;31m  Failed to connect to Chrome CDP: ${error.message}\x1b[0m`);
    process.exit(1);
  }

  const context = getDefaultContext(browser);
  const mainPage = await context.newPage();
  await mainPage.setViewportSize({ width: 1440, height: 1000 });

  const auditStartTime = Date.now();
  const allPages = [];
  const workflowRecords = [];

  if (BASE && !OPEN_TABS_ONLY) {
    console.log("\x1b[1;36m" + "=".repeat(68) + "\x1b[0m");
    console.log("\x1b[1;36m  PHASE 1: Deep Page Audit (up to 45 sec wait per page)\x1b[0m");
    console.log("\x1b[1;36m" + "=".repeat(68) + "\x1b[0m\n");

    const seeds = buildSeedRoutes();
    const queue = seeds.map((s, i) => ({ ...s, depth: 0, seed: true }));
    const visited = new Set();

    let counter = 0;
    while (queue.length > 0 && counter < MAX_PAGES) {
      const item = queue.shift();
      const url = normalizeUrl(item.url);
      if (!shouldVisit(url) || visited.has(url)) continue;
      visited.add(url);
      counter++;

      console.log(`\n\x1b[1;37m  [${counter}/${Math.min(counter + queue.length, MAX_PAGES)}] ${item.name}\x1b[0m`);
      console.log(`  URL: ${url}`);

      const record = await scanSinglePage(mainPage, url, item.name, SCREENSHOTS_DIR, counter);
      allPages.push(record);

      if (record.ok && item.depth < 1) {
        try {
          const discovered = await discoverInternalLinks(mainPage);
          for (const link of discovered) {
            const normalized = normalizeUrl(link);
            if (!visited.has(normalized) && shouldVisit(normalized) && queue.length + allPages.length < MAX_PAGES) {
              queue.push({ name: normalized.replace(BASE, "").replace(/^\//, ""), url: normalized, depth: item.depth + 1, seed: false });
            }
          }
        } catch {}
      }
    }

    console.log("\n\x1b[1;36m" + "=".repeat(68) + "\x1b[0m");
    console.log("\x1b[1;36m  PHASE 2: Workflow Audit\x1b[0m");
    console.log("\x1b[1;36m" + "=".repeat(68) + "\x1b[0m\n");

    const wfScreenshotsDir = path.join(OUT, "workflow-screenshots");
    fs.mkdirSync(wfScreenshotsDir, { recursive: true });

    try {
      const wfRecords = await crawlAllWorkflows(mainPage, BASE, wfScreenshotsDir);
      workflowRecords.push(...wfRecords);
    } catch (error) {
      console.log(`\x1b[1;33m  ⚠ Workflow audit error: ${error.message}\x1b[0m`);
    }
  }

  console.log("\n\x1b[1;36m" + "=".repeat(68) + "\x1b[0m");
  console.log("\x1b[1;36m  PHASE 3: Open Tab Capture\x1b[0m");
  console.log("\x1b[1;36m" + "=".repeat(68) + "\x1b[0m\n");

  const openPages = context.pages().filter((p) => {
    return shouldCaptureOpenTab(p.url());
  });

  console.log(`  Found ${openPages.length} open GHL tab(s)\n`);

  for (let i = 0; i < openPages.length; i++) {
    const page = openPages[i];
    if (page === mainPage) continue;
    const url = page.url();
    const tabName = `tab-${i + 1}: ${url.replace(/^https:\/\/app\.gohighlevel\.com\//, "").slice(0, 60)}`;
    console.log(`  Capturing ${tabName}`);
    try {
      await injectCursor(page).catch(() => {});
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      const content = await page.evaluate(() => {
        const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
        return {
          title: document.title,
          bodyText: clean(document.body.innerText).slice(0, 6000),
        };
      }).catch(() => ({ title: "", bodyText: "" }));

      const shotName = `tab-${i + 1}-${safeFileName(page.url(), 80)}.png`;
      const shotPath = path.join(SCREENSHOTS_DIR, shotName);
      await page.screenshot({ path: shotPath, fullPage: true, timeout: 30000 }).catch(() => {});
      allPages.push({
        index: allPages.length + 1,
        name: tabName,
        url,
        ok: true,
        shutoff: false,
        screenshot: fs.existsSync(shotPath) ? shotPath : "",
        screenshots: fs.existsSync(shotPath) ? [shotPath] : [],
        bodyText: content.bodyText,
        headingsCount: 0,
        buttonsCount: 0,
        loadTimeSeconds: 0,
        issues: [],
        pageData: null,
      });
      console.log(`  \x1b[1;32m✓ ${tabName}\x1b[0m`);
    } catch (error) {
      console.log(`  \x1b[1;33m⚠ ${tabName}: ${error.message}\x1b[0m`);
    }
  }

  await hideCursor(mainPage).catch(() => {});

  const auditResults = {
    tool: "GHL Audit Tool v2.0.0",
    locationId: LOCATION_ID || "not-set",
    auditDate: new Date().toISOString(),
    totalDurationSeconds: Math.round((Date.now() - auditStartTime) / 1000),
    pages: allPages,
    workflows: workflowRecords,
    summary: {
      totalPages: allPages.length,
      pagesOk: allPages.filter((p) => p.ok && !p.shutoff).length,
      pagesShutoff: allPages.filter((p) => p.shutoff).length,
      pagesFailed: allPages.filter((p) => !p.ok && !p.shutoff).length,
      totalScreenshots: allPages.reduce((s, p) => s + (p.screenshots?.length || 0), 0),
      totalWorkflows: workflowRecords.length,
    },
  };

  const jsonPath = path.join(OUT, "audit-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(auditResults, null, 2));
  console.log(`\n\x1b[1;32m✓ Audit results saved to ${jsonPath}\x1b[0m`);

  const summaryMd = buildSummaryMd(auditResults);
  const mdPath = path.join(OUT, "audit-summary.md");
  fs.writeFileSync(mdPath, summaryMd);
  console.log(`\x1b[1;32m✓ Audit summary saved to ${mdPath}\x1b[0m`);

  console.log("\n\x1b[1;36m" + "=".repeat(68) + "\x1b[0m");
  console.log("\x1b[1;36m  PHASE 4: Generating PDF Report\x1b[0m");
  console.log("\x1b[1;36m" + "=".repeat(68) + "\x1b[0m\n");

  const pdfPath = await generatePdf(browser, auditResults, LOCATION_ID || "open-tabs-only", OUT);

  await mainPage.close().catch(() => {});
  console.log("\n\x1b[1;42m  AUDIT COMPLETE  \x1b[0m\n");
  console.log(`\x1b[1;37m  Pages audited: ${auditResults.summary.totalPages}\x1b[0m`);
  console.log(`\x1b[1;32m  Pages OK: ${auditResults.summary.pagesOk}\x1b[0m`);
  console.log(`\x1b[1;33m  Pages shut off by admin: ${auditResults.summary.pagesShutoff}\x1b[0m`);
  console.log(`\x1b[1;31m  Pages failed: ${auditResults.summary.pagesFailed}\x1b[0m`);
  console.log(`\x1b[1;36m  Workflows audited: ${auditResults.summary.totalWorkflows}\x1b[0m`);
  console.log(`\x1b[1;37m  Screenshots taken: ${auditResults.summary.totalScreenshots}\x1b[0m`);
  console.log(`\x1b[1;37m  Total duration: ${auditResults.totalDurationSeconds}s\x1b[0m`);
  if (pdfPath) console.log(`\x1b[1;37m  PDF report: ${pdfPath}\x1b[0m`);
  console.log(`\x1b[1;37m  Output directory: ${OUT}\x1b[0m\n`);

  browser.disconnect();
}

function buildSummaryMd(results) {
  const s = results.summary;
  const okPages = results.pages.filter((p) => p.ok && !p.shutoff);
  const shutoffPages = results.pages.filter((p) => p.shutoff);
  const failedPages = results.pages.filter((p) => !p.ok && !p.shutoff);

  return [
    "# GHL Audit Summary",
    "",
    `**Tool:** ${results.tool}`,
    `**Location ID:** ${results.locationId}`,
    `**Audit Date:** ${results.auditDate}`,
    `**Total Duration:** ${results.totalDurationSeconds}s`,
    "",
    "## Overview",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total Pages Audited | ${s.totalPages} |`,
    `| Pages OK | ${s.pagesOk} |`,
    `| Pages Shut Off by Admin | ${s.pagesShutoff} |`,
    `| Pages Failed | ${s.pagesFailed} |`,
    `| Screenshots Taken | ${s.totalScreenshots} |`,
    `| Workflows Audited | ${s.totalWorkflows} |`,
    "",
    "## Pages OK",
    "",
    ...okPages.map((p) => `- ${p.name} (${p.loadTimeSeconds}s, ${p.headingsCount} headings, ${(p.bodyText || "").length} chars)`),
    "",
    "## Pages Shut Off by Administrator",
    "",
    ...(shutoffPages.length > 0
      ? shutoffPages.map((p) => `- **${p.name}**: ${p.shutoffReason || "Unknown"} (${p.shutoffType || ""})`)
      : ["- None detected"]),
    "",
    "## Pages Failed",
    "",
    ...(failedPages.length > 0
      ? failedPages.map((p) => `- ${p.name}: ${(p.issues || []).map((i) => i.text || i).join("; ")}`)
      : ["- None"]),
    "",
    "## Workflows",
    "",
    ...results.workflows.map((w) => `- **${w.name}**: ${w.ok ? "OK" : w.shutoff ? "SHUT OFF" : "FAILED"} (${(w.steps || []).length} steps)`),
    "",
  ].join("\n");
}

if (require.main === module) {
  process.on("SIGINT", () => {
    console.log("\n\x1b[1;31m  Audit interrupted by user.\x1b[0m\n");
    process.exit(0);
  });

  process.on("unhandledRejection", (err) => {
    console.error("\n\x1b[1;31m  Unhandled error:\x1b[0m", err?.message || err);
    process.exit(1);
  });

  main().catch((error) => {
    console.error("\x1b[1;31m  Fatal error:\x1b[0m", error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  buildSeedRoutes,
  buildSummaryMd,
  discoverInternalLinks,
  main,
  normalizeUrl,
  shouldCaptureOpenTab,
  shouldVisit,
};
