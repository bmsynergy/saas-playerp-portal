# PE-474 — continuación frontend publicada

Base `5ca83ed` de `uma/portal-dev-resume`. Código publicado: `4c5502a556abcc3a99483474f7bb86bb4378e979`. Dependencia backend aceptada: `06e6a7f` + `0bf0363`, contrato `_docs/pe474-contrato-ota-canales.md` §§1–7. No se cambió backend, POS ni PROD.

- `tests.txt`: `npm test`, 339 pruebas en 35 suites. Incluye lifecycle v2, promociones con identidad/revisión, General sin ACK, metadata inválida, canales/selector/permisos/concurrencia y páginas de una población sintética de 2000.
- `build.txt`: `npm run build`, TypeScript y Vite correctos. Permanece el aviso de tamaño del bundle.
- `browser-fixtures.json`: `node tests/pe474-browser.mjs`, todas las llamadas Supabase interceptadas, listas grandes, promociones y conflictos simulados. 66 peticiones y ocho escrituras exclusivamente simuladas, sin peticiones inesperadas. No prueba criptografía del backend ni ejecución OTA física. Capturas `fixture-*`.
- `review-gaby.md`: revisión independiente, correcciones verificadas y revisión de los ajustes visuales finales.
- `assets.json`: index, JS y CSS servidos por DEV tienen los mismos SHA-256 que el build local del commit publicado; HTTP 200.
- `live/report.json`: `node tests/pe474-live.mjs` sobre https://playerp.dev.bmore.app, con datos reales y sin mock. Incluye vistas ES/EN, 1440/390 px, lista de red con parámetros, límites, offsets, filas y estados HTTP. Solo lecturas; acciones de negocio bloqueadas preventivamente. No se guardan credenciales ni cabeceras. Las capturas `live/*` muestran catálogo, canales, Updates, ficha y owner; `*-detail-*` amplían el detalle de edición y el selector de despliegue.

Publicación exclusiva mediante `coredeva-publish playerp.dev 4c5502a556abcc3a99483474f7bb86bb4378e979`: publish `e90784c1-d06e-4d4b-8a98-a95ed5dd8ba4`, release `20261017T234644-4c5502a556ab`, health 200, sin rollback. El conector registra la publicación en la entrega. El commit posterior de esta carpeta añade únicamente evidencia de la comprobación publicada; no modifica código servido.

Los grupos del resumen están acotados a 100 y sus miembros se consultan por páginas en Canales. No se reemplaza una membresía completa con una página parcial. El selector individual respeta el máximo contractual de 20 y muestra `editions_total`; no se inventó paginación adicional ni se descarga el catálogo para decidir elegibilidad.
