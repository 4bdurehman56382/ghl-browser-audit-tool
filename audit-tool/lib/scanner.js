const path = require("path");
const fs = require("fs");
const { injectCursor, moveCursor, animateCursorAcross, moveToElement, hideCursor } = require("./cursor");
const { detectShutoff, extractReadableContent } = require("./detector");
const { safeNameFromUrl } = require("./safety");

const PAGE_LOAD_TIMEOUT_MS = 45 * 1000;
const NAVIGATION_TIMEOUT_MS = 60000;

function safeName(url) {
  return safeNameFromUrl(url, 100);
}

async function extractPageData(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const sample = (selector, mapper, limit = 100) =>
      [...document.querySelectorAll(selector)].filter(visible).slice(0, limit).map(mapper);
    const elementText = (el) => clean(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "");

    return {
      url: location.href,
      title: document.title,
      bodyText: clean(document.body.innerText).slice(0, 16000),
      headings: sample("h1,h2,h3,[role='heading']", (el) => elementText(el).slice(0, 180), 80),
      buttons: sample("button,[role='button'],input[type='button'],input[type='submit']", (el) => ({
        text: elementText(el).slice(0, 160),
        disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
      }), 200),
      fields: sample("input,select,textarea", (el) => ({
        type: el.getAttribute("type") || el.tagName.toLowerCase(),
        name: el.getAttribute("name") || "",
        placeholder: el.getAttribute("placeholder") || "",
        label: el.getAttribute("aria-label") || "",
        required: Boolean(el.required) || el.getAttribute("aria-required") === "true",
      }), 120),
      links: sample("a[href]", (el) => ({
        text: elementText(el).slice(0, 160),
        href: el.href || el.getAttribute("href") || "",
      }), 260),
      images: sample("img", (img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt || "",
        width: img.naturalWidth,
        height: img.naturalHeight,
      }), 80),
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

function isPageMeaningful(bodyText, minLength = 300) {
  return (bodyText || "").length >= minLength;
}

async function waitForPageReady(page, route, minBodyLength = 300, options = {}) {
  const timeoutMs = options.timeoutMs ?? PAGE_LOAD_TIMEOUT_MS;
  const sleep = options.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const start = Date.now();
  let lastBody = "";
  let checkCount = 0;

  while (Date.now() - start < timeoutMs) {
    checkCount++;
    try {
      const content = await extractReadableContent(page);
      lastBody = content.bodyText || "";
      if (isPageMeaningful(lastBody, minBodyLength)) {
        const waited = Date.now() - start;
        return {
          status: "loaded",
          waitedMs: waited,
          checks: checkCount,
          bodyText: lastBody,
        };
      }
    } catch {}

    const elapsed = Date.now() - start;
    const elapsedMin = Math.floor(elapsed / 60000);
    const remainingSec = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));

    if (checkCount % 10 === 0 && elapsed > 5000) {
      process.stdout.write(`\r  Waiting for page... ${elapsedMin}m elapsed, ${remainingSec}s remaining, body=${lastBody.length} chars`);
    }

    const wait = Math.min(3000, Math.max(50, (timeoutMs - elapsed) / 20));
    await sleep(wait);
  }

  process.stdout.write("\n");
  return {
    status: "timed_out",
    waitedMs: timeoutMs,
    checks: checkCount,
    bodyText: lastBody,
  };
}

