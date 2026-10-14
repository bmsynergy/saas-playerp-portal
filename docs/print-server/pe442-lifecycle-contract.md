# PE-442.7 — integración del contrato lifecycle final

Contrato de Tom: backend `cb94ecd215ae2d7ee7926efce9ed47171cba8d67`, `docs/portal/PE-442-lifecycle-contrato-final.md`; aplicado DEV según traspaso PE-442.6. Se integra la dependencia existente PE441 `7f26647` sin reimplementar sus fichas ni credenciales.

`ps_firmware_list` y `ps_ota_admin_overview` devuelven la misma proyección lifecycle. El portal consume `rings.*.available` del servidor; `eligible/reason` explican exclusivamente el gate, `enabled` la configuración, `retired_at` la retirada. Datos ausentes o inválidos fallan cerrados. Totales solo completos con `complete:true` y `total` concordante. Instalaciones se cuentan por versión, nunca se adjudican a revisiones.

Firma: `ps-ota-admin action=sign` con confirmación sha256/version/model/arch/revision. Usa el firmador PE385, no habilita anillos. Disponibilidad: `ps_ota_edition_availability_set` con revisión optimista; explica concurrencia, gates y operaciones en curso. Retirar no usa Eliminar PE416. No se envía actor, material de firma ni confirmación canary. Las ediciones legacy conservan el snapshot de sus anillos; una nueva firma tiene todos deshabilitados.

Deep links: `?edition=<id>` prioritario, o `?release=<id>` antes de firma, también fuera de la página/filtro y estando retirada. Mutaciones invalidan catálogo, Updates y lecturas por rol. Fallo de lectura oculta acciones cacheadas. OWNER/ADMIN mantienen el contrato PE441 final y su revalidación servidor.

Pruebas: `docs/evidence/pe442-lifecycle/README.md`. Recorrido de navegador con fixtures inequívocos y toda red Supabase interceptada; no demuestra instalación física. Contratos servidor: salidas SQL/API de Tom en backend `_tests/pe442-lifecycle/`, revisadas en esta reanudación sin repetir escrituras sobre releases reales.

Destino: `playerp.dev`, https://playerp.dev.bmore.app. Tom no pudo leer directamente coredeva.dev_target por rechazo del guardián; no se reintentó. Su traspaso remite la comprobación de registro al publicador autorizado, que valida destino y alcance antes de publicar. El resultado de publicación se documenta separadamente; este documento no afirma una lectura SQL viva.
