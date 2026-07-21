# Browser Audit Tool Context

## Current Workspace Layout

The workspace is split into two top-level folders:

- `audit-tool/`: reusable GoHighLevel browser audit scripts, Node package files, and dependencies.
- `client-materials/`: client/run-specific reports, screenshots, markdown files, PDFs, docs, images, links, and other reference material.

The workspace is not currently a git repository.

## What Was Done

- Created a clean two-folder structure:
  - `audit-tool`
  - `client-materials`
- Moved all browser automation scripts into `audit-tool/`.
- Moved `package.json`, `package-lock.json`, and `node_modules` into `audit-tool/`.
- Moved generated audit output, screenshots, dashboard captures, opportunity images, case study files, and other client materials into `client-materials/`.
- Moved `browser-audit-tools/Things-u-couldnt-load` into `client-materials/Things-u-couldnt-load`.
- Removed the old empty `browser-audit-tools` folder.
- Renamed the npm package from the old workspace name to `audit-tool`.
- Added `audit-tool/audit-paths.js` so scripts share output path logic and required environment checks.
- Removed the hard-coded GoHighLevel location ID from the reusable scripts.
- Removed hard-coded run-specific funnel IDs from the reusable scripts.
- Updated generated outputs to default to `client-materials/audit-output` instead of writing into `audit-tool`.
- Verified all JavaScript files in `audit-tool/` with `node --check`.

## What The Audit Tool Does

The audit tool is a set of Node.js scripts using `playwright-core` to connect to an already-open Chromium/Chrome browser through the Chrome DevTools Protocol endpoint:

```bash
http://127.0.0.1:9222
```

The tool assumes the browser is already logged into GoHighLevel and has access to the target location. It does not perform login itself.

The scripts are read-only browser automation. They navigate or inspect pages, extract visible page data, take screenshots, and write JSON/Markdown summaries.

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

`funnel-tabs-readonly.js` also requires:

```bash
GHL_FUNNELS_JSON=/path/to/funnels.json
```

That JSON file should contain:

```json
[
  {
    "name": "Funnel Name",
    "funnelId": "funnel_id",
    "stepId": "step_id"
  }
]
```

`retry-missed-pages-30s.js` can optionally load additional run-specific retry routes:

```bash
GHL_RETRY_ROUTES_JSON=/path/to/routes.json
```

That JSON file should contain route objects like:

```json
[
  {
    "name": "example-route",
    "path": "/funnels-websites/funnels/example/steps/example/publishing",
    "expect": ["Publishing"],
    "minBody": 500
  }
]
```

## Scripts

### `audit-tool/capture-ghl-readonly.js`

Captures all currently open GoHighLevel browser tabs.

For each matching tab, it:

- Captures desktop and mobile screenshots.
- Extracts visible headings.
- Extracts visible buttons/actions.
- Extracts forms and visible fields.
- Extracts links and images.
- Checks horizontal overflow on desktop and mobile.
- Samples console warnings/errors.
- Writes `ghl-browser-capture.json`.
- Writes `ghl-browser-capture-summary.md`.
- Writes screenshots to `screenshots/`.

This script does not require `GHL_LOCATION_ID` because it works from already-open tabs.

### `audit-tool/section-walk-ghl-readonly.js`

Walks through major sidebar sections from the currently open GoHighLevel location page.

Sections covered:

- Dashboard
- Opportunities
- Sites
- Marketing
- Automation
- Reputation
- Reporting

For each section, it:

- Clicks the section by visible text.
- Waits briefly for the page to load.
- Captures a screenshot.
- Extracts URL, title, headings, visible actions, and a body sample.
- Writes `section-walk.json`.
- Writes `section-walk-summary.md`.

This script finds an existing open page whose URL contains `app.gohighlevel.com/v2/location/`.

### `audit-tool/deep-ghl-readonly-crawl.js`

Performs a deeper location crawl from a predefined list of GoHighLevel seed routes.

It requires:

```bash
GHL_LOCATION_ID=your_location_id
```

It covers broad areas including dashboard, conversations, calendars, contacts, opportunities, payments, AI agents, marketing, automation, sites, memberships, media storage, reputation, reporting, integrations, and settings.

For each page, it:

- Navigates to the route.
- Waits for page content.
- Extracts visible headings, buttons, fields, links, table-like content, body text, and page metrics.
- Captures a full-page screenshot.
- Tracks network responses with GoHighLevel URLs returning `400+`.
- Tracks console warnings/errors and page errors.
- Discovers internal links and can enqueue more pages.
- Avoids unsafe/destructive URLs containing words like logout, delete, remove, disconnect, purchase, oauth, export, or import.
- Writes deep crawl JSON and Markdown summary output.

The crawl limit defaults to:

```bash
MAX_PAGES=120
```

This can be overridden with:

