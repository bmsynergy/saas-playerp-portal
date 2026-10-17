# PE-469 — ficha individual PS, solo DEV

Base: rama `uma/portal-dev-resume`, cf83f5c, descendiente del publicado a873974. DEV antes: HTML SHA-256 `5d5464c508f4d1da7323cb5e43d15178419fa0ca64a625a91050cf9aca20ec81`, release metadata a873974. Incluye PE-463 55a113d/4e333e9 y conserva invalidación compartida. No se tocó POS, PROD, hardware ni asignaciones/credenciales reales.

Backend remoto comprobado: `d29de236dbd2b42593baba99f998eea923fe5dcf` en main y tomjr/pe469-4-desvincular-activacion-web. Contrato: [resolver/desvincular/compatibilidad](https://github.com/bmsynergy/saas-playerp-backend/blob/d29de236dbd2b42593baba99f998eea923fe5dcf/_docs/pe469_ps_desvincular_compat_activacion_contrato.md). La entrega oficial PE-469.4 fue leída con coredeva-leer (artefacto ac5a0d54-006b-4c0f-b224-331506aa7a38, SHA c028e63281aa31fc0c3989ebed583c71818923c72d61edfd88c091e71d1b2016).

## Evidencia 1 — identidad, navegación y aislamiento

[Registro browser](browser/checks.json), capturas `browser/c1-*` de lista, ficha única, confirmación, rechazo y error de operación, 390/1440. `node tests/pe469-browser.mjs`: dos PS del mismo venue con distintas credenciales, firmware, certificado, impresora, cola/errores; tercero ajeno; pendiente sin runtime. Comprueba enlace legacy con inventory_device_id NULL, ruta canónica, selección al volver y refresh, permisos, revisión vieja y unlink conservando preparación y hermanos. Respuestas tardías de credenciales y de unlink se resuelven tras cambiar de ficha mediante navegación SPA. El error operativo nombra el aparato e indica siguiente paso.

Todas las escrituras están interceptadas en memoria; no son evidencia nueva de RLS real. Backend de Tom: 23/23 SQL en rollback, incluye auditoría y md5 de hermanos/ajeno; resultado versionado en `_migrations/_solo_dev/pruebas-dev/pe469_ps_desvincular_compat_pruebas.result.json`. [Tests focalizados del cliente](unit-tests.txt): 63 aprobados. [Revisión Gaby y correcciones](review.md).

## Evidencia 2 — crear, preparar y guardar

Mismo [registro](browser/checks.json), `browser/c2-stock-390.png`, `browser/c2-stock-1440.png` y grabación `browser/c2-create-prepare.webm`: Crear → ID devuelto en stock, cero emisión implícita; Preparar, copiar, reemitir, caducidad y Guardar explícitos. Código solo en memoria; comprobada ausencia en URL, localStorage, sessionStorage y registro de peticiones. Refresh pierde secreto y permite reemitir; login real de interfaz (autenticación simulada) conserva ID y venue. Los códigos del vídeo son sintéticos sin valor.

## Evidencia 3 — entrada real por versión

[Paquete leído del catálogo DEV](firmware.json): 0.3.23, 262018 bytes, SHA e0784589dd6c01bb089f91a4d8f220fb97c7aa6cd003069ad631551e6248b95c, edición firmada a0dd09df-7b40-4a08-8a26-6407ff3a3190, clave f93c273f49f8631c, ningún anillo habilitado. `ota-package.json` del ZIP confirma fuente aa732f2a0fbed2fc754bc7bdc945663dedbc6da6 y version.py=0.3.23; no se infiere de version.py fuente 0.3.5. La verificación Ed25519 y aceptación por updater constan en evidencia versionada de Tom; Uma descarga de nuevo y compara hash/metadata.

[28 pruebas sobre el ZIP extraído](firmware-tests.txt), [demostración UI](activation/checks.json) y capturas `activation/c3-*` 390/1440. Campo real «Código de preparación (pse_…)» en http://10.77.0.1 → sesión con código de configuración → «Activar este Print Server (equipo nuevo)» → `POST /api/activation`. Se conserva solo en RAM 15 min; después guardar/confirmar red con Internet; al cambiar red se canjea por enroll y aparece resultado. Inválido/caducado/sin Internet/ya preparado/sin sesión/CSRF/origen/límite/reinicio comprobados por los tests del paquete. Red, sistema, radio y cloud simulados. No se contactó ningún hotspot físico.

Reproducir: descargar con `node tests/pe469-read-contract.mjs`, extraer ZIP, disponer de websockets 16.0 y qrcode 8.2 en PYTHONPATH; `python3 tests/pe469-firmware-fixture.py <extraído>` ejecuta los 28 casos en puerto 18798. Con argumento `serve` sirve la página del paquete sobre el mismo fixture; ejecutar `node tests/pe469-local-activation.mjs`, y apagar el servidor al acabar. La prueba HTTP traduce únicamente host/origen de loopback al origen local simulado; las pruebas unitarias negativas comprueban rechazo de origen ajeno.

Versiones 0.3.13–0.3.22: SSH con acceso local, sudo e Internet, `cd /opt/playerp-ps/current && sudo /opt/playerp-ps/current/venv/bin/python cloud_admin.py`; rutas verificadas en unidades del ZIP. No formulario hasta 0.3.23. Versión desconocida: ambas opciones condicionadas, nunca promesa de hotspot.

Instalación física para Beny: paquete rpi4-2gb/arm64, usar el updater firmado ya instalado en el equipo de laboratorio y seleccionar manualmente ese único equipo conforme a [los pasos de Tom](https://github.com/bmsynergy/saas-playerp-backend/blob/d29de236dbd2b42593baba99f998eea923fe5dcf/_docs/print-server/pe469-firmware-0.3.23-pasos-beny.md). Ahora todos los anillos están deshabilitados; cualquier habilitación o instalación queda a Beny, no se realizó aquí. No usar `install.sh`/`update.sh` heredados del ZIP como instalador de 0.3.23: el segundo aún refiere 0.3.5. No reenroll/replace para actualizar un preparado. Prueba de activación requiere equipo nuevo sin preparar, configuración local existente y código de configuración; si pierde código por reinicio/15 min, reemitir. Radio, conexión, hostname y etiqueta efectivos quedan por comprobar físicamente.

## Evidencia 4 — estados y publicación

`browser/c4-offline-synced-*` y `c1-sheet-*`: A online .21 sin ACK sigue pendiente (mínimo .22); B offline .23 sincronizado; stock sin versión; versión firmada no equivale a anillo habilitado. Solo sync.confirmed con revisión/ACK vigentes confirma; GET config y respuestas viejas no lo hacen. Unlink retira acceso y cola inmediatamente en servidor incluso .21; solo su acuse exige .23, según contrato final de Tom.

Publicación exclusiva con `coredeva-publish playerp.dev <commit>`; destino contrastado en dev-targets.json y revalidado por el publicador. Acta de publicación y checks de fixture real de lectura se completan en `published/` después de publicar. No se ejecutan mutaciones en esa comprobación. Build [correcto](build.txt), única advertencia: tamaño del bundle existente. El registro oficial de publicación lo añade el conector a la entrega.
