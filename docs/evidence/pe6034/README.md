# PE-603.4 — About this Print Server (DEV only)

Work `4535f646-ca74-44f1-a57a-89688801022d`, portal branch `uma/portal-dev-resume`.
Baseline `d1fc1b31cac7fe04a66bb5a67ae07c1c7df4de63`.

## Single acceptance evidence bundle

- `tests.txt`: `npm test`, including URL validation, architecture projection and a full-sheet render per role. Owner lacks administrative controls and ring metadata; admin retains its unlink control.
- `build.txt`: `npm run build` (DEV config).
- `fixtures/report.json` and eight `owner/admin-en/es-390/1440.png`: `node tests/pe6034-browser.mjs`. All Auth/backend responses intercepted, explicit role fixtures; no real changes or physical printer activity. Measures, diagnostics disclosure, navigation to summary, and URL states are recorded. `long-values-390.png` covers long strings. Chromium width emulation, not physical Safari.
- `live-read.json`: read-only DEV RPC results for PS-5EASG93M, showing real model `rpi4-2gb`, architecture `arm64`, firmware `0.3.28`, reported hostname, address and canonical portal URL. Hardware device UUID differs from inventory UUID; the panel association is checked by the runtime resolved for this inventory.

About uses the published `ps_device_resolve` DTO plus the existing device-bound `ps_panel_state` query. No RPCs, roles, credentials, certificates, firmware or printing paths were changed. The link uses only reported `last_status.portal_url`, validated against reported hostname and port. No fallback or typed URL; IP links are rejected.

The previous piece PE-603.3 is accepted. Its backend main commit `ab0fc6dd13276d961643a19e4e9e88d5e99cf512` contains migration `20261108154748_pe6033_ps_device_resolve_arch`, and its accepted delivery records DEV application. We verified that commit on GitHub and read `arch` from DEV before publishing. No backend edits belong to this portal piece; its existing `_deploy/pendiente.json` entry remains with the prior piece.

## Host / Origin / physical limits

Reuse PE-603.3 evidence at backend `_tests/pe6033-ps-portal/fw_check.out`: canonical Host GET 200; IP Host 403; canonical Origin login 200 with simulated Wi-Fi credential service; IP Origin and missing Origin 403; hostname SAN verification succeeds and IP fails. These were tests of actual firmware code, **not physical login in Beny's LAN**. Firmware controls remain unchanged.

Beny must confirm local mDNS, the real certificate and maintenance login on an iPhone or Mac in the venue Wi-Fi. A browser TLS warning about an untrusted local CA is distinct from the intentional Host rejection when entering by IP. Installing that CA is not required for cloud push printing. No PROD or OTA is included.

## Published verification

Final application commit: `3cc8c191ba4b06a7e7da97f932b4ddf59c3da44e` (includes `7a19fefdf5abccadfaa45fc6adaa4b46d0ebe805`). Frontend range for this work: `d1fc1b31cac7fe04a66bb5a67ae07c1c7df4de63..3cc8c191ba4b06a7e7da97f932b4ddf59c3da44e`.

- `published-fixtures/report.json` and screenshots run the role fixtures against the actual published DEV assets, in eight combinations.
- `published-live/report.json` and four About screenshots use the real DEV PS facts with the available QA platform-admin account. That account is not an owner of this venue; real owner authorization on this venue is not claimed. The separate owner fixture exercises owner UI and absent admin controls.
- One unrelated existing stock-credential request is answered locally with `forbidden` because that endpoint writes an audit row. The resolver and panel supplying About are real read-only responses. No reserved credential or recovery code was opened. The guard rejects other non-read requests.
- The initial real EN/390 check found an enrollment badge overflow (398 px); the final application commit wraps that text, and the fixture now reproduces that state. Final reports replace the initial failing runs.

Published owner URL: https://playerp.dev.bmore.app/?venue=a0000000-0000-0000-0000-000000000001&section=print-servers&device=34fd3ff8-f558-4d39-a805-834264d8f6bc

Published admin URL: https://playerp.dev.bmore.app/admin/print-servers/devices/34fd3ff8-f558-4d39-a805-834264d8f6bc
