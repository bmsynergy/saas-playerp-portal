# PE-447.2 — Print Servers by venue and shared filter controls

The venue overview consumes `portal_ps_venue_overview` from backend main `3655caa97974e2dc414b35885ebea1ededb41e9d`. Inventory remains the physical device list. Delete uses the existing backend gate and serial confirmation; only eligible Retired devices can be deleted. Retire remains a separate action that preserves the record.

Validation: `npm test` (281 tests passed), `npm run build`, and `node tests/pe447-browser.mjs`. The browser check covers 390 and 1440 pixels with synthetic, intercepted DEV responses; it does not authenticate a real user or mutate a real device. `checks.json` is the single browser evidence artifact for all four criteria. Screenshots show fixture data only.

- Criterion 1: two venue cards with device counts, states, keyboard expansion, device details and canonical sheet links; a separate Unassigned / In stock card links to Inventory and distinguishes stock from retired.
- Criterion 2: 56 visible controls measured per viewport, all 44px. Surfaces: list, Inventory, create dialog/combobox, dashboard, tenants, staff, firmware.
- Criterion 3: shared light icon/text clear action, disabled with no active filters; search/date/version/assignment are reset together.
- Criterion 4: no Delete for assigned, stock or blocked Retired; Retire preserves the row; exact serial is required for Delete; a late backend refusal keeps the row and disables the destructive gate.

Gaby reviewed the working diff read-only in the same session against criteria 1–4 and reported no verifiable defects. Publication and live authenticated access were outside that review. Publication uses only `coredeva-publish playerp.dev <commit>`, after the commit exists on the remote DEV branch. Production and backend data are not changed by this work.
