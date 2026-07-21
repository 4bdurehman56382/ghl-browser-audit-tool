# GHL Browser Audit Tool

Read-only browser audit tooling for GoHighLevel accounts. The tool connects to a Chrome/Chromium browser over the Chrome DevTools Protocol, navigates safe GoHighLevel routes, captures screenshots, extracts visible page data, detects likely admin shutoff states, and generates JSON, Markdown, HTML, and PDF audit artifacts.

This repo is designed to be forked, imported by AI coding agents, and customized with client-specific config kept outside the reusable source.

## Safety Model

- No login automation. You log into GoHighLevel manually in the launched browser.
- No form submission, deletes, exports, imports, purchases, OAuth flows, disconnects, or settings mutations.
- Location-specific audits are scoped to `GHL_LOCATION_ID`.
- Open-tab-only capture requires explicit `OPEN_TABS_ONLY=1` when no location ID is set.
- Attaching to an already-running CDP browser requires explicit `AUDIT_ATTACH_EXISTING_CDP=1`.
- Client-specific reports, docs, screenshots, IDs, and route config should stay out of the repo.

## Repo Layout

- `audit-tool/`: reusable Node.js audit scripts and tests.
- `audit-tool/lib/`: shared config, safety, browser, scanner, workflow, cursor, and report modules.
- `audit-tool/test/`: offline Node test suite.
- `audit-tool/examples/`: safe example config files.
- `context.md`: fuller project context for humans and AI agents.
- `AGENTS.md`: guardrails for AI agents editing this repo.

## Requirements

- Node.js 18+
- Chrome or Chromium
- A GoHighLevel account you can log into manually

Install dependencies:

```bash
npm --prefix audit-tool install
```

Run checks and tests:

```bash
npm test
```

## Full Audit

```bash
cd audit-tool
GHL_LOCATION_ID=your_location_id npm run audit
```

The main audit:

1. Shows a warning and asks for confirmation.
2. Launches Chrome with remote debugging when needed.
3. Waits for you to log into GoHighLevel.
4. Crawls safe location routes.
5. Captures workflow screens.
6. Captures safe open tabs.
7. Generates audit outputs.

Default output:

```bash
client-materials/audit-output
```

Override output:

```bash
AUDIT_OUTPUT_DIR=tmp/audit-output GHL_LOCATION_ID=your_location_id npm run audit
```

## Useful Modes

Open-tab-only capture:

```bash
OPEN_TABS_ONLY=1 npm run audit
```

Attach to an already-running CDP browser:

```bash
AUDIT_ATTACH_EXISTING_CDP=1 GHL_LOCATION_ID=your_location_id npm run audit
```

Use a custom Chrome path or CDP endpoint:

```bash
CHROME_PATH=/path/to/chrome GHL_LOCATION_ID=your_location_id npm run audit
AUDIT_CDP_URL=http://127.0.0.1:9222 AUDIT_ATTACH_EXISTING_CDP=1 GHL_LOCATION_ID=your_location_id npm run audit
```

Limit crawl size:

```bash
MAX_PAGES=25 GHL_LOCATION_ID=your_location_id npm run audit
```

## Individual Scripts

From `audit-tool/`:

```bash
npm run capture
GHL_LOCATION_ID=your_location_id npm run section-walk
GHL_LOCATION_ID=your_location_id npm run deep-crawl
GHL_LOCATION_ID=your_location_id npm run targeted
GHL_LOCATION_ID=your_location_id npm run retry-missed
GHL_LOCATION_ID=your_location_id GHL_FUNNELS_JSON=examples/funnels.example.json npm run funnel-tabs
```

Use your own JSON files for funnel and retry route configs. Keep real client IDs outside the reusable repo.

## Example Configs

Funnel config shape:

```json
[
  {
    "name": "Example Funnel",
    "funnelId": "replace_with_funnel_id",
    "stepId": "replace_with_step_id"
  }
]
```

Retry route config shape:

```json
[
  {
    "name": "example-slow-page",
    "path": "/example/path",
    "expect": ["Expected Text"],
    "minBody": 500
  }
]
```

## Test Coverage

The offline suite covers:

- environment/config validation
- URL normalization and read-only route safety
- admin shutoff detection
- slow SPA readiness polling
- report HTML escaping and issue text rendering
- workflow selector validity

```bash
npm test
```

## Publishing Notes

This repo intentionally ignores `client-materials/` and `node_modules/`. Keep generated reports and real client config out of commits.
