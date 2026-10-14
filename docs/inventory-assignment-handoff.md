# Inventario PS — integración DEV completada

El traspaso pendiente del work `2e7261c4-d567-403f-ad91-e6a4389674fb` quedó resuelto
por Tom en PE-444.4. Este portal integra su contrato de ficha stock y retiro.

## Dependencia funcional (sin modificar estados del motor)

- PE-443.3, work `c032bb44-01e5-40c9-86d7-487f59c97c26`: asignación aditiva,
  movimiento por aparato y resolver autorizado; backend `6c9eb8428592816b2edd22d09df14ae74b6867f1`.
- PE-444.4: backend `3ec814acf400f1db7077984fa6ad9c583e5b23ae`, DTO revisado
  `cb0dbe09c7eeb12dd587164b9ebf2d5cf75d19ce`. Migración
  `_migrations/20261014080000_pe444_ps_retiro_y_ficha_stock.sql` aplicada en DEV
  por Tom según su entrega; prueba registrada 15/15, incluida denegación al antiguo owner.
  En esta reanudación se verificaron esos commits en el remoto y se leyó el DTO;
  no se ejecutaron migraciones ni mutaciones sobre la base o dispositivos.

## Portal

- Asignación: identidad inmutable, buscador en portal, scroll, teclado y retorno
  de foco. Confirmaciones identifican aparato/local y consecuencias.
- Assign omite `p_print_server_id`; move usa la RPC atómica. Desvincular llama
  revoke con `portal_admin`; retirar llama revoke con `retired`, únicamente con
  `actions.retire.allowed` del servidor. Retiro lógico en lugar de borrado físico;
  la RPC de borrado del backend se conserva, pero el modal no la llama.
- Stock: `ps_device_sheet_resolve` autoriza la ruta canónica; solo staff admin
  solicita `ps_admin_device_sheet(p_device_id)`. Proyección cerrada valida IDs y
  credenciales confirmadas; query por usuario/aparato, sin persistencia, oculta
  el contenido mientras revalida o ante denegación. Historial disponible y
  razones reales de ausencia, sin inventar venue ni operaciones posibles.
- Credenciales ocultas inicialmente, etiqueta confirmada y validada, QR solo en
  etiqueta. Vista previa/descarga/impresión reutilizan el generador existente.
- Rotaciones/SSID/enrollment terminales sin Check Status; pendientes conservan
  seguimiento, fechas e historial. Aviso verde de etiqueta solo texto.

## Verificación focalizada

`npm test`, `npm run build`, `node tests/inventory-assignment.mjs`.
El navegador intercepta TODAS las APIs externas: admin/owner a 390/1440,
stock con historial/vacíos/denegación, dos aparatos por venue con URLs distintas,
selector/confirmaciones/payloads, terminales/pendientes y diálogos.
No demuestra operación física ni reproduce autorización real de la base:
esta última corresponde a la evidencia de backend de Tom.

Gaby revisó diff completo y la integración de stock en la sesión de reanudación.
Su hallazgo sobre datos visibles durante revalidación se corrigió y confirmó;
no quedaron hallazgos verificables abiertos.

Publicación solo mediante `coredeva-publish playerp.dev <SHA>` y verificación
posterior con `PS_TEST_ORIGIN=https://playerp.dev.bmore.app`; el SHA y resultado
publicados quedan en la entrega del work de reanudación. Ningún cambio PROD,
POS/Lovable, fábrica, firmware, colas ni permisos generales.
