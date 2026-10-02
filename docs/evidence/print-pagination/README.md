# PE-334.2 — ajuste solicitado: paginación

Paginación local del inventario del dashboard y listado global existente: 25 filas iniciales, selección 10/25/50, rango de resultados, página y anterior/siguiente. Cambiar filtros o tamaño reinicia la página; una captura reducida ajusta la página al último bloque válido. Los indicadores y firmware siguen usando todos los resultados filtrados y la misma fecha de captura. Sin cambios de backend, permisos, firmware updates ni notas.

Verificación de esta sesión (2 octubre 2026):
- `npm run build`: correcto. `npm test`: 62 pruebas correctas.
- `node tests/print-dashboard.mjs`: 15 comprobaciones de navegador, API sintética; 63 equipos y 63 locales a 1440/390 px, sin duplicados/omisiones, totales completos, filtros/tamaño y reducción de captura. También carga, vacío, error, avisos, navegación y firmware desconocido con denominador.
- `node tests/print-servers-smoke.mjs`: 14 comprobaciones correctas con API sintética.
- `node tests/venue-print-servers.mjs`: 13 comprobaciones correctas con API sintética.
- Captura móvil de controles revisada visualmente: legible, botones y selector dentro del ancho.
- Gaby revisó diff, componente compartido y estilos en solo lectura: sin hallazgos verificables.

Las sesiones y respuestas son sintéticas. Estas pruebas no acreditan autenticación ni permisos reales en la base, ni una sesión de Beny. Se conserva la conexión segura del primer paso. El informe publicado se añadirá tras publicar el commit.

## Portal publicado

Publicado `d31b59b7fdce6760f4a20097116a97dcc76f526b` en https://playerp.dev.bmore.app/admin/print-servers. HTML público sirve `index-CCwOVXUV.js` / `index-CDd2WihP.css`, coincidentes con la compilación local.

`PORTAL_TEST_ORIGIN=https://playerp.dev.bmore.app node tests/print-dashboard.mjs`: 15 comprobaciones correctas, sin errores de página, incluido anterior/siguiente y rangos exactos. Informe `hosted-browser.json`. HTML/JS/CSS reales del portal DEV con respuestas API y sesión sintéticas. Gaby completó además la revisión de los tres criterios, proyección/filtros y rutas: sin incumplimientos verificables, sin comprobar permisos reales.
