# Revisión independiente PE-474

Gaby, subagente de revisión, solo lectura, dentro del run `9129e82a-550e-4aae-bf83-4c55e25f6c31`. Revisó el diff sobre `5ca83ed` contra §§1–7 del contrato y los cuatro criterios. No ejecutó acciones reales ni pruebas físicas.

Encontró dos notas menores:

1. El parser admitía una configuración imposible de `auto_lab`. Uma añadió validación de firmado / únicamente Lab / revisión 0 y rechazo de `can_enable` que salta un canal previo. Conserva la lectura de filas heredadas no acumulativas conforme a §7; su reparación requiere autorización explícita del servidor. Fixture negativo en `firmwareLifecycle.test.ts`.
2. El detalle de rechazo de despliegue mostraba códigos crudos y UUID sin navegación. Lily tradujo el motivo y añadió enlace a Canales con búsqueda por la identidad del PS, sin inventar un serial que el servidor no devuelve.

Gaby volvió a leer ambas correcciones y confirmó: «Ambas correcciones están resueltas en el código inspeccionado». No encontró `group_id` en los cambios de canal; comprobó los parámetros de concurrencia, las lecturas paginadas, límite de 20 del selector y ausencia de hashes/canales internos en owner. La validación de tests, build y navegador corresponde a Uma y se registra por separado.

Comprobación visual final: Uma detectó texto heredado de confirmación Canary en owner y el catálogo de despliegue estrecho. Lily corrigió EN/ES y el diseño; Uma fijó `type="button"` en el reintento de catálogo para que no envíe el formulario. Gaby verificó los tres ajustes: owner no renderiza anillos internos ni ACK, la acción depende de la respuesta General del servidor, el catálogo ocupa el ancho disponible y el reintento no envía despliegues. Sin regresiones observadas en lectura.
