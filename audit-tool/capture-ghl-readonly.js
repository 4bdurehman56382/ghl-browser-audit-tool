const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { outputPath } = require("./audit-paths");

const OUT = outputPath();
const SHOTS = path.join(OUT, "screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

function safeName(url) {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .toLowerCase() || "page";
}

async function readVisiblePage(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const visible = (el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const list = (selector, mapper, limit = 120) =>
      [...document.querySelectorAll(selector)].filter(visible).slice(0, limit).map(mapper);
    const text = (el) => clean(el.innerText || el.textContent);
    return {
      url: location.href,
      title: document.title,
      bodyText: clean(document.body.innerText).slice(0, 12000),
      headings: list("h1,h2,h3,[role='heading']", (el) => ({
        tag: el.tagName.toLowerCase(),
        text: text(el).slice(0, 180),
      })),
      buttons: list("button,[role='button'],a,input[type='button'],input[type='submit']", (el) => ({
        tag: el.tagName.toLowerCase(),
        text: (text(el) || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("value") || "").slice(0, 160),
        href: el.href || "",
        disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
      })),
      forms: list("form", (form) => ({
        action: form.getAttribute("action") || "",
        method: form.getAttribute("method") || "",
        fields: [...form.querySelectorAll("input,select,textarea")].filter(visible).slice(0, 60).map((field) => ({
          type: field.getAttribute("type") || field.tagName.toLowerCase(),
          name: field.getAttribute("name") || "",
          placeholder: field.getAttribute("placeholder") || "",
          required: Boolean(field.required) || field.getAttribute("aria-required") === "true",
          label: field.getAttribute("aria-label") || "",
        })),
      })),
      links: list("a[href]", (el) => ({ text: text(el).slice(0, 140), href: el.href }), 200),
      images: list("img", (img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt || "",
        width: img.naturalWidth,
        height: img.naturalHeight,
      }), 100),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      metrics: {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
    };
  });
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const pages = context.pages().filter((p) => {
    const url = p.url();
    return url.startsWith("https://app.gohighlevel.com/") || url.includes("gohighlevel");
  });

  const results = [];
  for (const page of pages) {
    const messages = [];
    page.on("console", (msg) => {
      if (["error", "warning"].includes(msg.type())) messages.push(`${msg.type()}: ${msg.text()}`);
    });
    page.on("pageerror", (err) => messages.push(`pageerror: ${err.message}`));
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});

    const viewports = [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
    ];

    const record = {
      url: page.url(),
      title: await page.title().catch(() => ""),
      capturedAt: new Date().toISOString(),
      screenshots: [],
      diagnostics: {},
      consoleMessages: [],
    };

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(1200);
      const name = `${safeName(page.url())}-${vp.name}.png`;
      const shot = path.join(SHOTS, name);
      await page.screenshot({ path: shot, fullPage: true }).catch((err) => {
        record.screenshots.push({ viewport: vp.name, error: err.message });
      });
      if (fs.existsSync(shot)) record.screenshots.push({ viewport: vp.name, path: path.relative(process.cwd(), shot) });
      record.diagnostics[vp.name] = await readVisiblePage(page).catch((err) => ({ error: err.message }));
    }

    record.consoleMessages = messages.slice(0, 80);
    results.push(record);
  }

  fs.writeFileSync(path.join(OUT, "ghl-browser-capture.json"), JSON.stringify({ pages: results }, null, 2));
  fs.writeFileSync(
    path.join(OUT, "ghl-browser-capture-summary.md"),
    [
      "# GHL Browser Capture Summary",
      "",
      `Captured pages: ${results.length}`,
      "",
      ...results.flatMap((page, i) => [
        `## ${i + 1}. ${page.title}`,
        "",
        `URL: ${page.url}`,
        "",
        "Screenshots:",
        ...page.screenshots.map((s) => `- ${s.viewport}: ${s.path || s.error}`),
        "",
        "Visible headings:",
        ...(page.diagnostics.desktop?.headings || []).slice(0, 20).map((h) => `- ${h.text}`),
        "",
        "Visible buttons/actions:",
        ...(page.diagnostics.desktop?.buttons || []).slice(0, 40).map((b) => `- ${b.text || "[unlabeled]"}`),
        "",
        `Horizontal overflow desktop: ${Boolean(page.diagnostics.desktop?.overflowX)}`,
        `Horizontal overflow mobile: ${Boolean(page.diagnostics.mobile?.overflowX)}`,
        `Console warnings/errors sampled: ${page.consoleMessages.length}`,
        "",
      ]),
    ].join("\n")
  );

  await browser.close();
  console.log(`Captured ${results.length} GHL page(s) into ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
