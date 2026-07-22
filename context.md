# Browser Audit Tool Context

## Current Workspace Layout

The workspace is split into two top-level folders:

- `audit-tool/`: reusable GoHighLevel browser audit scripts, Node package files, and dependencies.
- `client-materials/`: client/run-specific reports, screenshots, markdown files, PDFs, docs, images, links, and other reference material.

The workspace IS a git repository (initialized with the v2.0.0 tool).

## What The Audit Tool Does

The audit tool is a set of Node.js scripts using `playwright-core` to connect to a Chromium/Chrome browser through the Chrome DevTools Protocol endpoint:

```bash
http://127.0.0.1:9222
```

The tool now automatically launches Chrome with remote debugging enabled (with a user warning beforehand). It does not perform login itself — the user must log into GoHighLevel manually once the browser opens.

The scripts are **read-only** browser automation. They navigate or inspect pages, extract visible page data, take screenshots, and write JSON/Markdown/PDF summaries. The tool does NOT submit forms, delete data, disconnect integrations, purchase products, export/import data, or change any settings.

## Key Features (v2.0.0)

### Auto Chrome Launch with Warning
The tool automatically finds and launches Chrome/Chromium with `--remote-debugging-port=9222`. Before starting, it displays a detailed warning explaining exactly what the tool will do and requires the user to type "yes" to proceed.

### Visual Cursor Simulation
A red circle cursor with a pulsing ring is injected into every page. The cursor moves slowly across the screen as the bot navigates, giving clear visual feedback about what the tool is doing. A horizontal scan line follows the cursor movement.

### Slow Navigation (45-Second Page Load Timer)
Instead of quick 10-30 second waits, the enhanced tool waits up to **45 seconds** (or until fully loaded) per page. It polls the page content every few seconds, logging progress to the terminal. This ensures slow-loading or heavily dynamic pages are captured once they fully render.

### Admin Shutoff Detection
The tool automatically detects when a page or feature has been disabled/shut off by the administrator. It checks for signals including:
- Access denied / unauthorized pages
- Subscription expired / upgrade required
- Billing issues / payment required
- Account suspended / disabled / locked
- Feature disabled / unavailable
- Page not found (404)
- Redirect to login
- Maintenance mode pages

When a strong shutoff signal is detected, the page is **skipped silently** — no error is thrown, just logged as "shut off by admin" in the report. Empty or slow-loading pages are no longer treated as admin shutoff by default; they are recorded as timeout/blank-page audit issues unless a stronger shutoff signal is present.

### Workflow Navigation & Capture
The tool navigates to the Automation → Workflows section and:
- Finds all visible workflow links
- Clicks into each workflow one by one
- Captures the workflow builder/overview with full-page screenshots
- Identifies individual workflow steps (triggers, actions, conditions)
- Moves the cursor to each step and takes dedicated step screenshots
- Records step text for the audit report

### Automatic PDF Report Generation
After the audit completes, the tool generates a professional PDF report containing:
- Cover page with audit metadata
- Executive summary with OK/shutoff/failed counts
- Detailed page-by-page audit table (status, headings, buttons, screenshots, issues, load time, body sample)
- Workflow audit table with step details
- Admin shutoff pages section with reasons
- Console and network issues section
- Color-coded status indicators (green=OK, orange=shut off, red=failed)

### Strictly Read-Only
The tool is designed for evidence gathering, not mutation. It does NOT:
- Submit forms or click "save"/"submit" buttons
- Delete, remove, or disconnect anything
- Purchase, export, or import data
- Change any settings
- Impersonate users or perform OAuth flows
- Navigate to risky URLs (logout, delete, remove, disconnect, etc.)

## Required Environment

Most location-specific scripts require:

```bash
GHL_LOCATION_ID=your_location_id
```

Optional output override:

```bash
AUDIT_OUTPUT_DIR=/path/to/output
```

If `AUDIT_OUTPUT_DIR` is not set, output defaults to:

```bash
client-materials/audit-output
```

Optional limits:

```bash
MAX_PAGES=200  # max pages to crawl (default: 200)
AUDIT_PROFILE=store  # run the efficient store smoke profile
AUDIT_TIERED=1  # smoke-first, signal-based deep dive
AUDIT_DEEP_DIVE_LIMIT=12  # max flagged pages to revisit in tiered mode
```

Optional browser/CDP controls:

```bash
CHROME_PATH=/path/to/chrome
AUDIT_CDP_PORT=9222
AUDIT_CDP_URL=http://127.0.0.1:9222
AUDIT_ATTACH_EXISTING_CDP=1
AUDIT_CHROME_NO_SANDBOX=1
```

`AUDIT_ATTACH_EXISTING_CDP=1` is required when the tool finds a browser already listening on the CDP endpoint. This avoids accidentally attaching to the wrong browser.

Optional open-tab-only mode:

```bash
OPEN_TABS_ONLY=1
```

