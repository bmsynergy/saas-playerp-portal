# PE-570.4 — Solo DEV

Publicado: d5a3581ce7add62670a59660ca4b18ba78019443, rama uma/portal-dev-resume.
URL: https://playerp.dev.bmore.app/admin/maintenance
Pasada: `node tests/maintenance-status-live.mjs`, 2026-11-03 16:48 UTC, sin mocks ni siembras.
Resultado: `acceptance.json` (una pasada para criterios 1–3). Captura: `filtered-reloaded.png`; `mobile.png` muestra el foco de teclado intencionado, no un clic.

Backend previo: 90c31b48e4e023edea7e4a275b500e18c7866cb7 en main de saas-playerp-backend, comprobado en GitHub. Su _deploy/pendiente.json encadena PE-570.3 -> PE-569.3 -> PE-568.3 y exige el mismo deploy firmado con portal. Este trabajo no aplica migraciones ni toca PROD. El único destino de publicación es playerp.dev, validado por el conector; dev-targets.json coincide.

Implementación visual: Lily. Integración y validación: Umataro. Revisión de diff y evidencia: Gaby, misma sesión, solo lectura, sin hallazgos. Build correcto y 395 pruebas verdes.