```bash
MAX_PAGES=200
```

### `audit-tool/targeted-ghl-tabs-readonly.js`

Audits a fixed set of targeted GoHighLevel routes that often need extra attention.

It requires:

```bash
GHL_LOCATION_ID=your_location_id
```

Targeted areas include:

- AI agent pages
- Ask AI
- Calendar settings and appointments
- Settings calendar tabs
- Automation workflows and folders
- Marketing trigger links
- Sites blogs, analytics, QR codes, and client portal

For each route, it:

- Navigates directly to the route.
- Waits 15 seconds.
- Extracts title, headings, actions, and body text.
- Captures a screenshot.
- Writes `targeted-tabs.json`.
- Writes `targeted-tabs-summary.md`.

### `audit-tool/retry-missed-pages-30s.js`

Retries pages that may load slowly or fail during the main crawl.

It requires:

```bash
GHL_LOCATION_ID=your_location_id
```

It waits up to 30 seconds for each route to become meaningful. Meaningful means:

- Body text length reaches the route minimum.
- Expected words appear in the body text, when configured.

For each route, it:

- Navigates directly to the route.
- Repeatedly samples page content until meaningful or timed out.
- Captures a screenshot whether the page loads or errors.
- Extracts body text, headings, actions, fields, and page stats.
- Writes `missed-retry-30s.json`.
- Writes `missed-retry-30s-summary.md`.

Extra run-specific retry routes can be supplied with `GHL_RETRY_ROUTES_JSON`.

### `audit-tool/funnel-tabs-readonly.js`

Audits configured funnel tabs.

It requires:

```bash
GHL_LOCATION_ID=your_location_id
GHL_FUNNELS_JSON=/path/to/funnels.json
```

For each configured funnel, it visits:

- Overview
- Products
- Publishing
- Stats
- Sales
- Security
- Events
- Settings

For each tab, it:

- Navigates directly to the tab URL.
- Waits 10 seconds.
- Captures body text.
- Captures a full-page screenshot.
- Writes `funnel-tabs.json`.
- Writes `funnel-tabs-summary.md`.

## Output Structure

Default output root:

```bash
client-materials/audit-output
```

Common generated files:

- `ghl-browser-capture.json`
- `ghl-browser-capture-summary.md`
- `screenshots/*.png`
- `section-walk/section-walk.json`
- `section-walk/section-walk-summary.md`
- `section-walk/*.png`
- `deep-ghl-audit/deep-crawl.json`
- `deep-ghl-audit/deep-crawl-summary.md`
- `deep-ghl-audit/screenshots/*.png`
- `deep-ghl-audit/targeted/targeted-tabs.json`
- `deep-ghl-audit/targeted/targeted-tabs-summary.md`
- `deep-ghl-audit/targeted/*.png`
- `deep-ghl-audit/missed-retry-30s/missed-retry-30s.json`
- `deep-ghl-audit/missed-retry-30s/missed-retry-30s-summary.md`
- `deep-ghl-audit/missed-retry-30s/screenshots/*.png`
- `deep-ghl-audit/funnel-tabs/funnel-tabs.json`
- `deep-ghl-audit/funnel-tabs/funnel-tabs-summary.md`
- `deep-ghl-audit/funnel-tabs/*.png`

## Typical Run Flow

From the workspace root:

```bash
cd audit-tool
```

Start or connect Chrome/Chromium with remote debugging enabled on port `9222`, then log into GoHighLevel manually.

Run broad captures:

```bash
node capture-ghl-readonly.js
node section-walk-ghl-readonly.js
GHL_LOCATION_ID=your_location_id node deep-ghl-readonly-crawl.js
GHL_LOCATION_ID=your_location_id node targeted-ghl-tabs-readonly.js
GHL_LOCATION_ID=your_location_id node retry-missed-pages-30s.js
```

Run funnel tab capture:

```bash
GHL_LOCATION_ID=your_location_id GHL_FUNNELS_JSON=/path/to/funnels.json node funnel-tabs-readonly.js
```

## Important Design Notes

- Keep client-specific docs, images, IDs, route config files, and final reports in `client-materials/`.
- Keep reusable scripts and dependency files in `audit-tool/`.
- Do not hard-code client names, location IDs, funnel IDs, or step IDs into `audit-tool/`.
- Use environment variables or JSON config files for run-specific data.
- The scripts are designed for evidence gathering, not mutation.
- Avoid adding any click behavior that submits forms, deletes data, disconnects integrations, purchases products, exports/imports data, or changes settings.
- The deep crawler has a deny list for risky URLs, but any new navigation logic should still be reviewed carefully.

## Validation Performed

All current JavaScript files in `audit-tool/` passed:

```bash
node --check
```

The reusable tool folder was scanned for known client-specific strings after cleanup, excluding dependencies and lockfiles.