Without `GHL_LOCATION_ID`, the main audit refuses to run unless `OPEN_TABS_ONLY=1` is set. With `GHL_LOCATION_ID`, open-tab capture is scoped to that location by default. Set `AUDIT_ALLOW_ALL_GHL_TABS=1` only when you intentionally want to include other GoHighLevel tabs.

## Main Entry Point: `audit.js`

The enhanced orchestrator that runs the full audit pipeline in 4 phases:

```bash
GHL_LOCATION_ID=your_location_id node audit.js
```

### Phase 1: Deep Page Audit
- Builds a seed list of 65+ GoHighLevel routes across all sections
- Navigates to each page with a 45-second max load timer
- Injects visual cursor and slowly scrolls/animates across the page
- Extracts page data: headings, buttons, fields, links, images, stats
- Takes full-page screenshots
- Detects admin-shutoff pages and skips them
- Discovers internal links and enqueues more pages (up to MAX_PAGES)

When `AUDIT_PROFILE=store` is set, Phase 1 becomes an efficient store smoke audit. It checks the highest-signal store surfaces first:

- Stores
- Products
- Orders
- Transactions
- Domains
- Analytics
- URL redirects

With tiered mode enabled (`AUDIT_TIERED=1`, automatically enabled by the store profile), the tool deep-dives only pages with actionable signals:

- failed navigation
- page timeout or thin visible body content
- console/runtime errors
- horizontal overflow
- images that appear broken
- required fields without clear labels

This gives a faster first answer for GHL store audits while still preserving evidence and depth where the smoke pass finds risk.

### Phase 2: Workflow Audit
- Navigates to Automation → Workflows
- Finds all workflow links
- Visits each workflow, captures overview screenshot
- Identifies workflow steps and captures step-by-step screenshots
- Records step text for the report

### Phase 3: Open Tab Capture
- Captures currently open GoHighLevel browser tabs that pass the read-only safety filter
- Scopes tabs to the configured `GHL_LOCATION_ID` by default
- Takes screenshots and extracts page content from each tab

### Phase 4: PDF Report Generation
- Builds a comprehensive HTML report
- Converts it to a formatted A4 PDF with print backgrounds
- Saves both HTML and PDF versions

## Library Modules (`audit-tool/lib/`)

### `chrome.js`
- Finds Chrome/Chromium on the system (Linux, macOS, Windows)
- Honors `CHROME_PATH` when provided
- Supports `AUDIT_CDP_URL` / `AUDIT_CDP_PORT`
- Checks if CDP is already alive on the configured endpoint
- Requires `AUDIT_ATTACH_EXISTING_CDP=1` before attaching to an already-running CDP browser
- Launches Chrome with `--remote-debugging-port=9222` and a dedicated user data directory
- Displays detailed pre-audit warning and asks for confirmation
- Returns control once CDP is confirmed alive

### `config.js`
- Validates `GHL_LOCATION_ID`
- Parses positive integer environment values such as `MAX_PAGES`
- Resolves output directories consistently
- Loads and schema-checks funnel JSON config
- Loads and schema-checks retry route JSON config

### `safety.js`
- Normalizes GoHighLevel URLs
- Strips volatile UI parameters like `modal`, `drawer`, `showModal`, and `preview`
- Enforces exact location scoping so similar IDs cannot bleed into another location
- Rejects risky read/write/navigation URLs such as logout, delete, remove, disconnect, oauth, export, import, purchase, webhook, and related actions
- Creates safe screenshot/report filenames

### `browser-context.js`
- Provides a checked default browser context helper
- Produces a clear error if CDP is reachable but no browser context is available

### `cursor.js`
- Injects visual cursor (red circle with pulsing ring) into pages
- Moves cursor slowly with configurable step count
- Animates cursor across the page in a sine-wave pattern
- Moves cursor to specific DOM element positions
- Scrolls the page while tracing with the cursor
- Shows a horizontal scan line effect

### `detector.js`
- Extracts readable content from pages
- Detects admin shutoff via pattern matching on body text and title
- Covers: access denied, subscription expired, billing issues, account suspended, feature disabled, page not found, login redirect, maintenance mode
- Can optionally classify empty bodies, but the main scanner disables that during slow-load detection to avoid false shutoff reports
- Returns structured result with shutoff status, reason, and type

### `scanner.js`
- Core page scanning engine
- Extracts comprehensive page data (headings, buttons, fields, links, images, stats)
- Implements 45-second polling wait for page readiness
- Records slow/blank pages as timeout issues instead of silently treating them as admin shutoff
- Cleans up console/pageerror listeners after each scan
- Takes full-page screenshots with cursor visible
- Handles per-page console/error tracking
- Controls viewport size for consistent captures

### `tiered-audit.js`
- Defines the efficient store smoke route set
- Validates audit profile selection
- Scores page records for deep-dive priority
- Produces tiered audit metadata for JSON and Markdown output

