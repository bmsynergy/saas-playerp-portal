# PE-335 — contexto de dispositivos por venue

El listado local filtra PS vinculados al venue seleccionado y busca por label, id, device_id y hostname disponibles. Identidad, contador y vacíos hablan de Print Servers. Las filas sin dispositivo y los vínculos pendientes no cuentan como PS. La flota global conserva búsqueda por nombre/slug del venue y sus filtros.

La misma vista acepta venueId y un resolvedor opcional de enlace de detalle. Admin aporta su ruta explícita; el consumidor owner puede reutilizarla con datos autorizados y su propia ruta cuando se integre, tal como indica el plan registrado. No se han añadido APIs ni permisos owner.

Validación el 2 de octubre de 2026:
- Compilación correcta; 66 pruebas unitarias correctas.
- `node tests/venue-print-servers.mjs`: 21 comprobaciones correctas, EN/ES, búsqueda por los cuatro campos, aislamiento, contador 1/1, 0/1 y 0/0, sin vínculo frente a sin coincidencias, pendiente sin PS, escritorio y móvil 390 px sin overflow, global y navegación existentes conservados.
- Inspección visual de devices-390-es.png: buscador, filtros, identidad e ID, contadores y acciones legibles dentro del ancho.
- Gaby: revisión independiente en solo lectura del diff contra uma/pe334-fleet-dashboard; ningún hallazgo verificable. No repitió pruebas ni inspección visual.

Los navegadores usan respuestas API y sesiones sintéticas interceptadas: prueban la interfaz y su consumo de datos, no permisos reales ni una sesión de Beny. No se realizaron operaciones sobre PS ni cambios de backend.
