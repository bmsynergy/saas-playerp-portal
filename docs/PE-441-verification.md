# PE-441 — avance comprobado y traspaso DEV

Estado: interfaz preparada en rama; backend por rol pendiente. **No publicado, no es entrega terminada.** Work f7942220-8274-4178-b228-0c0236c363c0.

Integración previa: `origin/uma/portal-dev-resume` b169fb0 (PE437/438/440) + `origin/uma/pe439-credentials` 91cc794. Se conserva el alcance de credenciales, normalización legacy, conciliación, certificados, filtros y adopción de SSID existentes. Los cambios nuevos son estilos globales disabled, separación de firmware y estados de carga accesibles. Sin cambios en APIs ni permisos de OTA.

| Criterio | Evidencia única | Resultado y límite |
|---|---|---|
| 1 | [Ficha visual y comprobación de credenciales](evidence/pe441/criterion-1.md) | OWNER/ADMIN 390/1440: ficha compartida, SSID visible, claves ocultas, código 5-5 al mostrar/copiar, legacy exacto, QR solo etiqueta, Applied sin Check Status. Datos sintéticos y red interceptada; no es prueba de autorización viva. |
| 2 | [Salida de estilos calculados](evidence/pe441/styles/results.json) | 30 observaciones: cursor default padre/hijos en hover, disabled nativo, fondo rgb(227,232,239), texto rgb(71,84,103), contraste 6.243. Firmware Update → “No compatible signed stable firmware is available.” = 10px en ambos roles/anchos. Carga separada y bloqueo de doble acción mouse/Enter con petición interceptada en formulario. Popover: sonda CSS sobre DOM real desactivado por prueba, porque logout limpia sesión inmediatamente. |
| 3 | Pendiente | No se han implementado ni probado UI/API por rol, rechazo de no General/destino ajeno ni clasificación actual 0.3.21. No inferir cumplimiento por tests UI sintéticos. |
| 4 | Pendiente | El backend no se aplicó y el portal no se publicó. El destino del plan y espejo local es playerp.dev; registro vivo pendiente. |

Comandos locales: `npm run build` PASS; `npm test` 23 archivos / 222 pruebas PASS; `PS_TEST_EVIDENCE=docs/evidence/pe441/credentials node tests/pe439-credentials.mjs` PASS; `node tests/pe441-styles.mjs` PASS; `git diff --check` PASS. Vite se utilizó únicamente en 127.0.0.1:18799.

Revisión independiente Gaby en esta sesión: sin defectos verificables del diff visual. Señaló que no procede afirmar criterios 3/4; solicitó concretar fuente de anillo y autorización del dueño en el traspaso. Uma añadió fuentes propuestas (`ps_ota_group_members`/`ps_ota_groups`, asignación del venue y `has_venue_role`) para que Tom las contraste con ACL/definiciones vivas. No son una validación backend.

Bloqueo: MCP `supabase_execute_sql` sobre DEV, `select current_database(), now();`, rechazado por aprobación automática: `MCP tool call requires approval, but approval policy is never`. Sin rutas alternativas ni SQL/edge aplicado. Traspaso en repo backend `docs/portal/PE-441-contract-handoff.md`: contrato aditivo propuesto, invariantes y verificaciones pendientes. Tom debe concretar e implementar controles por rol y destino en DEV; Uma integrará contrato definitivo y publicará después, sin lanzar OTA real.
