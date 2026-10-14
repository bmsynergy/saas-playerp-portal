# Ajustes portal PS — solo DEV, 14 octubre 2026

Implementación de Uma con Lily; revisión independiente de Gaby en la misma sesión.

- Se retiró la etiqueta del alta de venue y del alta heredada de la ficha. El nombre se edita mediante el editor PE-462 de cada dispositivo. Los campos del reemplazo explícito permanecen.
- La cabecera del venue coloca la acción a la derecha. `--portal-action-gap` y `--portal-action-clearance` amplían los grupos existentes y cubren acciones directas, update, modales y estados vacíos/error.
- `invalidatePsViews` actualiza inventario, lista global, lista de venue, resolución/ficha, gestión y estado del PS. Los errores de refresco se muestran sin confundirlos con un fallo de escritura. La ficha conserva el editor en errores transitorios; acceso denegado, sesión vencida y recurso inexistente cierran el snapshot.
- Se reutiliza el contrato PE-462 ya disponible: asignación/movimiento no emiten código, preparación permanece explícita, nombre conserva identidad técnica y el DTO link describe la asignación en todas las vistas.

Validación: `npm test` (307 pruebas) y `npm run build`. La aceptación `tests/ps-adjustments-dev.mjs` usa el backend DEV real y solo modifica nombre/asignación de los fixtures `PS-PE462ASG` y `PS-PE462NVP`. Intercepta únicamente los fallos controlados. No ejecuta preparación, enrollment, OTA ni operaciones de hardware. El nombre original del primer fixture se restaura al terminar; ambos fixtures quedan en el venue aislado PE443. La asignación preparada usa temporalmente el venue aislado PE457 y vuelve a PE443.

Gaby detectó pérdida del editor al fallar la lectura posterior al guardado y retención incorrecta del snapshot ante NotFound. Ambas correcciones verificadas; revisión final sin hallazgos pendientes. Lily revisó las superficies visuales, incluidos update/modales. Uma verificó móvil 390 px y desktop 1440 px.

La evidencia pública final se guarda en `published/report.json` y sus capturas. Un bloque por criterio en el informe recoge el resultado. La entrega oficial es `entrega.md` del run, con los SHA y enlaces definitivos.
