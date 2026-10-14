# Revisión y alcance de la evidencia

Gaby, revisión independiente de solo lectura en esta misma sesión, 14-oct-2026.
Revisó diff, rutas y aislamiento por ID, permisos, contratos assign/move/revoke,
portal/foco, controles terminales y traspaso. Conclusión final: no hallazgo nuevo
en los cambios preparados; mantener el traspaso y no publicar.

Hallazgo abierto MAJOR: `src/App.tsx` ficha stock solo muestra identidad/estado y
`DeviceAdminSummary` firmware. Faltan datos e historial autorizados por device_id,
con razones reales cuando no estén disponibles. El cliente tampoco puede suplir
la ausencia de permiso de retiro y guarda del servidor.

Uma comprobó navegador real Chromium con API totalmente interceptada a 390×844 y
1440×844, admin/owner, fichas de dos PS con URLs distintas, stock solo staff,
asignación aditiva, move fallido/aceptado, desvinculación/retiro simulados,
menú con scroll/teclado/portal/colisiones/foco, terminales y pendientes en ficha y
diálogos de rotación/SSID. `checks.json` registra los resultados y los payloads;
12 PNG muestran los estados relevantes. No se ejecutó impresión física, scan,
rotación, enrollment, asignación, retiro, borrado ni OTA real.

`npm test`: 279/279. `npm run build`: OK, aviso existente sobre tamaño de bundle.
Las pruebas de navegador pasaron con `node tests/inventory-assignment.mjs`.
La última edición de textos de confirmación añade el aviso de cancelación y
conservación; se volvió a compilar. La supresión de Check Status ya estaba en la
proyección aplicada; se añade defensa en el render compartido, comprobando ambas
vistas y roles. No se afirma que SSID/enrollment necesitaran un arreglo distinto.

Límites: estas pruebas verifican el cliente ante respuestas simuladas, no la
autorización real de Supabase ni pérdida de acceso efectiva del antiguo owner.
No hay publicación de este cambio, SHA de backend nuevo ni validación física.
Contrato y pasos de reanudación en `docs/inventory-assignment-handoff.md`.
