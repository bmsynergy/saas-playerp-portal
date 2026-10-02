import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { ArrowRight, Building2, ChevronDown, ChevronLeft, ChevronRight, KeyRound, LayoutDashboard, LogOut, MailCheck, Menu, PanelLeftClose, Printer, ShieldCheck, UsersRound } from 'lucide-react';
import { useLocale } from '../locales';
import { Brand } from './Brand';

type Props = { scope: 'owner' | 'admin'; email: string; displayName: string; canAdmin: boolean; canOwner: boolean; canManageStaff: boolean; canViewTenants: boolean; navigationAllowed?: boolean; onSwitchScope: (scope: 'owner' | 'admin') => void; onLogout: () => Promise<void>; children: ReactNode };
type Crumb = { label: string; to?: string };
const collapseKey = 'playerp.portal.sidebar.collapsed';
const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function initialCollapsed() {
  try { return window.localStorage.getItem(collapseKey) === 'true'; } catch { return false; }
}

export function PortalShell({ scope, email, displayName, canAdmin, canOwner, canManageStaff, canViewTenants, navigationAllowed = true, onSwitchScope, onLogout, children }: Props) {
  const { locale, setLocale, t } = useLocale();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const navButtonRef = useRef<HTMLButtonElement>(null);
  const navWasOpen = useRef(false);
  const menuWasOpen = useRef(false);

  useEffect(() => {
    try { window.localStorage.setItem(collapseKey, String(collapsed)); } catch { /* Storage may be unavailable. */ }
  }, [collapsed]);
  useEffect(() => { setNavOpen(false); setMenuOpen(false); }, [location.pathname]);
  useEffect(() => { if (!navigationAllowed) setNavOpen(false); }, [navigationAllowed]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (navRef.current) navRef.current.inert = mobile && !navOpen;
    if (mainRef.current) mainRef.current.inert = mobile && navOpen;
    return () => { if (navRef.current) navRef.current.inert = false; if (mainRef.current) mainRef.current.inert = false; };
  }, [mobile, navOpen]);
  useEffect(() => { if (!mobile) setNavOpen(false); }, [mobile]);
  useEffect(() => {
    if (navOpen) {
      navWasOpen.current = true;
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>(focusable)?.focus());
      return () => { document.body.style.overflow = previous; };
    }
    if (navWasOpen.current) { navWasOpen.current = false; navButtonRef.current?.focus(); }
  }, [navOpen]);
  useEffect(() => {
    if (menuOpen) {
      menuWasOpen.current = true;
      requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('.account-popover button, .account-popover a')?.focus());
    } else if (menuWasOpen.current) { menuWasOpen.current = false; menuButtonRef.current?.focus(); }
  }, [menuOpen]);
  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, []);

  function trap(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); setNavOpen(false); return; }
    if (event.key !== 'Tab') return;
    const items = [...(navRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])].filter(item => item.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); }
  }
  async function logout() {
    setLoggingOut(true); setLogoutError(false);
    try { await onLogout(); } catch { setLogoutError(true); } finally { setLoggingOut(false); }
  }

  const areaTitle = scope === 'admin' ? t('staffArea') : t('ownerArea');
  const initial = (displayName || email).charAt(0).toUpperCase() || 'P';
  const nav = !navigationAllowed ? [] : scope === 'admin'
    ? [{ to: '/admin', label: t('overview'), icon: LayoutDashboard, end: true }, ...(canViewTenants ? [{ to: '/admin/tenants', label: t('directory'), icon: Building2, end: false }] : []), ...(canManageStaff ? [{ to: '/admin/print-servers', label: t('ps.nav'), icon: Printer, end: false }, { to: '/admin/staff', label: t('staff.nav'), icon: UsersRound, end: false }] : [])]
    : [{ to: '/', label: t('yourVenues'), icon: Building2, end: true }];
  const path = location.pathname;
  const crumbs: Crumb[] = !navigationAllowed ? [{ label: path === '/auth/password' ? t('passwordTitle') : path === '/auth/invitation' ? t('staff.invitationTitle') : path === '/auth/forgot' ? t('forgotTitle') : path === '/auth/complete' ? t('loadingTitle') : t('account') }] : (() => {
    const root = scope === 'admin' ? { label: t('adminHome'), to: '/admin' } : { label: t('ownerHome'), to: '/' };
    if (path === '/' || path === '/admin') return [{ label: root.label }];
    if (path.startsWith('/admin/print-servers/')) return [root, { label: t('ps.nav'), to: canManageStaff ? '/admin/print-servers' : undefined }, { label: t('ps.detailEyebrow') }];
    if (/^\/admin\/tenants\/[^/]+\/users$/.test(path)) return [root, { label: t('directory'), to: canViewTenants ? '/admin/tenants' : undefined }, { label: t('venueDetails'), to: canViewTenants ? path.slice(0, -'/users'.length) : undefined }, { label: t('identity.tab') }];
    if (path.startsWith('/admin/tenants/')) return [root, { label: t('directory'), to: canViewTenants ? '/admin/tenants' : undefined }, { label: t('venueDetails') }];
    const sectionLabels: Record<string, string> = { '/admin/tenants': t('directory'), '/admin/print-servers': t('ps.nav'), '/admin/staff': t('staff.nav') };
    return [root, { label: sectionLabels[path] ?? t('notFoundTitle') }];
  })();
  const context = crumbs[crumbs.length - 1].label;

  return <div className={`portal-layout ${collapsed ? 'sidebar-collapsed' : ''} ${!navigationAllowed ? 'navigation-restricted' : ''}`}>
    {navOpen && navigationAllowed && <button className="nav-scrim" type="button" aria-label={t('closeNavigation')} onClick={() => setNavOpen(false)} />}
    <aside ref={navRef} className={`sidebar ${navOpen ? 'sidebar-open' : ''}`} aria-label={t('navigation')} aria-hidden={mobile && !navOpen} onKeyDown={navOpen ? trap : undefined}>
      <div className="sidebar-top">
        {navigationAllowed ? <Link className="brand" to={scope === 'admin' ? '/admin' : '/'} onClick={() => setNavOpen(false)} aria-label={t('goHome')}><Brand inverse /><img className="brand-mark" src="/brand/playerp-favicon-192.png" alt="" aria-hidden="true"/></Link> : <span className="brand"><Brand inverse /><img className="brand-mark" src="/brand/playerp-favicon-192.png" alt="" aria-hidden="true"/></span>}
        <button className="icon-button sidebar-close" type="button" aria-label={t('closeNavigation')} onClick={() => setNavOpen(false)}><PanelLeftClose size={20}/></button>
      </div>
      {navigationAllowed && <><div className="sidebar-group-label">{t('navigation')}</div><nav id="portal-sidebar-links" className="sidebar-nav" aria-label={t('primaryNavigation')}>
        {nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} aria-label={label} title={collapsed ? label : undefined} onClick={() => setNavOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.9}/><span>{label}</span><ArrowRight className="nav-arrow" size={16}/></NavLink>)}
      </nav></>}
      <div className="sidebar-bottom">
        <div className="scope-card"><div className="scope-icon"><ShieldCheck size={20}/></div><div><span>{scope === 'admin' ? t('platform') : t('workspace')}</span><strong>{navigationAllowed ? areaTitle : t('account')}</strong></div></div>
        {navigationAllowed && <button className="sidebar-collapse" type="button" aria-label={t(collapsed ? 'expandNavigation' : 'collapseNavigation')} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}<span>{t(collapsed ? 'expandNavigation' : 'collapseNavigation')}</span></button>}
      </div>
    </aside>
    <div ref={mainRef} className="portal-main">
      <header className="topbar">
        <div className="topbar-left">{navigationAllowed && <button ref={navButtonRef} className="icon-button mobile-nav-button" type="button" aria-label={t('openNavigation')} aria-expanded={navOpen} aria-controls="portal-sidebar-links" onClick={() => setNavOpen(true)}><Menu size={22}/></button>}<div className="topbar-context"><span className="topbar-context-dot"/>{context}</div></div>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t('language')}><button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button><button type="button" className={locale === 'es' ? 'selected' : ''} aria-pressed={locale === 'es'} onClick={() => setLocale('es')}>ES</button></div>
          <div className="account-menu" ref={menuRef} onKeyDown={menuKey}>
            <button ref={menuButtonRef} type="button" className="account-trigger" aria-label={`${t('menu')}: ${displayName}`} aria-expanded={menuOpen} aria-controls="account-popover" onClick={() => setMenuOpen(!menuOpen)}><span className="avatar">{initial}</span><span className="account-trigger-name" title={displayName}>{displayName}</span><ChevronDown size={16}/></button>
            {menuOpen && <div className="account-popover" id="account-popover"><div className="account-popover-header"><span>{t('userEmail')}</span><strong title={email}>{email}</strong></div>{navigationAllowed && <div className="account-popover-body"><Link to="/auth/password" onClick={() => setMenuOpen(false)}><KeyRound size={17}/>{t('changePassword')}</Link>{!canAdmin && <Link to="/auth/invitation" onClick={() => setMenuOpen(false)}><MailCheck size={17}/>{t('staff.acceptInvitation')}</Link>}{scope === 'admin' && canOwner && <Link to="/" onClick={() => { setMenuOpen(false); onSwitchScope('owner'); }}><Building2 size={17}/>{t('switchOwner')}</Link>}{scope === 'owner' && canAdmin && <Link to="/admin" onClick={() => { setMenuOpen(false); onSwitchScope('admin'); }}><ShieldCheck size={17}/>{t('switchAdmin')}</Link>}</div>}<div className="account-popover-footer"><button type="button" disabled={loggingOut} onClick={logout}><LogOut size={17}/>{loggingOut ? t('signingOut') : t('signOut')}</button>{logoutError && <p className="menu-error" role="alert">{t('genericError')}</p>}</div></div>}
          </div>
        </div>
      </header>
      <main className="content" id="main-content" tabIndex={-1}><nav className="breadcrumbs" aria-label={t('breadcrumb')}>{crumbs.map((crumb, index) => <span className="breadcrumb-item" key={`${crumb.label}-${index}`}>{index > 0 && <ChevronRight size={14} aria-hidden="true"/>}{crumb.to && navigationAllowed ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={index === crumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>}</span>)}</nav>{children}</main>
      <footer className="portal-footer"><span>© {new Date().getFullYear()} PlayERP</span><span>{t('securityNote')}</span></footer>
    </div>
  </div>;
}
