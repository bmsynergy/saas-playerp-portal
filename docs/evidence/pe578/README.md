# PE-578.1 · Simplified PlayERP address card

Visual-only change; the API and permission/rename/availability logic remain unchanged.
The current address uses the existing four guards for Available and Open site.
Previous addresses start collapsed and keep their server status; verified aliases
are described as reserved, never assumed to serve the venue.

Validation: 412 tests passed (`npm test -- --reporter=dot`), `npm run build` passed,
and `node tests/pe578-address.mjs` passed. The browser test reuses the existing
PE-577 DEV read fixture, intercepts visual states, blocks mutation RPCs, and checks
unchanged persisted data. It covers ES/EN at 390/1440 px, long addresses, copy of
current and previous addresses, collapsed history, all four availability guards,
ambiguous/unconfigured/disabled states and reserved-name rejection. Screenshots
were visually inspected. No tenant creation or rename was performed.

Gaby reviewed the final diff read-only in the same session: no remaining findings
after the empty clipboard-feedback spacing was corrected. Older PE-577 browser
expectations were updated for the new heading and removal of the external domain;
the old live mutation scenario was deliberately not run for this visual change.
