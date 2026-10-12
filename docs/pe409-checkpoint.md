# PE-409.5 — checkpoint pendiente de backend

Base publicada conservada: a40a74c33cccf18d9a2f380f36ce62d31e8757a9.
No publicar este checkpoint como entrega de las listas: todavía no están integradas.

Lily dejó AdminListFilters y traducciones EN/ES sin importarlos desde páginas.
Faltan integración de listas, CSS, aislamiento de venue, estados, contratos OTA/cola,
formato humano de eventos, pruebas por lista y publicación. El componente es un
borrador reutilizable, no evidencia de los criterios. Al integrarlo, mover helpers
de filtrado a src/lib bajo responsabilidad de Uma y no consultar con fechas inválidas.
La revisión de Gaby detectó un marcador de interpolación sin consumidor; se retiró.
Al integrar list.unknownPhase, añadir la fase original como texto separado del rótulo.

La lectura de Supabase DEV fue rechazada porque requiere aprobación y la política
de esta sesión es never. El traspaso pide a Tom contratos de lectura y aplicación
DEV, documentados en el backend en `_docs/pe409-read-contract-handoff.md`.
No hay dependencia de RPC nueva en este checkpoint. No se ha operado dispositivo.

Al retomar, revalidar current antes de integrar: no sustituir la base publicada por
main del portal. Corregir useFleet en ámbito venue usando ps_panel_state y venue
seleccionado, retirar other_venue_count de proyección/vista, incluir usuario y ámbito
en cachés. Mantener diagnósticos bajo autorización admin actual y conservar originales.
