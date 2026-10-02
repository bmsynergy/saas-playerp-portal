# PE-334.2 — dashboard global de Print Servers

La página `/admin/print-servers` consulta `portal_ps_inventory()` (contrato v1) con la sesión del usuario. Conserva el candado de administrador de plataforma. `/admin/print-servers/list` mantiene el listado por venue; los detalles y las pestañas por venue siguen usando sus lecturas existentes.

Los indicadores, distribución y listado por dispositivo derivan del mismo `items` filtrado; `generated_at` es la fecha del servidor para esa captura. El resumen global devuelto por el backend no se mezcla con los filtros locales. Un error de actualización conserva la captura y avisa; una denegación oculta el inventario. Se distinguen caído, nunca reportó, sin venue y firmware desconocido. Los equipos sin venue incluyen dispositivos retirados o sustituidos, conforme al contrato. El dashboard solo lee; no añade firmware updates ni edición de notas.

Dependencia ya versionada en backend: `bmsynergy/saas-playerp-backend`, rama `tomjr/pe334-ps-fleet-dashboard-read-dev`, commit `727d0bcc8dcfe4408e2fcc3e3800cde12a1f5108`, contrato §19. Este paso no modifica ni aplica migraciones. La implementación del portal parte del DEV anterior `9a6e3f9` y permanece en rama DEV, no en main.

## Comprobaciones

- `npm run build`: correcto. `npm test`: 62 pruebas correctas.
- `node tests/print-dashboard.mjs`: 13 comprobaciones correctas con API sintética; `local-browser.json` y capturas a 1440 y 390 px. Comprueba filtros combinados, porcentajes/denominador, estados, refrescos y navegación.
- `node tests/print-servers-smoke.mjs`: 14 comprobaciones correctas del listado y detalle anterior con API sintética.
- `node tests/venue-print-servers.mjs`: 13 comprobaciones correctas del alcance por venue con API sintética.
- Gaby revisó en solo lectura en esta misma sesión: sin hallazgos ni bloqueos de implementación.

Las capturas y respuestas de navegador son sintéticas: no prueban permisos reales ni el inventario vivo. La herramienta SQL rechazó la consulta de lectura DEV al exigir aprobación no disponible en esta sesión; no se eludió esa restricción. La evidencia real del backend corresponde al paso PE-334.1, que documenta la aplicación del contrato y las pruebas de permisos. El navegador de Beny usará su sesión real para consultar el inventario publicado.
