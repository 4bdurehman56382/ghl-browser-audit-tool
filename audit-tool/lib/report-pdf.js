const path = require("path");
const fs = require("fs");

function buildHtmlReport(auditResults, locationId) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const pagesOk = auditResults.pages.filter((p) => p.ok && !p.shutoff).length;
  const pagesShutoff = auditResults.pages.filter((p) => p.shutoff).length;
  const pagesFailed = auditResults.pages.filter((p) => !p.ok && !p.shutoff).length;
  const totalScreenshots = auditResults.pages.reduce((sum, p) => sum + (p.screenshots?.length || 0), 0);
  const totalIssues = auditResults.pages.reduce((sum, p) => sum + (p.issues?.length || 0), 0);

  const pageRows = auditResults.pages.map((p, i) => {
    const statusIcon = p.shutoff ? "⛔ SHUT OFF" : p.ok ? "✅ OK" : "❌ FAILED";
    const statusColor = p.shutoff ? "#e67e22" : p.ok ? "#27ae60" : "#e74c3c";
    const bodySample = (p.bodyText || "").slice(0, 400).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="max-width:300px;word-break:break-all;"><a href="${escapeHtml(p.url)}">${escapeHtml(p.name || p.url)}</a></td>
        <td style="color:${statusColor};font-weight:bold;">${statusIcon}</td>
        <td>${p.headingsCount || 0}</td>
        <td>${p.buttonsCount || 0}</td>
        <td>${(p.screenshots || []).length}</td>
        <td>${(p.issues || []).length}</td>
        <td>${p.loadTimeSeconds || "N/A"}s</td>
        <td style="max-width:200px;font-size:11px;">${bodySample}</td>
      </tr>`;
  }).join("\n");

  const workflowRows = (auditResults.workflows || []).map((w, i) => {
    const statusIcon = w.shutoff ? "⛔ SHUT OFF" : w.ok ? "✅ OK" : "❌ FAILED";
    const statusColor = w.shutoff ? "#e67e22" : w.ok ? "#27ae60" : "#e74c3c";
    const stepList = (w.steps || []).map((s) => `<li>${escapeHtml(s.text)} ${s.screenshot ? "📸" : ""}</li>`).join("");
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(w.name)}</td>
        <td style="color:${statusColor};font-weight:bold;">${statusIcon}</td>
        <td>${(w.steps || []).length}</td>
        <td>${stepList || "No steps captured"}</td>
        <td>${escapeHtml(w.error || "")}</td>
      </tr>`;
  }).join("\n");

  const shutoffRows = auditResults.pages
    .filter((p) => p.shutoff)
    .map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name || p.url)}</td>
        <td>${escapeHtml(p.shutoffReason || "Unknown")}</td>
        <td>${escapeHtml(p.shutoffType || "")}</td>
      </tr>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>GHL Audit Report - ${locationId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.6; }
  .cover { page-break-after: always; padding: 80px 60px; text-align: center; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; }
  .cover h1 { font-size: 42px; margin-bottom: 10px; letter-spacing: 2px; }
  .cover h2 { font-size: 20px; font-weight: 300; color: #e94560; margin-bottom: 40px; }
  .cover .meta { font-size: 14px; color: #a0a0b0; }
  .cover .meta div { margin: 6px 0; }
  .section { padding: 40px 50px; page-break-inside: avoid; }
  .section h2 { font-size: 24px; color: #0f3460; border-bottom: 3px solid #e94560; padding-bottom: 8px; margin-bottom: 20px; }
  .summary-cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 30px; }
  .card { flex: 1; min-width: 150px; padding: 20px; border-radius: 8px; text-align: center; }
  .card h3 { font-size: 32px; margin-bottom: 4px; }
  .card p { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
  .card.ok { background: #eafaf1; border: 1px solid #27ae60; }
  .card.ok h3 { color: #27ae60; }
  .card.warn { background: #fef9e7; border: 1px solid #e67e22; }
  .card.warn h3 { color: #e67e22; }
  .card.fail { background: #fdedec; border: 1px solid #e74c3c; }
  .card.fail h3 { color: #e74c3c; }
  .card.info { background: #eaf2f8; border: 1px solid #2980b9; }
  .card.info h3 { color: #2980b9; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
  th { background: #0f3460; color: white; padding: 10px 8px; text-align: left; font-weight: 600; }
  td { padding: 8px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
  tr:nth-child(even) { background: #f8f9fa; }
  ul { margin: 4px 0 4px 16px; font-size: 11px; }
  .footer { text-align: center; padding: 30px; font-size: 11px; color: #999; border-top: 1px solid #e0e0e0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="cover">
  <h1>GoHighLevel Audit Report</h1>
  <h2>Comprehensive Browser Audit</h2>
  <div class="meta">
    <div>Location ID: ${escapeHtml(locationId)}</div>
    <div>Generated: ${new Date().toUTCString()}</div>
    <div>Tool Version: 2.0.0</div>
    <div>Total Pages Audited: ${auditResults.pages.length}</div>
  </div>
</div>

<div class="section">
  <h2>Executive Summary</h2>
  <div class="summary-cards">
    <div class="card ok"><h3>${pagesOk}</h3><p>Pages OK</p></div>
    <div class="card warn"><h3>${pagesShutoff}</h3><p>Shut Off</p></div>
    <div class="card fail"><h3>${pagesFailed}</h3><p>Failed</p></div>
    <div class="card info"><h3>${totalScreenshots}</h3><p>Screenshots</p></div>
    <div class="card info"><h3>${totalIssues}</h3><p>Issues</p></div>
    <div class="card info"><h3>${(auditResults.workflows || []).length}</h3><p>Workflows</p></div>
  </div>
  <p style="color:#666;">Audit completed at ${new Date().toLocaleString()}. ${pagesShutoff > 0 ? `<strong>${pagesShutoff} pages were detected as shut off by the administrator.</strong>` : ""} ${pagesFailed > 0 ? `<strong>${pagesFailed} pages failed to load.</strong>` : ""}</p>
</div>

<div class="section">
  <h2>Page Audit Results</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Page</th><th>Status</th><th>Headings</th><th>Buttons</th><th>Screenshots</th><th>Issues</th><th>Load Time</th><th>Body Sample</th>
      </tr>
    </thead>
    <tbody>${pageRows}</tbody>
  </table>
</div>

${(auditResults.workflows || []).length > 0 ? `
<div class="section">
  <h2>Workflow Audit Results</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Workflow</th><th>Status</th><th>Steps</th><th>Step Details</th><th>Error</th></tr>
    </thead>
    <tbody>${workflowRows}</tbody>
  </table>
</div>` : ""}

${shutoffRows ? `
<div class="section">
  <h2>Admin Shutoff Pages</h2>
  <p style="color:#e67e22;margin-bottom:12px;">These pages were detected as shut off or disabled by the administrator. They were skipped during the audit.</p>
  <table>
    <thead><tr><th>#</th><th>Page</th><th>Reason</th><th>Type</th></tr></thead>
    <tbody>${shutoffRows}</tbody>
  </table>
</div>` : ""}

<div class="section">
  <h2>Console & Network Issues</h2>
  ${totalIssues > 0 ? `
  <table>
    <thead><tr><th>Page</th><th>Issue</th></tr></thead>
    <tbody>
      ${auditResults.pages.flatMap((p) => (p.issues || []).map((iss) => `
        <tr><td>${escapeHtml(p.name || p.url || "")}</td><td style="color:#e74c3c;">${escapeHtml(typeof iss === "string" ? iss : iss.message || iss.type || "Unknown")}</td></tr>
      `)).join("")}
    </tbody>
  </table>` : `<p style="color:#27ae60;">No console or network issues detected.</p>`}
</div>

<div class="footer">
  <p>Audit Report generated by GHL Audit Tool v2.0.0 | ${new Date().toUTCString()}</p>
  <p>This report was generated by a read-only browser automation tool. No data was modified.</p>
</div>

</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function generatePdf(browser, auditResults, locationId, outputDir) {
  const html = buildHtmlReport(auditResults, locationId);
  const htmlPath = path.join(outputDir, "audit-report.html");
  fs.writeFileSync(htmlPath, html);

  const pdfPath = path.join(outputDir, `ghl-audit-report-${Date.now()}.pdf`);

  console.log(`\n\x1b[1;36m  Generating PDF report...\x1b[0m`);

  try {
    const context = browser.contexts()[0];
    const pdfPage = await context.newPage();
    await pdfPage.setViewportSize({ width: 1200, height: 1600 });
    await pdfPage.goto(`file://${htmlPath}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await pdfPage.waitForTimeout(2000);

    await pdfPage.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });

    await pdfPage.close().catch(() => {});
    console.log(`\x1b[1;32m✓ PDF report saved to: ${pdfPath}\x1b[0m`);
    return pdfPath;
  } catch (error) {
    console.log(`\x1b[1;33m⚠ PDF generation failed: ${error.message}\x1b[0m`);
    console.log(`\x1b[1;33m  HTML report still available at: ${htmlPath}\x1b[0m`);
    return null;
  }
}

module.exports = { generatePdf, buildHtmlReport };