async function scanSinglePage(page, url, name, screenshotsDir, counter) {
  const record = {
    index: counter,
    name: name || safeName(url),
    url,
    ok: false,
    shutoff: false,
    shutoffType: null,
    shutoffReason: null,
    screenshot: "",
    screenshots: [],
    headingsCount: 0,
    buttonsCount: 0,
    loadTimeSeconds: 0,
    bodyText: "",
    issues: [],
    pageData: null,
  };

  const issues = [];
  const onConsole = (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      issues.push({ type: msg.type(), text: msg.text().slice(0, 200) });
    }
  };
  const onPageError = (err) => issues.push({ type: "pageerror", text: err.message.slice(0, 200) });
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(1000);

    const beforeIssues = issues.length;

    let shutoffResult = await detectShutoff(page, { detectEmpty: false });
    if (shutoffResult.shutoff) {
      record.shutoff = true;
      record.shutoffType = shutoffResult.type;
      record.shutoffReason = shutoffResult.reason;
      record.issues = issues.slice(beforeIssues);
      console.log(`  \x1b[1;33m⚠ SKIPPED (shut off): ${name} - ${shutoffResult.reason}\x1b[0m`);
      return record;
    }

    await injectCursor(page);
    const loadResult = await waitForPageReady(page, url);
    record.loadTimeSeconds = Math.round(loadResult.waitedMs / 1000);
    record.bodyText = loadResult.bodyText;

    shutoffResult = await detectShutoff(page, { detectEmpty: false });
    if (shutoffResult.shutoff) {
      record.shutoff = true;
      record.shutoffType = shutoffResult.type;
      record.shutoffReason = shutoffResult.reason;
      record.issues = issues.slice(beforeIssues);
      console.log(`  \x1b[1;33m⚠ SKIPPED (shut off): ${name} - ${shutoffResult.reason}\x1b[0m`);
      return record;
    }

    if (loadResult.status !== "loaded") {
      record.issues.push({
        type: "page_timeout",
        text: "Page did not reach 300 visible body characters within " +
          `${Math.round(loadResult.waitedMs / 1000)} seconds.`,
      });
    }

    await moveToElement(page, "h1", 15).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await animateCursorAcross(page, 1500);

    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 300));

    const height = await page.evaluate(() => document.body.scrollHeight);
    const vh = page.viewportSize()?.height || 1000;
    const halfX = (page.viewportSize()?.width || 1440) / 2;
    for (let y = 0; y < height && y < vh * 5; y += vh / 15) {
      await page.evaluate((sy) => window.scrollTo(0, sy), y);
      await moveCursor(page, halfX, Math.min(y + vh / 3, height), 5);
      await new Promise((r) => setTimeout(r, 30));
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 500));

    const shotName = `${String(counter).padStart(3, "0")}-${safeName(url)}.png`;
    const shotPath = path.join(screenshotsDir, shotName);
    await page.screenshot({ path: shotPath, fullPage: true, timeout: 30000 }).catch((err) => {
      record.issues.push({ type: "screenshot_error", text: err.message });
    });
    if (fs.existsSync(shotPath)) {
      record.screenshot = shotPath;
      record.screenshots.push(shotPath);
    }

    const pageData = await extractPageData(page).catch(() => null);
    if (pageData) {
      record.pageData = pageData;
      record.headingsCount = (pageData.headings || []).length;
      record.buttonsCount = (pageData.buttons || []).length;
    }

    record.issues.push(...issues.slice(beforeIssues));
    record.ok = loadResult.status === "loaded";
    const color = record.ok ? "\x1b[1;32m" : "\x1b[1;33m";
    const mark = record.ok ? "✓" : "⚠";
    console.log(`  ${color}${mark} ${name} (${record.loadTimeSeconds}s, ${record.headingsCount} headings, ${record.bodyText.length} chars)\x1b[0m`);
  } catch (error) {
    record.issues.push({ type: "navigation_error", text: error.message });
    console.log(`  \x1b[1;31m✗ ${name}: ${error.message}\x1b[0m`);
  } finally {
    if (typeof page.off === "function") {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    } else if (typeof page.removeListener === "function") {
      page.removeListener("console", onConsole);
      page.removeListener("pageerror", onPageError);
    }
  }

  return record;
}

async function scanSectionWalk(page, sectionRoutes, screenshotsDir, counter = 0) {
  const records = [];
  for (const section of sectionRoutes) {
    counter++;
    const record = await scanSinglePage(page, section.url, section.name, screenshotsDir, counter);
    records.push(record);
  }
  return records;
}

module.exports = {
  extractPageData,
  isPageMeaningful,
  PAGE_LOAD_TIMEOUT_MS,
  safeName,
  scanSectionWalk,
  scanSinglePage,
  waitForPageReady,
};
