# PE-411.3 — dependencia para Tom, solo DEV

Estado: **contrato aceptado, implementado, versionado y aplicado por Tom en DEV**.
Backend main: `f071571f82a50694648c395073560d2a5bfe8226` (PE-411.4).
Migración nueva: `_migrations/20261012160000_pe411_ps_credentials_confirmed_contract.sql`;
26/26 comprobaciones con fixtures DEV y transacción revertida, según entrega oficial de Tom.
El portal consume la versión 1 sin cambios de forma. No se ha operado ningún PS físico.

Base portal servida revalidada al retomar: `9df27e403f248d1ae7f605956eedc9bde2fe1e19`.
El backend `0377126` fue la lectura inicial de la propuesta y queda sustituido por el SHA anterior.

Acuerdo legacy definitivo: [documento de Tom](https://github.com/bmsynergy/saas-playerp-backend/blob/f071571f82a50694648c395073560d2a5bfe8226/_docs/print-server/pe411-credenciales-confirmadas-y-conciliacion-legacy.md).
La identidad/vínculo y confianza HTTPS se verifican junto al aparato; el código se prueba iniciando
sesión local y el Wi-Fi mediante lectura autenticada y conexión dentro de 90 s. La futura RPC
restringida de registro admitirá pruebas parciales, sin inventar ni rotar. No se implementa ni
se ejecuta esa conciliación en esta pieza; el legacy permanece ausente y bloquea etiqueta.

Se conserva debajo la propuesta original como antecedente; los futuros y solicitudes a Tom
que contiene ya están resueltos por su entrega, salvo el registro legacy futuro indicado arriba.

## Contrato compatible propuesto

Conservar `ps_panel_device(p_venue_id)` y su estructura device/cert/rotations/cert_operations.
Agregar `credentials_version: 1`, `can_read_credentials: boolean` y `can_manage_credentials: boolean`.
Mantener `wifi: null | {ssid, psk, admin_code, wifi_applied_at, admin_code_applied_at}`;
las claves pueden ser null independientemente:

- Wi-Fi confirmado: ssid, psk y wifi_applied_at juntos, solo si hay confirmación real para ESE
  aparato. Caso contrario, los tres null. Igual para admin_code y admin_code_applied_at.
- Lector no autorizado: wifi null y ambos permisos false. Mantener acceso operativo previo
  a la ficha donde ya exista, sin filtrar secretos para luego ocultarlos en React.
- Staff SaaS activo autorizado según los permisos vigentes (hoy super_admin), u owner activo
  **de ese venue** por su membresía; no basta un rol global owner o manager de otro local.
- `can_manage_credentials`: misma autorización para rotar Wi-Fi/código. Esta propuesta limita
  solo esas dos RPC, preserva `_ps_panel_can_manage` para las demás operaciones. Evita que un
  manager sin acceso a secretos los rote a espaldas de su owner.
- En stock/alta sin confirmar: nunca presentar generado como aplicado. `status=active`, éxito
  del alta y timestamps fabricados no son prueba. No devolver pending_* ni parámetros de órdenes.
- Pendiente/fallida con anterior confirmado: devolver el anterior y su fecha real; las listas
  de operaciones, sin secretos, explican el estado de la nueva solicitud.
- Seguir conservando tokens técnicos, hashes y cuerpos sensibles fuera de lecturas y logs.
  Revisar también otras rutas humanas, no solo ps_panel_device, para que no eludan el filtro.

El portal falla cerrado si falta el marcador de versión o permiso y valida WPA2 de 10 dígitos,
SSID UTF-8 de 1–32 bytes sin controles y código de 10 caracteres del alfabeto existente.
No confundir esas validaciones del cliente con la autorización del servidor.

## Camino a aplicado sin cambiar firmware

`cloud_admin.py` deja el resultado enroll_credentials en el informe local, no en la nube.
Para **un PS nuevo con base compatible y activado**, el owner o staff solicita conscientemente
las rotaciones existentes, Wi-Fi y admin por separado. Solo el `done` auténtico y autenticado
por el aparato habilita cada dato. Son cambios de credenciales explícitos, no parte automática
ni oculta del alta. Esta pieza no los ejecuta en ningún aparato real.

Reutilizar `_ps_rotation_command_result` y verificar vínculo identidad/orden/aparato. Pending o
failed conservan el anterior confirmado. No retrofechar ni copiar pendientes a aplicados.

## Legacy: mecanismo a acordar, no ejecutar

`playerp-print-001` permanece con ausencia/no verificado y etiqueta bloqueada.
Propuesta para Tom: conciliación excepcional y autorizada de los valores ya vigentes, sin
rotación ni nuevo exportador de firmware. Antes de aceptar nada, verificar aparato físico,
serial/inventario, print_server_id y venue, vínculo autenticado y acceso autorizado del operador.
Registrar procedencia y confirmación verificable, nunca contenido de secretos en auditoría.

Beny necesita estar junto al aparato o tener acceso local administrativo autorizado:
1. Identificar el aparato y abrir su administración local con la confianza existente.
2. `/api/wifi/recovery` autenticada aporta SSID/PSK actuales, **no** el código administrativo.
3. Verificar el código vigente mediante acceso administrativo local autorizado, por separado.
   No copiar config.json entero, credenciales técnicas ni tokens. No asumir que la lectura
   Wi-Fi demuestra también el código.
4. Tom debe definir el canal restringido de conciliación y la evidencia que permite confirmar
   por separado cada valor en la tabla existente. No aceptar una transcripción sin comprobación
   de identidad/vínculo/origen. Si el canal o prueba no existe, mantener ausencia.
5. Conservar hostname `playerp-print-001`, CA, certificado y credencial técnica sin cambios.

La tabla existente exige valores no nulos para Wi-Fi y código: Tom deberá decidir cómo admitir
confirmación parcial sin inventar el valor que falte (por ejemplo ajustar nulabilidad/constraints
con migración compatible), o mantener toda la ausencia hasta obtener ambas pruebas. No crear
otra tabla de credenciales. Si no hay acceso al código local vigente, no reemplazarlo con rotación.

## Prueba focalizada y retorno necesario

Un único recorrido con fixtures **DEV identificados**, salida redactada: crear/asignar conserva
serial; activación un uso distinta del admin; staff/owner propio permitidos; otro venue, anónimo,
sin permiso y manager sin secreto denegados. Datos operativos previos siguen accesibles según
contrato. Alta no confirmada → bloqueado; done real → aplicado; pending/failed → anterior intacto.
Revisar lectura directa de tabla y RPC alternativas, logs/auditoría sin secretos. No usar venues
reales ni aparatos, no OTA ni reemplazos físicos. No incluir valores reales en capturas.

Retorno: SHA remoto backend, migraciones/edges realmente aplicadas en DEV y evidencia redactada;
acuerdo definitivo de conciliación y pasos físicos que quedan pendientes. Tom revalida el registro
`playerp.dev` por mecanismo autorizado; aquí solo se ha leído el espejo oficial dev-targets.json,
no se afirma comprobación SQL de coredeva.dev_target. Entonces Uma integra/publica y verifica.
