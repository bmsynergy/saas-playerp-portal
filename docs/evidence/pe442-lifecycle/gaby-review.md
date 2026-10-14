# Revisión de Gaby — PE-442.5, 14-oct-2026

Revisión independiente de solo lectura en esta misma sesión, contra el diff de portal, el contrato propuesto y las pruebas. No verificó backend vivo ni autorización OTA física.

- Hallazgo: Firmwares seguía montando datos cacheados tras fallar el refresco. Corrección: `PrintFirmwaresData` devuelve error antes de montar acciones con datos antiguos. El recorrido fixture simula 503 y exige ausencia de controles lifecycle.
- Hallazgo: bloqueo de retirada por operación en curso usaba mensaje de Eliminar. Corrección: la mutación de disponibilidad usa el motivo lifecycle; el mapa PE416 se conserva. El recorrido fixture comprueba texto específico EN/ES.
- Nota posterior: un fallo de inventario podía bloquear la pantalla aunque firmware se leyera bien. Corrección: eliminar la dependencia y prop sin uso; el agregado instalado viene de `ps_firmware_list`.

Gaby contrastó las correcciones y confirmó el cierre de ambos hallazgos y de la nota posterior. El principal verificó build y recorrido fixture; la aceptación de gates, permisos, transición, auditoría e historia persistida del servidor queda pendiente de Tom, y la publicación no está autorizada operativamente hasta que se cumpla esa dependencia explícita del encargo.
