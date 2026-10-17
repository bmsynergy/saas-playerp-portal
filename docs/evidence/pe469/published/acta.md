# Acta de publicación DEV — PE-469

URL: https://playerp.dev.bmore.app

Código publicado: `fda0f0ac0929dbc56089e525dc2b02764984b4c2`, rama `uma/portal-dev-resume`.
Backend ya versionado: `d29de236dbd2b42593baba99f998eea923fe5dcf`.

`coredeva-publish playerp.dev fda0f0a` terminó correctamente el 2026-10-17 a las 00:31:21 UTC. Publicación `59c275de-46bf-4a57-a422-1216df666471`; destino exacto validado por el publicador, `/` y `/admin` HTTP 200, sin rollback. El registro oficial queda a cargo del conector.

HTML SHA-256 `b99636de95d1223e98a0c429905a548d5056b16c36cf75567d3a33c609f382d5`; assets `/assets/index-DDcOQMfL.js` y `/assets/index-DXaQn0Ae.css`. Metadatos de release y HTML servidos coinciden.

- `node tests/pe469-published-read.mjs`: cuatro vistas de dos fixtures reales DEV, 390/1440 px, cabecera única/contexto tras refresh correctos, cero errores. Solo lecturas; todas las mutaciones bloqueadas por el arnés.
- `PORTAL_TEST_ORIGIN=https://playerp.dev.bmore.app PS_TEST_EVIDENCE=docs/evidence/pe469/published-simulated node tests/pe469-browser.mjs`: nueve grupos aprobados, con respuestas de backend y autenticación simuladas. Comprueba operaciones/secretos/carreras sin escribir filas reales. Capturas y vídeo en esa carpeta.
- 63 pruebas unitarias focalizadas y build correctos; 28 pruebas del paquete firmado descargado correctas, con red/sistema/cloud simulados.

No se operó hardware ni se instaló firmware. Las pruebas físicas de radio, transición de red, hostname, etiqueta y ACK quedan a Beny. No se habilitaron anillos. Gaby revisó el diff en esta sesión, solo lectura; las correcciones quedaron verificadas sin hallazgos pendientes.

El commit posterior de evidencia solo incorpora esta acta, capturas/resultados y espera de red en el test de lectura; no cambia el código publicado.
