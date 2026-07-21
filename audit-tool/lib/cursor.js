const CURSOR_HTML = `
<div id="__audit_cursor__" style="
  position: fixed;
  top: 0; left: 0;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: rgba(255, 75, 75, 0.85);
  border: 2px solid rgba(200, 30, 30, 0.9);
  box-shadow: 0 0 12px rgba(255, 75, 75, 0.6), 0 0 24px rgba(255, 75, 75, 0.3);
  z-index: 2147483647;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: none;
  opacity: 0;
"></div>
<div id="__audit_cursor_ring__" style="
  position: fixed;
  top: 0; left: 0;
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(255, 75, 75, 0.4);
  z-index: 2147483646;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: none;
  opacity: 0;
  animation: __audit_pulse__ 1.2s ease-in-out infinite;
"></div>
<style id="__audit_cursor_style__">
  @keyframes __audit_pulse__ {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
    50% { transform: translate(-50%, -50%) scale(1.4); opacity: 0.15; }
  }
  .__audit_scan_line__ {
    position: fixed;
    left: 0;
    width: 100%;
    height: 2px;
    background: rgba(255, 75, 75, 0.25);
    z-index: 2147483645;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(255, 75, 75, 0.3);
  }
</style>
`;

const CURSOR_SCRIPT = `
(function() {
  if (document.getElementById('__audit_cursor__')) return;
  document.body.insertAdjacentHTML('beforeend', \`${CURSOR_HTML.replace(/`/g, "\\`")}\`);
  window.__auditCursorEl = document.getElementById('__audit_cursor__');
  window.__auditCursorRing = document.getElementById('__audit_cursor_ring__');
  window.__auditUpdateCursor = function(x, y) {
    if (window.__auditCursorEl) {
      window.__auditCursorEl.style.left = x + 'px';
      window.__auditCursorEl.style.top = y + 'px';
      window.__auditCursorEl.style.opacity = '1';
    }
    if (window.__auditCursorRing) {
      window.__auditCursorRing.style.left = x + 'px';
      window.__auditCursorRing.style.top = y + 'px';
      window.__auditCursorRing.style.opacity = '1';
    }
  };
  window.__auditHideCursor = function() {
    if (window.__auditCursorEl) window.__auditCursorEl.style.opacity = '0';
    if (window.__auditCursorRing) window.__auditCursorRing.style.opacity = '0';
  };
  window.__auditShowScanLine = function(y) {
    window.__auditRemoveScanLine();
    const line = document.createElement('div');
    line.className = '__audit_scan_line__';
    line.id = '__audit_scan_line__';
    line.style.top = y + 'px';
    document.body.appendChild(line);
  };
  window.__auditRemoveScanLine = function() {
    const el = document.getElementById('__audit_scan_line__');
    if (el) el.remove();
  };
})();
`;

async function injectCursor(page) {
  try {
    await page.evaluate(CURSOR_SCRIPT);
  } catch {
    // page may not be ready yet, skip injection
  }
}

async function moveCursor(page, x, y, steps = 30) {
  try {
    await page.evaluate(`(function() {
      if (window.__auditUpdateCursor) window.__auditUpdateCursor(${x}, ${y});
      if (window.__auditShowScanLine) window.__auditShowScanLine(${y});
    })()`);
  } catch {}
  try {
    await page.mouse.move(x, y, { steps });
  } catch {}
}

async function hideCursor(page) {
  try {
    await page.evaluate(`(function() {
      if (window.__auditHideCursor) window.__auditHideCursor();
      if (window.__auditRemoveScanLine) window.__auditRemoveScanLine();
    })()`);
  } catch {}
}

async function animateCursorAcross(page, durationMs = 3000) {
  const width = page.viewportSize()?.width || 1440;
  const height = page.viewportSize()?.height || 1000;
  const start = Date.now();

  while (Date.now() - start < durationMs) {
    const progress = (Date.now() - start) / durationMs;
    const x = Math.round(width * 0.1 + width * 0.8 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 3)));
    const y = Math.round(height * 0.1 + height * 0.8 * progress);
    await moveCursor(page, x, y, 8);
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function moveToElement(page, selector, steps = 25) {
  try {
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, selector);
    if (!box) return false;
    await moveCursor(page, Math.round(box.x), Math.round(box.y), steps);
    return true;
  } catch {
    return false;
  }
}

async function scrollAndTrace(page, steps = 40) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  const vh = page.viewportSize()?.height || 1000;
  for (let y = 0; y < height; y += vh / steps) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await moveCursor(page, 720, Math.min(y + vh / 2, height), 5);
    await new Promise((r) => setTimeout(r, 20));
  }
}

module.exports = {
  injectCursor,
  moveCursor,
  hideCursor,
  animateCursorAcross,
  moveToElement,
  scrollAndTrace,
};
