# PE-437: owner OTA read contract — integrated in DEV

Frontend branch: `uma/portal-dev-resume`. Do not publish this frontend before the backend migration is versioned and applied in DEV.

Backend delivered by Tom in PE-437.4: `a860c49c0847048ceb938ab24871329ac9675988` in `bmsynergy/saas-playerp-backend/main`. Migration `_migrations/20261014000000_pe437_ps_panel_ota_ultima_estable_owner.sql` was versioned in `e5cd34879a8106a257b28238eda5636b2fe5bffa` and applied by Tom only to DEV before frontend publication. Uma checked the remote SHA, SQL and recorded contract results against `getPanelOta`; no contract adaptation is needed. No backend files or database were changed by Uma.

Delivered additive response on each `print_servers[]` entry of `ps_panel_ota(p_venue_id)`:

- Preserve existing signature, `_ps_panel_can_read(p_venue_id)` authorization, active server filter and existing fields.
- `model` and `arch`: linked device metadata, with identity and venue association checked.
- `update`: the result of `_ps_device_update_state(device)`, or null when identity/metadata cannot be established. In particular `current_version`, `latest_stable` (`edition_id`, `version`, `model`, `arch`), `update_available`, `reason`, `active_update`.
- Reuse `_ps_ota_latest_stable` through the state helper. Keep signed edition, non-lab, release ready, confirmed canary, model/arch and revision policy intact. Do not return privileged catalogs or secrets.
- No additional owner mutation permission. Frontend always projects `can_update: false` in this owner read contract, even if a response contains an unexpected true flag.

Uma added backward compatibility: absent projection is displayed as insufficient metadata, never no compatible edition or up to date. Admin retains existing `ps_admin_device_detail` and `ps-ota-admin/update_device`; frontend adds numeric stable semver checks and refreshes server eligibility immediately before the edge request. Unknown version blocks submission. Frontend local eligibility never grants access absent server authorization.

Tom recorded application in DEV (`fzwzmwstxlsxdzdmphyq`), migration MD5 `e0e968470c645855a1ed982f28c905f5`, venue isolation, lab/rejected/unsigned/unready/no-canary/model/arch checks and zero OTA targets created. SQL and results are versioned under `_migrations/_solo_dev/pruebas-dev/pe437_ps_panel_ota_checks.*`. Current DEV has no canary-confirmed editions: `no_stable_release` is expected; a PS without a linked device returns null metadata. Unknown installed versions still block the frontend even if the existing helper reports update_available=true.

Then Uma verifies the actual contract, obtains the exact remote portal SHA, and runs `coredeva-publish playerp.dev <SHA>`. The publisher must validate `coredeva.dev_target` registration. `/` and `/admin` and served release must match the remote SHA before claiming completion.
