# Inventario PS — dependencia mínima pendiente (solo DEV)

Work `2e7261c4-d567-403f-ad91-e6a4389674fb`, run `62a11f29-0b15-4303-84bb-65155f482f94`.

**No publicar aún.** La consulta de lectura a Supabase DEV fue rechazada con
`MCP tool call requires approval, but approval policy is never`. No se aplicó SQL,
no se hicieron mutaciones reales ni se llamó al publicador. El motor debe tramitar
el ajuste de backend y reanudar la integración del portal.

## Dependencia existente

PE-443.3, work `c032bb44-01e5-40c9-86d7-487f59c97c26`: backend
`6c9eb8428592816b2edd22d09df14ae74b6867f1`, portal base
`59dc7a2e4bf50134843e3ff2dd697a889720a88b`.
Entrega leída con `coredeva-leer PE-443.3`; declara contratos multips aplicados
en DEV. Esto es evidencia previa, no se altera manualmente el estado del trabajo.

## Lo que necesita Tom en backend

Solo `_migrations`, DTO/RPC de detalle/manage por `device_id` y guardas de las
acciones existentes. Versionar en GitHub y aplicar exclusivamente a
`supabase:fzwzmwstxlsxdzdmphyq` antes de publicar el portal.

1. `ps_admin_device_manage`: agregar `actions.retire: {allowed:boolean, reason:string|null}`
   explícito, denegado para legacy/retired y conforme a las guardas reales. El portal
   ya acepta esta forma; si falta, deniega con `contract_unavailable`. No derivar
   permiso de `delete.allowed`, de `unassign.allowed` ni de `status === stock`.
2. `ps_admin_device_revoke`: impedir que un aparato retired vuelva a stock por
   una segunda revocación; mantener `portal_admin` para desvincular y `retired`
   para retiro lógico. Conservar identidad/serial, trabajos, credenciales auditables
   e historial; no cambiar ni borrar `ps_admin_device_delete`. Declarar qué pendientes
   cancela. Respetar autorización en servidor antes de cualquier efecto.
3. Ampliar la lectura staff de stock por `device_id` para los datos e historial
   existentes aunque ya no tenga venue. La respuesta actual de
   `ps_admin_device_detail` aporta identidad/firmware pero no historial ni datos de
   los PS desvinculados. Acordar/proporcionar DTO explícito para credenciales
   confirmadas (nunca valores pendientes), label, impresoras, scans, trabajos,
   certificado e historial de asignaciones/operaciones disponibles. Para cada
   ausencia o imposibilidad, indicar razón real y permisos; no inventar venue,
   estado vacío o pérdida de datos. El portal no ha inventado ese contrato.
4. Verificar lectura autorizada staff y rechazo del antiguo owner tanto por el ID
   de inventario como por el ID del antiguo PS; asignación aditiva, cambio de venue
   y retiro conservan aislamiento por aparato. Solo pruebas focalizadas sin mutar
   dispositivos reales ni crear fixtures persistentes.

## Portal preparado

- Asignación con identidad compacta, buscador en portal, scroll, teclado, retorno
  de foco, confirmaciones de asignación/movimiento/desvinculación/retiro.
- `assign` no envía `p_print_server_id`; `move` es una sola llamada atómica;
  desvincular/retirar usa `revoke` con motivos existentes, sin borrado físico.
- Enlace canónico por PS o inventario; un ID de inventario con PS activo abre su
  ficha completa; stock sin vínculo solo para staff y con identidad visible.
- Aviso verde de etiqueta solo texto; impresión única en Preview/Download/Print.
  Seguimiento terminal protegido en el componente compartido de ficha/diálogo.
- Guardas de respuesta: detalle, manage y resolver rechazan IDs ajenos.

La ficha stock sigue **incompleta**: identidad y firmware disponibles; el resto
espera el DTO anterior. Este es también el hallazgo abierto de Gaby.

## Retomar y comprobar

Integrar DTO autorizado de stock con Lily, comprobar historial disponible y vacíos
reales, revisar Gaby, ejecutar `npm test`, `npm run build` y
`node tests/inventory-assignment.mjs`. El script actual intercepta todos los RPC;
demuestra comportamiento del cliente, no autorización real del backend. Sus
capturas/checks están en `docs/evidence/inventory-assignment/`.

Tras verificar backend versionado y aplicado DEV, subir el portal y ejecutar
`coredeva-publish playerp.dev <SHA>`. Ese mecanismo debe revalidar el registro
del destino exacto `playerp.dev`, URL `https://playerp.dev.bmore.app`.
Repetir los escenarios sobre el build publicado con `PS_TEST_ORIGIN` apuntando
a esa URL; conservar interceptación total y asociar resultado al SHA publicado.
No tocar PROD, POS/Lovable, fábrica, firmware, colas ni permisos generales.
