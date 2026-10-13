# PE-432.2 — Print Server administration flow (DEV)

Backend prerequisite verified in GitHub: `bmsynergy/saas-playerp-backend` main
`8a097cbac1fcf19da3879f213a72839b6a11eab5`, migration
`20261013200000_pe432_ps_alta_generica_borrado_update_unico.sql` and the matching
`ps-ota-admin` Edge Function from PE-432.1. This frontend changes no backend schema,
credential rotation, recovery label, or local-device link.

- `browser-contracts.json`: real frontend with intercepted API responses, 390/834/1440 px. Version navigation, generic catalogue model and review, serial-confirmed deletion, backend blockers, single-device update body, active/terminal expansion and polling transition, actual target progress and absence of overflow. Run `node tests/pe432-browser.mjs` against an isolated server on port 18799.
- `backend-live.json`: local frontend with the real DEV backend and ordinary authorized DEV test account. Firmware navigation, current/no-stable display, one disposable unassigned device created and deleted through the UI, and responsive Updates. Run `PORTAL_DEV_FIXTURES=<existing account directory> node tests/pe432-live.mjs`. The same script accepts `PORTAL_TEST_ORIGIN=https://playerp.dev.bmore.app` for post-publication verification.
- `picker-regression.json`: existing PE-417 device picker, English/Spanish and 320–1920 px, preserves selection and layout. `node tests/pe417-device-cards.mjs`.
- `npm test`: 134 tests, including seven PE-432 data/action contract tests. `npm run build` passes.

There is no qualifying stable firmware in DEV at verification time. The real UI therefore
correctly disables Update; the successful single-device operation is covered with an
intercepted backend contract, not a physical firmware deployment. No physical update was sent.

Gaby reviewed the changes read-only in this session. Her initial finding was that a deployment
retained its expanded state after becoming terminal during polling. An effect now follows the
active-to-terminal transition; the browser test verifies it at all three widths. Follow-up:
no remaining verifiable findings.
