# PE-476.3 — Canales/Rings (solo DEV)

Base vigente de PE-475 conciliada por la ruta oficial: entrega de c401be8f-5923-48b6-9ec3-f3c116d731a6 y portal cc27849. Se reutiliza el contrato PE-474 de backend0bf0363. No hay cambios backend, firmware, POS ni PROD.

Una comprobación agrupada por criterio:

1. **Tarjetas, counts y URL** — `browser/report.json` y capturas `choose-*`, `page2-*`. Fixture90 PS; consulta inicial limit1 sin lista; ring seleccionado limit25, offsets0/25, respuestas acotadas con counts y total; búsqueda/estado modifican ambos y conservan ring. Ring/filtros/página en URL, refresco y regreso desde ficha. Es navegador con respuestas interceptadas: pendiente autenticación real de solo lectura en DEV.
2. **Acordeones y cambio explícito** — mismo `browser/report.json`, capturas `accordion-*`, `empty-*`, `error-*`, EN/ES1440/390. Dos PS de una venue con versiones distintas; teclado y aria-expanded, sin clipping horizontal; conflicto de revisión cierra confirmación, refetch y nuevo consentimiento; éxito simulado afecta solo el PS elegido. Ficha también cancela si cambió su revisión. Ocho escrituras simuladas, ninguna OTA real. Pendiente prueba backend de cero nuevos targets/ofertas/despliegues en fixtures reales.
3. **Roles y no regresión** — `tests.txt` (343/343, incluidas las15 pruebas existentes pe441FirmwareRoles de Update General y negativos) y `browser/report.json` (owner/support/operations sin ruta ni consulta administrativa; owner sin controles en ficha). `permissions-pending.md` detalla el traspaso a Tom. Las pruebas frontend no acreditan grants/RLS ni RPC/edge efectivos: ese criterio no está cerrado.
4. **Build, revisión y publicación** — `build.txt` TypeScript/Vite verde, `tests.txt`, `review-gaby.md` sin hallazgos frontend. Publicación y comparación de assets se añadirán tras ejecutar el mecanismo playerp.dev. El trabajo global sigue pendiente de Tom y la validación autenticada.

Lily implementó exclusivamente presentación de Canales, estilos y EN/ES; Uma integró contrato, consultas, URL, autorización y ficha. Gaby revisó en la misma sesión, solo lectura. Los fallos de permisos no se han supuesto ni corregido sin verificación efectiva.

Reproducir fixtures: `npm ci`, `npm run dev -- --port 18799`, `node tests/rings-browser.mjs`; detener el servidor temporal al acabar. Todas las peticiones a Supabase se interceptan; estos tests no envían escrituras a DEV.