### `workflows.js`
- Navigates to Automation → Workflows section
- Finds workflow links using valid DOM CSS selectors
- Filters workflow links through the same read-only location safety checks
- Walks through each workflow capturing overview and step screenshots
- Moves cursor to each workflow step for visual feedback
- Handles shutoff detection on workflow pages

### `report-pdf.js`
- Builds professional HTML report with CSS styling
- Generates A4 PDF with print backgrounds
- Includes cover page, executive summary, detailed tables
- Color-coded status indicators
- Escapes dynamic report content
- Uses safe file URLs for HTML-to-PDF conversion
- Falls back to HTML-only if PDF generation fails

## Original Scripts (Preserved)

### `capture-ghl-readonly.js`
Captures currently open GoHighLevel app tabs with desktop/mobile screenshots. It filters to safe GoHighLevel app URLs and disconnects from CDP without closing the browser.

### `section-walk-ghl-readonly.js`
Walks through major sections (Dashboard, Opportunities, Sites, Marketing, Automation, Reputation, Reporting) by navigating to known read-only routes instead of clicking arbitrary sidebar text.

### `deep-ghl-readonly-crawl.js`
Deep location crawl from predefined seed routes. Covers dashboard, conversations, calendars, contacts, opportunities, payments, AI agents, marketing, automation, sites, memberships, reputation, reporting, integrations, settings.

### `targeted-ghl-tabs-readonly.js`
Audits fixed target routes needing extra attention (AI agents, calendar settings, automation workflows/folders, marketing trigger links, sites blogs/analytics/QR/client-portal).

### `retry-missed-pages-30s.js`
Retries pages that may load slowly (up to 30s). Checks for meaningful body content. Supports extra retry routes via `GHL_RETRY_ROUTES_JSON`.

### `funnel-tabs-readonly.js`
Audits configured funnel tabs (Overview, Products, Publishing, Stats, Sales, Security, Events, Settings). Requires `GHL_FUNNELS_JSON`.

## Output Structure

Default output root:

```bash
client-materials/audit-output
```

Generated files from `audit.js`:

- `audit-results.json` — Full structured audit data (pages, workflows, summary)
- `audit-summary.md` — Markdown summary report
- `audit-report.html` — HTML report (also used to generate PDF)
- `ghl-audit-report-{timestamp}.pdf` — Final PDF audit report
- `screenshots/*.png` — All page screenshots
- `workflow-screenshots/*.png` — Workflow step screenshots

Original scripts write to their respective subdirectories:

- `ghl-browser-capture.json` / `ghl-browser-capture-summary.md`
- `section-walk/`
- `deep-ghl-audit/` (deep crawl, targeted, missed-retry, funnel-tabs)

## Typical Run Flow

From the workspace root:

```bash
cd audit-tool
```

### Enhanced Full Audit (recommended):

```bash
GHL_LOCATION_ID=your_location_id node audit.js
```

The tool will:
1. Display the warning
2. Ask for confirmation
3. Launch Chrome with remote debugging
4. Wait for you to log into GoHighLevel
5. Execute all 4 phases automatically
6. Generate the PDF report

### Individual Scripts:

```bash
node capture-ghl-readonly.js
node section-walk-ghl-readonly.js
GHL_LOCATION_ID=your_location_id node deep-ghl-readonly-crawl.js
GHL_LOCATION_ID=your_location_id node targeted-ghl-tabs-readonly.js
GHL_LOCATION_ID=your_location_id node retry-missed-pages-30s.js
GHL_LOCATION_ID=your_location_id GHL_FUNNELS_JSON=/path/to/funnels.json node funnel-tabs-readonly.js
```

## Important Design Notes

- Keep client-specific docs, images, IDs, route config files, and final reports in `client-materials/`.
- Keep reusable scripts and dependency files in `audit-tool/`.
- Do not hard-code client names, location IDs, funnel IDs, or step IDs into `audit-tool/`.
- Use environment variables or JSON config files for run-specific data.
- The scripts are designed for evidence gathering, not mutation.
- The deep crawler has a deny list for risky URLs, and the main audit tool extends this with additional safety checks.
- Full audits require `GHL_LOCATION_ID`; open-tab-only runs require explicit `OPEN_TABS_ONLY=1`.
- Attached CDP sessions use `browser.disconnect()` instead of `browser.close()` so the tool does not close a user browser.
- The tool uses a dedicated Chrome user data directory (`~/.audit-tool-chrome-profile`) to avoid interfering with your regular Chrome profile.

## Validation

All JavaScript files in `audit-tool/` pass:

```bash
node --check
```

Or run the check script:

```bash
npm run check
```

The offline test suite covers config validation, URL safety, admin-shutoff detection, page readiness polling, PDF report escaping, issue text rendering, and workflow selector validity:

```bash
npm test
```

## Git

The workspace is a git repository. To view history:

```bash
git log --oneline
```
