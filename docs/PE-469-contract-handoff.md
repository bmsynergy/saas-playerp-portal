# PE-469.3 — dependencia backend/firmware antes de integrar la ficha PS

Work `5c84790e-42b2-47a0-a31f-203bf08ec1db`. Solo DEV. Fecha: 2026-10-16 UTC.
Este documento propone el contrato mínimo; **no declara endpoints nuevos desplegados ni firmware disponible**.
El efecto `call` del plan ya encarga backend/firmware a Tom Jr mediante motor. Reutilizar ese encargo,
sin abrir otro equivalente. La interfaz se delegará a Lily cuando el contrato esté cerrado.

## Base comprobada

- Portal `uma/portal-dev-resume`: `4e333e95d1b011d2543a198d974788ab11a28876`, incluye `55a113d`.
- DEV sirve la release `20261016T214729-a8739746b0ea`; la rama remota
  `uma/ffcd2c7b-ai-copy` contiene `a8739746b0eaf3359cd6e06cc14837b79d4a2c0d`.
  Es descendiente de `4e333e9` por ocho commits. Se incorporó por fast-forward a la rama de trabajo
  para conservar lo ya publicado, sin rehacer ni publicar cambios de IA.
- SHA-256 del HTML de `https://playerp.dev.bmore.app/`, igual al HTML de esa release:
  `5d5464c508f4d1da7323cb5e43d15178419fa0ca64a625a91050cf9aca20ec81`.
  `/version.json` devuelve el fallback SPA: **no es evidencia de versión**.
- `dev-targets.json` registra `playerp.dev` con esa URL y el repo del portal.
  Falta la revalidación del publicador autorizado al publicar; no se solicitó publicación.
- Backend remoto `main`: `6aa8cba914df668bbd805872d9e872fcbf0f18d3`.
- Las lecturas oficiales `coredeva-leer PE-443/444/462/463` devolvieron planes pero
  `work_without_delivery`. No se presentan documentos del repo como entregas aceptadas del motor.
  Los tres UUID de aparatos citados devuelven `work_ref_unknown`: son contexto, no trabajos.

## Dependencias verificadas en el código

1. `src/App.tsx`, `DeviceSheetData`: antepone `PsDeviceLinkPanel` a la ficha runtime o stock;
   ambos renderizan identidad/cabecera. El defecto sigue en la base publicada.
2. Backend `_migrations/20261014233000_pe462_ps_preparacion_y_vinculo.sql`,
   `ps_admin_device_revoke`: llama `ps_panel_revoke` y revoca altas pendientes. El contrato PE-462
   documenta expresamente que desvincular revoca credencial. **No sirve para la nueva semántica**.
3. `ps_device_sheet_resolve` de PE-462 ya resuelve ID de inventario y runtime, incluyendo
   `ps_devices.print_server_id` cuando falta `inventory_device_id`. Se debe extender, no duplicar.
4. `ps-device/app/wifi/wifi_setup.py`, `Handler.do_POST`: tiene login, Wi-Fi y recuperación;
   no tiene endpoint público de preparación. `cloud_admin.py:main` pide el código con `getpass`
   y llama `enroll`; esta es la vía técnica presente en fuente.
5. `_docs/print-server/pe462-firmware-0.3.22-pasos-beny.md` documenta 0.3.22 firmada para ACK.
   En este trabajo no se ha descargado/verificado el paquete ni consultado catálogo DEV;
   no se afirma que 0.3.22 incluya un formulario ni se reserva 0.3.23 por inferencia.

## Contrato mínimo solicitado a Tom (nombres nuevos propuestos, por confirmar)

### Identidad y capacidades

Extender `ps_device_sheet_resolve(p_id)` autorizado: conservar campos existentes y devolver
`device_id` canónico, runtime explícito o null, venue autorizado o null, `link.rev`, permisos
y capacidades por aparato. Rechazar ambigüedad; nunca elegir el primer PS del venue.
Los enlaces históricos de runtime se redirigen a ID canónico solo después de resolver permisos.
Conservar ruta legacy explícita si no existe inventario: no fabricar identidad ni reparar filas reales.

Compatibilidad debe distinguir `link_ack` (antecedente 0.3.22), desvinculación segura y activación web
(versión nueva por reservar). Para cada capacidad: instalada reportada, mínima requerida, motivo,
y disponibilidad real por anillo. Desconocido es desconocido, no disponible. Ningún anillo se habilita.

### Desvinculación preservando preparación

Propuesta `ps_admin_device_unlink(p_device_id uuid, p_expected_rev integer)`:

- Autorización en servidor, inicialmente staff super_admin conforme al contrato de asignación;
  cualquier ampliación de roles debe ser explícita. No basta ocultar un botón.
- Transacción, bloqueo por dispositivo y control de revisión: `revision_conflict` requiere recargar.
  Repetición de la misma operación ya aplicada devuelve éxito idempotente sin nueva auditoría de cambio;
  una reasignación posterior no puede ser anulada por un reintento viejo.
- Preservar credencial, identidad, certificados, preparación e historial; retirar vínculo y acceso
  del venue anterior inmediatamente. El PS vuelve a stock preparado, no a pendiente de preparación.
