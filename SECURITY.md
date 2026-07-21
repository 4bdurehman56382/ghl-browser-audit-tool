# Security Policy

This tool is designed for read-only browser audits of GoHighLevel accounts. It can still capture sensitive account information in screenshots and reports, so generated outputs should be handled carefully.

## Do Not Commit

- `client-materials/`
- audit output
- screenshots
- cookies, browser profiles, or storage state
- real funnel IDs, step IDs, location IDs, credentials, or client names

## Browser Access

The tool uses Chrome DevTools Protocol. Attaching to an already-running browser requires:

```bash
AUDIT_ATTACH_EXISTING_CDP=1
```

Only attach to browsers you control and trust.

## Reporting Issues

For public forks, report security issues privately to the repo owner rather than opening issues with screenshots, credentials, or client details.
