# PE-442.5 — integración lifecycle, pendiente de backend

Rama de implementación frontend: `uma/pe442-lifecycle`. Base `b169fb0a5b819e87b18e028b7f7ca7ff40960541` de `uma/portal-dev-resume`, preserva PE441.5.

NO PUBLICAR hasta que Tom confirme e implemente el contrato aditivo y su transición legacy, versionado en `bmsynergy/saas-playerp-backend`, documento `docs/portal/PE-442-lifecycle-handoff.md` en rama `uma/pe442-lifecycle-contract`. No se modifican las fichas ni otras tareas PE441.

El tipo compartido `src/lib/firmwareLifecycle.ts` proyecta exclusivamente los campos autorizados y falla cerrado si falta metadata. Ambas lecturas (`ps_firmware_list`, `ps_ota_admin_overview`) deben devolver el mismo `lifecycle` generado en servidor. Las páginas no clasifican una edición por versión, lab o canary: usan `rings[ring].enabled/eligible`, retirada y permisos recibidos. Los campos previos de firma de Updates siguen sirviendo como información histórica cuando falte lifecycle; no habilitan selección.

La firma sigue en `ps-ota-admin action=sign`, ahora con confirmación de hash/version/model/arch/revision. Disponibilidad usa la RPC propuesta `ps_ota_edition_availability_set` con token de revisión; no usa el borrado PE416. No hay claves de firma en el portal. Detalle por `?edition=<id>` (prioritario) o `?release=<id>`, independiente de página/filtros; las retiradas deben seguir en el catálogo servidor. La RPC lista añade `complete/total`; sin ellos no se afirma total completo.

Las mutaciones refrescan catálogo y marcan obsoletas las lecturas OTA/fichas. Un fallo de refresco muestra error y oculta las acciones cacheadas. El servidor sigue siendo responsable de revalidar cada operación bajo bloqueo; el control cliente no es autorización.

Pruebas y límites: `docs/evidence/pe442-lifecycle/README.md`. Supabase rechazó la comprobación viva del registro de migraciones en esta sesión por aprobación requerida bajo policy never. No se reintentó `coredeva.dev_target` por otra vía, no se publicaron cambios ni se firmaron/promovieron releases reales.