- Cerrar trabajos pendientes exclusivamente del PS seleccionado con motivo específico y auditable;
  definir expresamente trabajos en vuelo y su eventual finalización. No migrar cola/impresoras al hermano.
  Revisar acceso a lecturas, credenciales, nuevos jobs y canales realtime del venue anterior.
- Definir persistencia de `venue_id:null` y revisión en firmware y ACK posterior a persistencia.
  Bloquear la operación en 0.3.21 si no puede aplicar el desvínculo completo seguro. No confundir
  este bloqueo de capacidad con conectividad ni reutilizar revoke/replace como alternativa.
  Evaluar la sugerencia del revisor de separar el corte de acceso del servidor de la adopción local;
  no devolver éxito completo mientras quede un efecto obligatorio inseguro.
- Respuesta sin secretos: `{ok, device_id, print_server_id, already_unlinked, link, capabilities}`;
  errores `{ok:false,error,message,next_step,required_version?}` incluyendo forbidden, incompatibilidad,
  revisión obsoleta y aparato ajeno/inexistente sin filtración. Auditar actor/aparato/venue/revisión/efecto.

### Preparación local real, reutilizando enroll y portal cautivo PE-413

Propuesta: asistente `http://10.77.0.1`, sección «Preparar este Print Server», campo «Código inicial»
y `POST /api/prepare` (nombres finales deben constar en el contrato y paquete).
Primero acceso local autorizado existente y Wi-Fi con salida a Internet; después código explícito.
Mantener CSRF/origen, sesión local, límites de intentos y rechazo de aparato ya preparado antes del canje.
El flujo no admite `replace`, no muestra `pst_` y preserva recuperación, identidad y certificados.

El código solo viaja en cuerpo de petición local autorizada y memoria temporal con caducidad;
nunca URL, logs, errores, disco, localStorage ni sessionStorage. Transición de red/hostname con resultado
recuperable no secreto y sin reenroll automático. Refresh completo pierde el código: explicar reemisión.
Documentar autenticación del primer acceso: estar en el hotspot por sí solo no autoriza preparar.
Cubrir éxito, expirado, inválido, sin Internet, ya vinculado, no autorizado y recuperación con sistema/red simulados.

Verificar rama, catálogo DEV, paquete/manifiesto y contenido de la siguiente versión libre antes de firmar.
Entregar SHA fuente, versión, paquete, SHA-256, firma/clave pública, pruebas reproducibles y pasos de
instalación manual para Beny. No crear despliegues, habilitar anillos ni instalar/operar aparatos.
Verificar desde el artefacto la alternativa técnica en versiones sin web:
`cd /opt/playerp-ps/current && sudo /opt/playerp-ps/current/venv/bin/python cloud_admin.py`.
Requiere acceso SSH autorizado, sudo, instalación/ruta válidas e Internet; solo aparato nuevo sin preparar.
No publicarla como instrucción comprobada por versión hasta verificar el artefacto correspondiente.

## Secuencia de integración de Uma y encargo previsto a Lily

1. Recibir contratos/SHA de Tom, backend en repo y aplicado solo en DEV, simulación y paquete firmado.
2. Uma implementa/proyecta DTOs y API (`psVenueDevices`, `psLink`, `psAdminDevice`), permisos y
   aislamiento por usuario/device/runtime, cancelación/descarte de respuestas tardías e invalidación compartida.
3. Lily implementa `App.tsx`, páginas PS, `PsDeviceLinkPanel`, `PsDevicePreparation`, gestión/alta,
   componentes de identidad y estilos/locales afectados; no toca backend ni decide permisos:
   una cabecera nombre/serial/venue y bloques resumen, preparación si falta, Wi-Fi/código/etiqueta,
   firmware, certificados, impresoras/escaneo, cola/actividad. Sin lista de hermanos en el detalle.
   Crear cierra modal y navega al ID devuelto sin emitir código. Guardar nombre explícito.
   Código de preparación solo en memoria con caducidad/copiar/reemitir y estado real.
   Volver/breadcrumb conserva contexto y selección en URL validada y retorno login, incluidos refresh/stock.
   Desvincular confirma aparato y efectos y usa exclusivamente el nuevo contrato autorizado.
   Online/Offline independiente de vínculo; 0.3.21 online explica ACK pendiente y versión requerida.
4. Uma integra y valida una evidencia agrupada por cada criterio: (1) dos PS del mismo venue y uno ajeno,
   credenciales, firmware, impresoras, cola, errores y certificados distintos en cada PS;
   operaciones aisladas, permisos y respuestas tardías, cabecera única, errores con siguiente paso,
   lista/ficha/confirmación 390/1440; (2) alta stock, login/refresh, código explícito/reemisión/nombre y
   ausencia de secreto persistente; (3) simulación del paquete exacto y pasos físicos; (4) estados stock,
   asignado offline, online incompatible y sincronizado, ACK viejo/ajeno, y publicación DEV URL/SHA.
   Reutilizar fixtures PE-443/462; ninguna escritura sobre los dos aparatos reales citados.
5. Gaby revisa diff final en lectura, Uma corrige, y publicación exclusiva por
   `coredeva-publish playerp.dev <commit>` tras push y revalidación de target. No promover main.

La dependencia solicitada no amplía los cuatro criterios ni duplica el encargo de Tom del plan.
