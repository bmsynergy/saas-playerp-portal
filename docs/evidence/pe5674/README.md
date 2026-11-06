# PE-567.4 — Portal maintenance, DEV

Implementation: `9023dbeb2133feaaafa60af657ce2655e6b27683`, branch `uma/portal-dev-resume`.
Backend dependency already delivered: `669618895ed58facfe26e6041c2b9da783cc1900` (backend main, PE-567.3).
Only DEV was used. No production configuration, schema or deployment changed.

Lily implemented the interface; umataro integrated server queries and tests. Gaby independently reviewed the diff read-only and reported no verifiable defects. Build passed; 41 test files / 382 tests passed.

Real browser check: `node tests/maintenance-live.mjs`, official https://playerp.dev.bmore.app/admin/maintenance, without mocked responses. `acceptance.json` records the returned pages and assertions:

1. Search `Sede 117` returns QA-120 Sede 117; selecting requests its venue ID, and history returns exactly one venue. `criterion-1.png`.
2. Server returns total 133 and 25 venues per page; problem venues precede healthy ones. Page 2 contains 25 distinct venues. Summary: 133 venues, 8 with problems, 9 problem nights. `criterion-2.png` and `criterion-2-summary.png`.
3. Header opens recipient modal; server-searched person added and removed, header count 1 → 2 → 1; recipient IDs restored to initial list. `criterion-3.png`.

Additional checks in that same browser pass: View night filters its venue and expands the night; mobile width 390 has no horizontal overflow, including the dialog (`mobile.png`). Browser errors: none.

The acceptance script initially expected the label “Agregar”; the existing Spanish label is “Añadir”. The selector was corrected before the successful run. Initial attempts performed no recipient mutation. No application code changed after the validated implementation.

The DEV QA-120 data belongs to backend PE-567.3 and remains available for Beny's checks; this frontend work does not remove it.
