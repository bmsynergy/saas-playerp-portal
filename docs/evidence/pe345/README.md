# PE-345 — Owner Workspace

The owner root opens the single authorized venue's Dashboard, or an Overview when multiple venues are available. Overview cards use only `portal_access.owner_venues` (name, address/location, active state). Missing values stay missing. No billing, subscription, user-count or Print Server metrics are inferred. No new API or backend change.

The URL records venue and section. A fresh `/` always opens Overview for multiple venues, regardless of a historical stored selection. Direct links are checked against the current access response before requesting venue detail. Users retains its owner-only gate; approved venue members retain their existing Print Server access. Dashboard, Venue details, Users and Print Servers appear in the sidebar; the old in-page tabs, selector and venue list are removed. The sidebar has one venue selector only for multiple venues; the mobile topbar keeps the venue name visible.

Base: latest published portal `11a464ef910ae2a18d51472df2c97f1d5f364ccc`, plus its existing evidence commit `0f71fa9`. The historical `uma/portal-dev-resume` branch is superseded by that base; all later portal features are retained.

Validation:

- `npm test`: 70 tests pass, including owner section login destinations and denied/no-membership scope rules.
- `npm run build`: TypeScript and Vite production build pass.
- `tests/owner-workspace-live.mjs`: real DEV sessions (`owner_uno`, `owner_varios`), 1440px and 390px, no API interception or business-data mutations. Direct single-venue entry, multi-venue Overview, real card data, details/users/Print Servers, switch/reload, fresh entry, EN/ES and foreign venue denial pass. Temporary test sessions are revoked afterwards. `local-real-dev.json` records the local UI connected to real DEV backend.
- `tests/owner-workspace-states.mjs`: seven intercepted-fixture scenarios cover access loading/error/retry/no-membership, scoped detail error/empty response, missing fields, approved-member Users denial, unknown venue denial without requesting it, history and mobile drawer. These deterministic fixtures are not evidence of backend authorization.

Both browser scripts accept `PORTAL_TEST_ORIGIN`, `SMOKE_OUTPUT_DIR`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The live script additionally requires the existing controlled DEV fixture directory in `PORTAL_DEV_FIXTURES`. Credentials and tokens are never included in evidence.
