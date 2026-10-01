# Contrato de implementación UI — Uma/Lily

Lily: owns src/components, src/pages, src/locales, src/styles.css. Uma: src/lib, src/hooks, App.tsx, main.tsx, config/tests. No borrar cambios ajenos.

React 18 + react-router-dom 6 + lucide-react. Sin framework de estilos; CSS propio. Interfaz final sobria de producto: PlayERP, navy profundo #02193F, azul eléctrico #1268FE, blanco y neutros fríos claros, buen espaciado, navegación lateral, encabezado contextual, detalles legibles. 1440/834/390 px. Ningún control no implementado. Lecturas solamente. Sin gráficos ficticios.

Tipos src/lib/types.ts: OwnerVenue, TenantDetail, PrintServerSummary, UiError, PortalAccess. Campo tenant = venue confirmado por Tom PE-320.2. No exponer datos sensibles.

Implementar exports nombrados:
- src/locales/index.tsx: LocaleProvider, useLocale() => {locale: 'en'|'es', setLocale, t(key: string): string}. Catálogos en src/locales/en.ts y es.ts con mismas claves, elección persistida y document.lang actualizado. Fechas Intl según locale. Todo texto propio EN/ES incluso errores/carga/vacíos. Claves de errores = UiError.
- components/PortalShell.tsx: PortalShell({scope:'owner'|'admin', email:string, displayName:string, canAdmin:boolean, canOwner:boolean, canManageStaff:boolean, canViewTenants:boolean, navigationAllowed?:boolean, onSwitchScope:(scope:'owner'|'admin')=>void, onLogout:()=>Promise<void>, children:ReactNode}). Navegación: owner /; admin /admin y /admin/tenants; menú usuario enlaza /auth/password y ámbito alternativo solo si autorizado. Selector idioma. Logout funcional busy/error si rechaza.
- components/StateView.tsx: StateView({kind:'loading'|'error'|'denied'|'empty'|'notFound', onRetry?:()=>void}). Acepta message?:string y allowHome?:boolean. Errores traducidos, enlaces útiles de volver.
- pages/AuthPage.tsx: AuthPage({mode:'login'|'forgot'|'password', onSubmit:(email:string,password:string)=>Promise<void>, error:UiError|null, busy:boolean, success:boolean, recovery?:boolean, invitation?:boolean, embedded?:boolean}). Inputs email/password según modo, confirmación de contraseña para password, enlaces /auth/login y /auth/forgot. Password mínimo 12 caracteres. Mensaje éxito reset neutro sin enumeración de cuentas; password éxito enlace a /auth/complete. Idioma presente. Sin lógica Supabase.
- pages/OwnerPage.tsx: OwnerPage({venues:OwnerVenue[],selectedId:string,onSelect:(id:string)=>void}). Selector cuando >1; ficha venue seleccionado y detalles disponibles; no botones de edición.
- pages/AdminHome.tsx: AdminHome({venues:OwnerVenue[]}). Bienvenida, contadores derivados solo de venues, acceso al directorio y primeras fichas útiles.
- pages/TenantDirectory.tsx: TenantDirectory({venues:OwnerVenue[]}). Búsqueda local por nombre/slug/ciudad, estado vacío; enlaces /admin/tenants/:id.
- pages/TenantDetailPage.tsx: TenantDetailPage({detail:TenantDetail}). Info venue y tabla Print Servers: identificador, software_version, última señal Intl, estado. Importar signalState(server) de ../lib/status. Revoked prima; pending se muestra Pendiente; active con señal < 3 min online, antigua offline, null noSignal. Umbral alineado con ps_panel_state según confirmación de Tom. Etiquetas comprensibles EN/ES; ausentes como no informados. Sin cloud_printers ni secretos.

PortalShell conserva el colapso entre rutas y recargas; navigationAllowed=false suprime enlaces de área y cambios de ámbito. PortalDialog comparte bloqueo del fondo, foco y Escape, cuerpo desplazable y acciones inferiores. AuthPage embedded=true omite el layout de login.

