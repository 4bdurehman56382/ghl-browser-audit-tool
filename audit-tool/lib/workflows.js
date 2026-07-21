const path = require("path");
const fs = require("fs");
const { moveToElement, injectCursor, animateCursorAcross, moveCursor } = require("./cursor");
const { detectShutoff } = require("./detector");

const WORKFLOW_SELECTORS = [
  'a[href*="workflow"]',
  '[data-test-id*="workflow"]',
  '[class*="workflow"] a',
  'tr a[href*="workflow"]',
  '.workflow-list-item a',
  '[role="row"] a',
  'a[href*="/automation/workflow/"]',
  'button:has-text("Workflow")',
  'a:has-text("Workflow")',
];

const STEP_SELECTORS = [
  '.workflow-step',
  '[class*="step"]',
  '[data-test-id*="step"]',
  '.react-flow__node',
  '.trigger-node',
  '.action-node',
  '[class*="node-"]',
  '.workflow-trigger',
  '.workflow-action',
];

async function navigateToWorkflows(page, BASE) {
  const workflowsUrl = BASE + "/automation/workflows";
  await page.goto(workflowsUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await injectCursor(page);
  return page.url().includes("workflow");
}

async function findWorkflowLinks(page) {
  const links = await page.evaluate((selectors) => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    const results = [];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const style = getComputedStyle(el);
          if (style.display !== "none" && style.visibility !== "hidden") {
            const href = el.href || el.getAttribute("href") || "";
            const text = clean(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
            if (href && !results.some((x) => x.href === href)) {
              results.push({ href, text: text.slice(0, 120), rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
            }
          }
        }
      }
    }
    return results;
  }, WORKFLOW_SELECTORS);
  return links;
}

async function walkWorkflow(page, workflowUrl, name, screenshotsDir) {
  const record = {
    name,
    url: workflowUrl,
    ok: false,
    shutoff: false,
    steps: [],
    screenshots: [],
    bodyText: "",
    error: null,
  };

  try {
    await page.goto(workflowUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const shutoff = await detectShutoff(page);
    if (shutoff.shutoff) {
      record.shutoff = true;
      record.error = shutoff.reason;
      console.log(`  \x1b[1;33m⚠ Workflow "${name}" appears shut off: ${shutoff.reason}\x1b[0m`);
      return record;
    }

    await injectCursor(page);
    await animateCursorAcross(page, 2000);

    const shotName = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80)}-overview.png`;
    const shotPath = path.join(screenshotsDir, shotName);
    await page.screenshot({ path: shotPath, fullPage: true, timeout: 30000 }).catch(() => {});
    if (fs.existsSync(shotPath)) record.screenshots.push(shotPath);

    const bodyText = await page.evaluate(() => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      return clean(document.body.innerText).slice(0, 10000);
    }).catch(() => "");
    record.bodyText = bodyText;

    const workflowSteps = await page.evaluate((selectors) => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      const results = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            const style = getComputedStyle(el);
            if (style.display !== "none" && style.visibility !== "hidden") {
              const text = clean(el.innerText || el.textContent || "");
              if (text && !results.some((x) => x.text === text)) {
                results.push({
                  text: text.slice(0, 300),
                  rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
                });
              }
            }
          }
        }
      }
      return results;
    }, STEP_SELECTORS);

    for (let i = 0; i < workflowSteps.length; i++) {
      const step = workflowSteps[i];
      const stepRecord = { index: i, text: step.text, screenshot: "" };

      try {
        await moveCursor(page, Math.round(step.rect.x + step.rect.w / 2), Math.round(step.rect.y + step.rect.h / 2), 25);
        await new Promise((r) => setTimeout(r, 800));

        const stepShotName = `${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}-step-${i + 1}.png`;
        const stepShotPath = path.join(screenshotsDir, stepShotName);
        await page.screenshot({ path: stepShotPath, fullPage: true, timeout: 30000 }).catch(() => {});
        if (fs.existsSync(stepShotPath)) {
          stepRecord.screenshot = stepShotPath;
          record.screenshots.push(stepShotPath);
        }
      } catch (e) {
        stepRecord.error = e.message;
      }
      record.steps.push(stepRecord);
    }

    record.ok = true;
    console.log(`  \x1b[1;32m✓ Workflow "${name}": ${record.steps.length} steps captured\x1b[0m`);
  } catch (error) {
    record.error = error.message;
    console.log(`  \x1b[1;31m✗ Workflow "${name}" failed: ${error.message}\x1b[0m`);
  }

  return record;
}

async function crawlAllWorkflows(page, BASE, screenshotsDir) {
  const workflowsUrl = BASE + "/automation/workflows";
  console.log(`\n\x1b[1;36m  Navigating to Workflows: ${workflowsUrl}\x1b[0m`);

  const reached = await navigateToWorkflows(page, BASE);
  if (!reached) {
    console.log("  \x1b[1;33m⚠ Could not navigate to workflows page\x1b[0m");
    return [];
  }

  const links = await findWorkflowLinks(page);
  console.log(`  Found ${links.length} potential workflow links`);

  const uniqueLinks = [];
  const seen = new Set();
  for (const link of links) {
    const normalized = link.href.split("?")[0].split("#")[0];
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueLinks.push({ ...link, href: normalized });
    }
  }
  console.log(`  ${uniqueLinks.length} unique workflows to audit`);

  const records = [];
  for (let i = 0; i < uniqueLinks.length; i++) {
    const link = uniqueLinks[i];
    console.log(`\n\x1b[1;36m  [Workflow ${i + 1}/${uniqueLinks.length}] "${link.text}"\x1b[0m`);

    try {
      await moveToElement(page, `a[href="${link.href}"]`, 20);
      await new Promise((r) => setTimeout(r, 500));
    } catch {}

    const record = await walkWorkflow(page, link.href, link.text || `workflow-${i + 1}`, screenshotsDir);
    records.push(record);
  }

  return records;
}

module.exports = { crawlAllWorkflows, navigateToWorkflows, findWorkflowLinks, walkWorkflow };
