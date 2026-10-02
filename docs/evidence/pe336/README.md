# PE-336 — shared venue sections

Owner `/` and Admin `/admin/tenants/:id` share `VenueDetailsPanel`,
`VenueSectionTabs`, `VenueUsersList` and `PrintServerDetailPage`.
Owner tabs are local state, reset on venue change. Admin routes remain unchanged.
The row actions in the two user views retain their different server contracts.

`VenuePrintServerData` receives venue metadata and scope. It reads `ps_panel_state`
for that venue with the signed-in user's session; embedded sections do not read
the global fleet. Its cache key includes scope, user and venue. The API rejects
mismatched venue answers and removes device notes from the owner projection.
The owner does not get platform enrollment/replacement/revocation controls or
Admin navigation; printer operations follow the server's `can_manage`. Users
follow the existing owner membership and platform capabilities respectively.

Printers and each queue start collapsed. Search filters only the current venue's
returned users/printers. Changing venue unmounts section state (filters, dialogs,
expansion, queue pages, notices), and stale unauthorized reads fail closed.

Backend prerequisite: `bmsynergy/saas-playerp-backend`, branch
`tomjr/pe336-owner-venue-read-dev`, commit `ff5f266`, including migration
`20261002205609_pe336_ps_panel_state_owner_read`. No backend change in this step;
no production or main-branch promotion.

Verification:

- `npm run build` and `npm test`: pass, 68 tests.
- `tests/owner-venue-live.mjs`: real DEV sessions and APIs, no mocks; local UI.
  `local-live.json` records owner, multi-venue and Admin, 390/1440 px and EN/ES,
  actual foreign/global denials, owner user-role and portal-access controls,
  approved member read-only PS and denied write. Test values restored in finally.
- `tests/owner-venue-states.mjs`: `local-states.json`, 27 synthetic scenarios for
  rare loading/error/empty/denied/readonly states, scoped search and reset,
  collapsed form activation from scan. These are not live permission evidence.
- `tests/print-servers-smoke.mjs`: 14 synthetic Admin regression checks, including
  queue pagination, printer actions, scan, enrollment, revoke and dialog focus.
- Gaby: read-only review of scope, authorization consumption, cache reset, shared
  UI and locale/responsive changes; `review_findings: []`. Confirmed passing live
  and synthetic reports and the scan/form correction in a closing review.

Screenshots show only DEV fixture data. No auth token, password or service key is
saved here. Live runner requires `PORTAL_DEV_FIXTURES` outside the repository.
Hosted verification on https://playerp.dev.bmore.app also passed after connector publication of 367efd0: `hosted-live.json` (9 real checks, no runtime errors) and `hosted-states.json` (27 intercepted UI-state checks). Served JS and CSS are byte-identical to the verified build. Both test-member changes were restored.
