# Agent Instructions

This repository contains a reusable GoHighLevel browser audit tool. Treat `audit-tool/` and root documentation as the source of truth.

## Boundaries

- Do not read, stage, commit, or summarize files in `client-materials/` unless the user explicitly asks for client material work.
- Do not hard-code client names, location IDs, funnel IDs, step IDs, credentials, browser cookies, or report data into reusable source.
- Keep run-specific config in environment variables or external JSON files.
- Preserve the read-only audit model. Do not add clicks or flows that submit forms, save settings, delete, export, import, disconnect, purchase, impersonate, or perform OAuth.

## Validation

Run from the repository root:

```bash
npm test
```

Or from `audit-tool/`:

```bash
npm test
```

## Code Style

- Use CommonJS modules to match the existing Node scripts.
- Prefer shared helpers in `audit-tool/lib/config.js` and `audit-tool/lib/safety.js` over duplicating env parsing or URL safety logic.
- Keep browser attachment behavior explicit. Existing CDP attachment requires `AUDIT_ATTACH_EXISTING_CDP=1`.
- Attached CDP sessions should call `browser.disconnect()`, not `browser.close()`.
