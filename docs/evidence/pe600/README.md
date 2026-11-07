# PE-600 — DEV portal clarity

Implementation: `511f676b380660de63f35ac5c5ae3d650d1ce31e`, based on `83b604c`.
DEV: https://playerp.dev.bmore.app/admin/print-servers/devices/59a41440-8536-4045-aed1-3fcc5adaf193

One evidence manifest per acceptance criterion: `criterion-1.json` through `criterion-4.json`.
Before captures are from the original published portal; after captures are from the implementation above, as super_admin on PS-JHG77BM7. No controls that change the device were clicked. Passwords remain masked.

`pe600-ui-regression.mjs` reads the existing PS-MWAG9DH2 and actual catalog, then uses Playwright page routes for synthetic file issuance, assignment and email preview. The image download is a small data URL fixture, not a real image or signed storage download. The guard self-test aborts two prohibited requests before network access; main regression reports zero real mutations and zero unexpected requests. No email is sent. No PE-599 live/permissions script was executed or its evidence changed.

Gaby reviewed the implementation in this session, read-only. Two findings were corrected: unknown technical gate codes now stay unknown and retain their code; owner Firmware navigation now has a destination without admin controls. Gaby rechecked both fixes, visually inspected both after screenshots and read the passing reports. Final verdict: no new findings or blockers.

Physical clean-SD installation remains Beny's separate test. No claim of physical validation, real image download, firmware/image update or production deployment is made.
