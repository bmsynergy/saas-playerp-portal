# PE-571.2 — Support en portal DEV

Owner: `/?venue=<id>&section=support`; agregado multi-venue: `/?section=support`.
SaaS: `/admin/support`, permitido únicamente por `portal_access.support_staff`.
Se reutiliza el backend PE-571.1 (`saas-playerp-backend` main, df4a116 + b25ed06), sin migraciones ni cambios de servidor.

Listados filtrados/paginados en servidor (25 por página), hilo y marcas de lectura por las RPC de Support. Respuestas, estado y asignación pasan por las edges existentes que notifican por correo. Notas internas y prioridad pasan por RPC. El scope y la sesión forman parte de las claves de caché; al seleccionar un venue se fija el filtro de servidor y se valida el venue de la respuesta. Contadores en inicio owner, multi-venue, inicio admin y bandeja.

Sin adjuntos: el modelo existente no los soporta. No se añade otro sistema de tickets. Solo se publica en playerp.dev.bmore.app.

## Verificación

- `npm test`: 42 suites, 400 pruebas.
- `npm run build`: pasa.
- `node tests/support-live.mjs`: sesiones reales DEV de owner y admin; ticket de empleado visible/respondible por owner, agregado de dos tickets, 122 tickets globales en páginas de 25, asignación/prioridad/estado/respuesta/nota interna persistidos, nota invisible al owner, no leído true→false al abrir, ticket ajeno 403 y listado ajeno vacío, móvil 390 sin desbordamiento. No usa respuestas simuladas.
- `node tests/support-states.mjs`: respuestas simuladas exclusivamente para carga/vacío/error/reintento y rol Support sin permiso de administrador antiguo; Operations y owner no montan consultas de soporte global.
- Gaby: revisión independiente solo lectura, misma sesión; sin hallazgos verificables ni bloqueos. No ejecutó tests.

Las conversaciones de prueba se marcan `[PE-571.2 UI DEV]` sobre el ticket fixture de PE-571.1. Al finalizar la prueba completa se restauran asignación, prioridad y estado iniciales. La prueba modifica solo datos de prueba DEV y conserva los mensajes como evidencia.
