# Revisión visual de Uma sobre DEV publicado

Revisadas capturas de Firmwares, Canales, Updates, ficha y owner en ES/EN a 1440 y 390 px, obtenidas por `tests/pe474-live.mjs` sin respuestas simuladas ni acciones de negocio.

- Firmwares: Signed/Firmado correcto para 0.3.24, identidad y hash en el detalle de administrador, explicación de edición anterior sin canales, acción Lab visible y ACK explícitamente informativo. Contenido y botones ajustados a móvil.
- Canales: tabla legible en escritorio y presentación responsive; serial, nombre, venue, canal, estado, versión y acceso a ficha cuando existe. Filtros y navegación de páginas visibles.
- Updates: selector de catálogo en filas amplias, radios y paginador compactos, controles separados y sin desbordamiento. Despliegues e historial diferenciados de la administración de firmware.
- Ficha: firmware 0.3.23, motivo concreto de 0.3.24 no habilitada, Update deshabilitado, canal y enlace a administración.
- Owner: solo información de firmware compatible/publicado; sin Canary/Lab/ACK ni hashes largos. El dispositivo de la cuenta de prueba no aporta versión instalada suficiente y muestra el motivo de metadata incompleta con Update deshabilitado; no se fabricó información para habilitarlo.

Se corrigieron en esta misma sesión el texto heredado de Canary del owner, la anchura del selector y el tamaño del paginador. La evidencia de escritura corresponde exclusivamente a fixtures aislados, no a estas capturas.
