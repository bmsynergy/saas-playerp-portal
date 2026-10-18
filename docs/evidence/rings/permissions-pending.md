# Traspaso a revisión backend de Tom — no es evidencia de aprobación

Base conciliada: PE-475.5 c401be8f-5923-48b6-9ec3-f3c116d731a6, portal cc27849 (código anterior publicado4c5502a). Backend PE-474.5 dfb51668-272b-4be9-a95d-5ad92dbb954b, main0bf0363104d088cfe579222b213288ba9d9bba8d y06e6a7f, contrato _docs/pe474-contrato-ota-canales.md.

La lectura SQL de DEV fzwzmwstxlsxdzdmphyq fue rechazada por la herramienta: `MCP tool call requires approval, but approval policy is never`. No se probó una vía alternativa. No se suministró PORTAL_DEV_FIXTURES ni una interfaz para contactar a Tom durante este run. El protocolo handoff del entregable solicita la intervención por el motor.

La lectura estática muestra que portal_access devuelve is_platform_staff restringido a super_admin y platform_role. getAccess lo combina con la consulta amplia is_platform_staff en can_manage_staff; PrintServersRoute ya exigía can_manage_staff antes de este trabajo. Se añadió comprobación explícita de super_admin para tarjetas/ruta/tab/controles de ring. Esta lectura no acredita el estado efectivo desplegado.

Pendiente exclusivamente en DEV:
- Tom concluye permisos efectivos de ps_ota_channels_page, ps_admin_device_detail/sheet, RPC set_channel/promoción, tablas de canales/disponibilidad y edge ps-ota-admin. Comprobar grants/RLS y que p_actor/actor manipulado no sustituye identidad JWT.
- Identidades owner/admin: denegaciones reales RPC/PostgREST y edge al owner (incluyendo cliente/actor manipulado), éxito admin en fixtures. Incluir lectura administrativa y promoción. No tocar PS/ediciones reales.
- Fixture set_channel: revision/concurrencia, aislamiento de dos PS de una venue, cero nuevas ofertas/targets/despliegues. Revertir/eliminar fixtures. Reutilizar _migrations/_solo_dev/pruebas-dev/pe474_contrato_ota_mismo_artefacto_canales.sql y no rehacer lifecycle.
- Ejecutar regresión backend existente de Update General firmado compatible; Lab/Canary no accesibles al owner. El frontend existente sigue verde.
- Corregir solo fallos relacionados si aparecen; versionar migración/edge y prueba _solo_dev en bmsynergy/saas-playerp-backend antes de aplicarlos solo DEV.
- Facilitar validación autenticada de solo lectura de la ficha real59a41440-8536-4045-aed1-3fcc5adaf193 y Canales publicado, o evidencia agrupada equivalente sin secretos. Ninguna escritura sobre esa ficha.

No se declara revisión nueva de Tom ni verificación efectiva por reutilizar su entrega histórica.
