# PE-433.2 — Owner PS rotation (DEV only)

The owner portal reuses PE-429's credential operations and the venue-scoped RPCs from PE-433.1. This change strengthens both confirmation texts, offers printing/replacing the physical recovery label after confirmed Wi-Fi application, and translates the backend's `device_not_assigned` rejection.

Backend prerequisite verified on GitHub: `saas-playerp-backend` main `93dbe0926c8e9446d317a204eb80eff61efa2db5`. No backend change, real rotation, firmware operation or production deployment in this work.

`node tests/pe433-owner-rotation.mjs` uses a synthetic owner (not platform staff), intercepts all backend requests, and asserts every PS RPC is scoped to the owned venue. It tests Spanish/mobile and English/desktop: foreign venue denial, revoked management permission, both confirmations, sending/accepted/offline/received/applied, reload, duplicate blocking, updated Wi-Fi QR after applied, the replacement print action (intercepted browser printing), admin failure retaining the existing code/label, and assignment rejection. `owner-fixtures.json` records the result. These are UI contract tests, not a claim of live backend authorization or physical printing.

Validation: 134 unit tests passed; production build passed (existing bundle size warning); the existing `tests/ps-credential-browser.mjs` regression passed with no browser errors. Gaby performed the required independent read-only review in the same session and found no verifiable defects. Live publication is recorded by the COREdevA connector and summarized in the delivery.
