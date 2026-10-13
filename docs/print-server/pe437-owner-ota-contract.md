# PE-437: pending read contract for Tom

Frontend branch: `uma/portal-dev-resume`. Do not publish this frontend before the backend migration is versioned and applied in DEV.

Current backend inspected: `0638509` in `bmsynergy/saas-playerp-backend`. The existing `ps_panel_ota(uuid)` only supplies installed and target status; it does not supply the latest stable compatible edition. No backend files or DEV database were changed by Uma.

Required additive response on each `print_servers[]` entry of `ps_panel_ota(p_venue_id)`:

- Preserve existing signature, `_ps_panel_can_read(p_venue_id)` authorization, active server filter and existing fields.
- `model` and `arch`: linked device metadata, with identity and venue association checked.
- `update`: the result of `_ps_device_update_state(device)`, or null when identity/metadata cannot be established. In particular `current_version`, `latest_stable` (`edition_id`, `version`, `model`, `arch`), `update_available`, `reason`, `active_update`.
- Reuse `_ps_ota_latest_stable` through the state helper. Keep signed edition, non-lab, release ready, confirmed canary, model/arch and revision policy intact. Do not return privileged catalogs or secrets.
- No additional owner mutation permission. Frontend always projects `can_update: false` in this owner read contract, even if a response contains an unexpected true flag.

Uma added backward compatibility: absent projection is displayed as insufficient metadata, never no compatible edition or up to date. Admin retains existing `ps_admin_device_detail` and `ps-ota-admin/update_device`; frontend adds numeric stable semver checks and refreshes server eligibility immediately before the edge request. Unknown version blocks submission. Frontend local eligibility never grants access absent server authorization.

Tom must version the migration in `_migrations`, push it to GitHub, apply only in DEV (`fzwzmwstxlsxdzdmphyq`), and report SHA plus application evidence. Verify venue isolation and lab/bad/unsigned/unready/no-canary/model/arch policy with safe database fixtures or read checks, without device operations. If the final field layout differs, Uma must adapt and rerun the frontend tests before publication.

Then Uma verifies the actual contract, obtains the exact remote portal SHA, and runs `coredeva-publish playerp.dev <SHA>`. The publisher must validate `coredeva.dev_target` registration. `/` and `/admin` and served release must match the remote SHA before claiming completion.
