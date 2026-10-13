# PE-431.1 — pagination and on-demand Audit frontend

Status: frontend prepared; publication blocked by the existing overview read contract.
Work: `eedebd59-b5e6-42e1-9e7a-b4df4c6d9ba4`.
Base portal commit: `643a3a995fd3b78f45b9c6ae99fc736f93dcba66`.

The shared pager now renders `Page [number] of N`, with Previous/Next, Enter/Go,
integer range validation, localized labels and narrow-screen layout. Printer job
queues use this same control. The Audit list waits for an explicit Search, hides
results while new filters are prepared, and does not poll. Technical details span
the row, wrap long content and provide a copy button with success/failure feedback.

## Verification

- `npm run build`: passed.
- `npm test`: 127 tests passed in 17 files.
- `node tests/pe409-lists.mjs`: expanded browser coverage for direct jumps, 63-row
  client/server lists, printer job offsets, empty/reset/filter states, invalid
  inputs, explicit audit-page search and re-entry, no audit-page polling,
  full-width details and exact clipboard content. Synthetic backend responses;
  not evidence of live authorization or complete on-demand backend behavior.
- The final browser run exited 0 with `errors: []`, `frontendChecksPassed: true`
  and `portalAcceptanceComplete: false`. The latter intentionally remains false:
  the harness explicitly asserts that the initial overview still returns 50 Audit
  rows before Search. `frontend-checks.json` records the separation.
- Audit screenshots at 1440/390/320 px and sanitized reports are stored next to
  this document. Other synthetic run screenshots remain in `test-results/pe409`.
- Two additional older browser scripts (`collapsible-queues.mjs` and
  `print-dashboard.mjs`) stopped on an unimplemented `portal_tenant_detail`
  fixture before their full checks. Their pager selectors were adapted, but they
  are not claimed as passing. The expanded PE-409 suite supplies the integration
  verification for the changed controls. The live queue mutation test was not run.
- Gaby independently reviewed the diff read-only in the same session. The only
  reported product blocker was the automatic overview audit read below.

## Backend dependency — must resolve before publishing

`src/App.tsx` / `PrintUpdatesData` loads `getOtaOverview()` on entry and every ten
seconds. `src/lib/ota.ts` calls `ps_ota_admin_overview()` without parameters.
The current backend definition always reads and returns the latest 50 Audit rows:
`bmsynergy/saas-playerp-backend`, main
`cd36eb33d9c2bcd6515319d237ba59f39e94ed5a`,
`_migrations/20261007000000_pe385_ps_ota.sql`, lines 200–203.

A read-only check against the real DEV project on 2026-10-13 returned HTTP 200 and
50 Audit rows in that overview; see `overview-dev.json`. The dedicated audit-page
request can be deferred by the frontend, but this pre-existing bundled Audit read
cannot. Hiding those rows alone does not satisfy the approved no-load requirement.

Backend must provide an initial overview read that neither queries nor returns
Audit events while retaining the existing keys, releases, groups, devices and
permissions. The backend change must be committed and available in DEV, with its
consumption contract verified, before the frontend is integrated and published.
Keep the explicit paginated Audit endpoint and existing consumers compatible.

No backend files, infrastructure, PROD or DEV publication were changed in this run.
The frontend branch is saved for resumption; it is not the deployed version.
