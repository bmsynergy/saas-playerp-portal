PE-417 — New Deployment device cards

Based on published DEV portal commit 4c62d0f. Device selection now uses cards with 1 column on tablet/mobile and up to 3 columns based on container space on desktop. Checkboxes have explicit dimensions, names use ellipsis/title, metadata has readable labels and dates wrap naturally. Selected cards have a blue border/background and a translated live count. Existing filters, pagination and group member editing remain supported.

Models come from the existing platform-admin portal_ps_devices read, matched by print_server_id. No backend or production changes.

Validation: npm test (110 passed), npm run build, git diff --check, node tests/pe417-device-cards.mjs (14 EN/ES viewport checks, 320–1920px, pointer/keyboard selection and filtering), node tests/pe416-firmwares.mjs (existing firmware/events regression passed). Browser evidence uses isolated API fixtures, not live devices, and never issues a firmware deployment. local-layout.json records widths and variable content heights; screenshots show selected desktop cards and mobile layout.

Gaby reviewed the diff read-only in the same session against PE-417, found no verifiable defects. Publication and hosted verification are documented in entrega.md for this work.
