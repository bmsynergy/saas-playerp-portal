# PE-416 — Firmware distribution, deletion and complete deploy events

The portal uses `portal_ps_inventory` for per-device installed-version distribution and `ps_firmware_list` for uploaded releases. Chart percentages use all returned inventory devices, including unknown versions; the chart and legend filter the corresponding device list. Uploaded releases use cards with full-width notes and header actions.

Deletion invokes Tom's existing authenticated `ps-firmware-admin` action `delete`. The confirmation describes the permanent removal of the release, archive and closed deployment history. The UI reports installed/in-progress/not-found errors, refreshes after success, and distinguishes incomplete archive cleanup or failed refresh from a fully successful operation. Backend source dependency: `bmsynergy/saas-playerp-backend` commit `7b84756750d12992afee95fbd260bb489283f11b` (PE-416.1, already applied in DEV).

Target events now use the existing `ps_ota_target_events` RPC, which returns the complete chronological event list for one target, with no SQL limit. Local filters remain available. Other list pagination remains in place.

Verification:

- `npm test`: 109 tests passed, including delete session/errors/partial cleanup and 137 complete target events.
- `node tests/pe416-firmwares.mjs`: isolated synthetic browser cases at 390/834/1440px; equal 44px controls, pointer/keyboard chart filtering, full-width notes, delete cancel/pending/success/errors and complete event list. See `ui-fixtures.json`.
- `node tests/pe409-lists.mjs`: existing list/filter/loading/error/access and EN/ES regression checks passed. Historical checks were updated for the chart and unpaginated event requirements. See `list-regression.json`.
- `tests/pe416-live.mjs` with authorized DEV fixtures and a disposable ZIP: real DEV inventory (103 devices), UI upload/delete (HTTP 200, archive removed), absence after reload, and all 9 current target events. See `local-live.json`. This test never deploys the disposable firmware and never deletes a pre-existing release. The publication and final hosted verification are recorded in the work delivery.
- Gaby reviewed the implementation read-only in the same session. Her confirmed issue in the delete warning was corrected; final review found no remaining defects. `git diff --check` passed.

Only the DEV portal is in scope. No backend or production modifications in this frontend change.
