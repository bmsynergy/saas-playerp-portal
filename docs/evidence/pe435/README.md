# PE-435.2 — Inventory and device management (DEV)

Implementation uses the PE-435.1 backend catalogue, venue search, Manage permissions and atomic Move contracts already committed in backend main at b35fc66000688681365e723ec61631c583f2c6ca. No backend or production changes in this step.

One acceptance record per criterion:

1. `browser-contracts.json`, criterion1: expanded deployments request only their execution's targets and open its events, without internal filters. `deployment.png`.
2. `browser-contracts.json`, criterion2: default model is the second catalogue item (`future/armhf`), city search selects venues with keyboard, Not assigned works, single Plus icon. `add.png`. `backend-read.json` confirms the live DEV default is `rpi4-2gb/arm64`.
3. `browser-contracts.json`, criterion3: DOM and visual order Search, Status, Assigned, Firmware version, Created From, Created Through, Clear filters; controls 44px, assignment/version reset, no page overflow at 390/834/1440px. `inventory.png`.
4. `browser-contracts.json`, criterion4: Open device sheet + Manage only; Assign, atomic Move, rejected Move, Unassign cancellation/confirmation, separate serial-confirmed Delete, blocked deletion hidden. `manage.png`.

Screenshots and contract tests use intercepted synthetic data, never mutate live devices. `tests/pe435-live.mjs` uses the existing DEV test staff account and performs read-only checks on the real backend and portal; it does not move, unassign or delete existing units. Credentials are outside the repository and never recorded. Physical devices and production are out of scope.

Validation: `npm test` (141/141), `npm run build`, `node tests/pe435-browser.mjs`, and the updated `node tests/pe432-browser.mjs` regression. Live check: `PORTAL_DEV_FIXTURES=<private account directory> node tests/pe435-live.mjs`. Local tests use port 18799.

Gaby reviewed the implementation read-only in this session against the four criteria. Her one minor finding (raw retired-device reason) was corrected; a follow-up confirmed the fix and no new findings. Final integration also checks catalogue cancellation and combobox Escape behavior.