Uma integra routing, sesión, permisos, RPC y efectos. No llamar API ni crear mocks dentro UI. La UI recibe datos por props y nunca concede permisos por sí misma.

Paleta de marca vigente en DEV: tokens en `src/styles.css` para navy, azul, superficies y contraste. El logo inverso se usa sobre navy; el logo oscuro, sobre blanco o superficies claras. Verde, ámbar y rojo quedan reservados para éxito, aviso y error reales.

## Print Servers de plataforma — `/admin/print-servers`

Rutas (ámbito admin, dentro de `PortalShell`):
- `/admin/print-servers` — flota global: una fila por venue con estado del Print Server (En línea / Sin conexión / Alta pendiente / Sin Print Server), versión, última señal, impresoras y cola. Filtros en cliente (`src/lib/printFleet.ts`, funciones puras con `now`): texto y selector de venue, versión, última señal, estado e impresoras; contador "N de M" y "Limpiar filtros".
- `/admin/print-servers/:venueId` — detalle del venue: ficha del Print Server, alta/reemplazo, revocación, certificado público, diagnóstico y cola, escaneo de red e impresoras térmicas. Estado refrescado cada 10 s y tras cada acción.

Quién las ve: solo Admin de plataforma (`access.can_manage_staff`, `super_admin`), igual que Users y Staff. La entrada de navegación solo aparece con `canManageStaff`; `safeNext`/`destination` solo aceptan estas rutas como `next` para Admin. Operaciones conserva su tabla de Print Servers de solo lectura en `/admin/tenants/:id` y nunca llama a estas RPC. El backend valida cada RPC; `42501` se muestra como acceso denegado. Si `ps_panel_state.can_manage` es falso, el detalle queda en solo lectura (sin botones de acción).

RPC usadas (`src/lib/printServerApi.ts`, cliente `supabase` con clave publicable y la sesión del usuario): `portal_ps_fleet`, `ps_panel_state`, `ps_panel_create_enrollment` (TTL 60 min), `ps_panel_revoke`, `ps_panel_ca_cert`, `ps_panel_request_scan`, `ps_panel_command` (sondeo cada 1,5 s, máx. 3 min), `ps_panel_add_printer`, `ps_panel_update_printer`, `ps_panel_set_printer_active`, `ps_panel_test_print`, `ps_panel_remove_printer` (`p_force:false`; si responde `printer_in_use`, segunda confirmación con puestos y trabajos pendientes y solo entonces `p_force:true`).

Reglas:
- Proyección por lista blanca: cada respuesta se reconstruye campo a campo en objetos tipados; las claves desconocidas (hashes, credenciales, cuerpo del certificado en flota/estado) no se copian al estado, a la caché de consultas ni a logs. Los errores del backend (`label_required`, `invalid_mac`, `no_active_print_server`, `mac_already_registered`, `label_already_used`, `printer_not_on_ps_route`, `printer_in_use`, `no_ca_cert_reported`) se traducen a claves `ps.error.*` EN/ES; lo desconocido cae en `genericError`.
- Código de alta mostrado una sola vez y nunca almacenado: `enrollment_code` vive únicamente en el estado React del diálogo (nunca en localStorage/sessionStorage, URL, caché de react-query ni consola), desaparece al cerrar el diálogo y la interfaz avisa de que no puede volver a mostrarse. Con un alta pendiente solo se muestra "Alta pendiente hasta <hora>", sin código.
- Toda escritura pasa por un diálogo de confirmación (`confirm-dialog` / `confirm-accept` / `confirm-cancel`) que nombra el venue y la consecuencia; los botones quedan deshabilitados mientras la acción está en curso y el resultado o el error traducido aparece en `action-result` (`role="status"`). La descarga del certificado es una lectura y no pide confirmación.
- Certificado: solo el PEM público. Se rechaza la descarga si la respuesta contiene `PRIVATE KEY`; si el Print Server no lo informó se muestra "No informado" y el botón queda deshabilitado. La URL del portal se muestra como texto, nunca como enlace.

Prueba de navegador con datos sintéticos (sin llamadas reales al backend): `node tests/print-servers-smoke.mjs` con `npm run dev -- --port 18799` en marcha.
