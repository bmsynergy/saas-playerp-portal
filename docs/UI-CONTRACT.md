# Contrato de implementación UI — Uma/Lily

Lily: owns src/components, src/pages, src/locales, src/styles.css. Uma: src/lib, src/hooks, App.tsx, main.tsx, config/tests. No borrar cambios ajenos.

React 18 + react-router-dom 6 + lucide-react. Sin framework de estilos; CSS propio. Interfaz final sobria de producto: PlayERP, verde bosque, fondos cálidos, buen espaciado, navegación lateral, encabezado contextual, detalles legibles. 1440/834 px. Ningún control no implementado. Lecturas solamente. Sin gráficos ficticios.

Tipos src/lib/types.ts: OwnerVenue, TenantDetail, PrintServerSummary, UiError, PortalAccess. Campo tenant = venue confirmado por Tom PE-320.2. No exponer datos sensibles.

Implementar exports nombrados:
- src/locales/index.tsx: LocaleProvider, useLocale() => {locale: 'en'|'es', setLocale, t(key: string): string}. Catálogos en src/locales/en.ts y es.ts con mismas claves, elección persistida y document.lang actualizado. Fechas Intl según locale. Todo texto propio EN/ES incluso errores/carga/vacíos. Claves de errores = UiError.
- components/PortalShell.tsx: PortalShell({scope:'owner'|'admin', email:string, canAdmin:boolean, canOwner:boolean, onLogout:()=>Promise<void>, children:ReactNode}). Navegación: owner /; admin /admin y /admin/tenants; menú usuario enlaza /auth/password y ámbito alternativo solo si autorizado. Selector idioma. Logout funcional busy/error si rechaza.
- components/StateView.tsx: StateView({kind:'loading'|'error'|'denied'|'empty'|'notFound', onRetry?:()=>void}). Puede aceptar message?:string. Errores traducidos, enlaces útiles de volver.
- pages/AuthPage.tsx: AuthPage({mode:'login'|'forgot'|'password', onSubmit:(email:string,password:string)=>Promise<void>, error:UiError|null, busy:boolean, success:boolean, recovery?:boolean}). Inputs email/password según modo, confirmación de contraseña para password, enlaces /auth/login y /auth/forgot. Password mínimo 12 caracteres. Mensaje éxito reset neutro sin enumeración de cuentas; password éxito enlace a /auth/complete. Idioma presente. Sin lógica Supabase.
- pages/OwnerPage.tsx: OwnerPage({venues:OwnerVenue[],selectedId:string,onSelect:(id:string)=>void}). Selector cuando >1; ficha venue seleccionado y detalles disponibles; no botones de edición.
- pages/AdminHome.tsx: AdminHome({venues:OwnerVenue[]}). Bienvenida, contadores derivados solo de venues, acceso al directorio y primeras fichas útiles.
- pages/TenantDirectory.tsx: TenantDirectory({venues:OwnerVenue[]}). Búsqueda local por nombre/slug/ciudad, estado vacío; enlaces /admin/tenants/:id.
- pages/TenantDetailPage.tsx: TenantDetailPage({detail:TenantDetail}). Info venue y tabla Print Servers: identificador, software_version, última señal Intl, estado. Importar signalState(server) de ../lib/status. Revoked prima; pending se muestra Pendiente; active con señal < 3 min online, antigua offline, null noSignal. Umbral alineado con ps_panel_state según confirmación de Tom. Etiquetas comprensibles EN/ES; ausentes como no informados. Sin cloud_printers ni secretos.

Uma integra routing, sesión, permisos, RPC y efectos. No llamar API ni crear mocks dentro UI. La UI recibe datos por props y nunca concede permisos por sí misma.
