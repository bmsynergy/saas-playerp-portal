import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ArrowRight, Building2, ChevronDown, KeyRound, LayoutDashboard, LogOut, MailCheck, Menu, PanelLeftClose, ShieldCheck, UsersRound } from 'lucide-react';
import { useLocale } from '../locales';
import { Brand } from './Brand';

type Props = { scope: 'owner' | 'admin'; email: string; displayName: string; canAdmin: boolean; canOwner: boolean; canManageStaff: boolean; onSwitchScope: (scope: 'owner' | 'admin') => void; onLogout: () => Promise<void>; children: ReactNode };

export function PortalShell({ scope, email, displayName, canAdmin, canOwner, canManageStaff, onSwitchScope, onLogout, children }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function dismiss(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setMenuOpen(false); setNavOpen(false); } }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(false);
    try { await onLogout(); }
    catch { setLogoutError(true); }
    finally { setLoggingOut(false); }
  }

  const title = scope === 'admin' ? t('staffArea') : t('ownerArea');
  const initial = (displayName || email).charAt(0).toUpperCase() || 'P';
  const nav = scope === 'admin'
    ? [{ to: '/admin', label: t('overview'), icon: LayoutDashboard, end: true }, ...(canManageStaff ? [{ to: '/admin/tenants', label: t('directory'), icon: Building2, end: false }, { to: '/admin/staff', label: t('staff.nav'), icon: UsersRound, end: false }] : [])]
    : [{ to: '/', label: t('yourVenues'), icon: Building2, end: true }];

  return <div className="portal-layout">
    {navOpen && <button className="nav-scrim" type="button" aria-label={t('menu')} onClick={() => setNavOpen(false)} />}
    <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`} aria-label={t('navigation')}>
      <div className="sidebar-top">
        <Link className="brand" to={scope === 'admin' ? '/admin' : '/'} onClick={() => setNavOpen(false)}><Brand inverse /></Link>
        <button className="icon-button sidebar-close" type="button" aria-label={t('menu')} onClick={() => setNavOpen(false)}><PanelLeftClose size={20}/></button>
      </div>
      <div className="sidebar-group-label">{t('navigation')}</div>
      <nav className="sidebar-nav">
        {nav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setNavOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.9}/><span>{label}</span><ArrowRight className="nav-arrow" size={16}/></NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="scope-card"><div className="scope-icon"><ShieldCheck size={20}/></div><div><span>{scope === 'admin' ? t('platform') : t('workspace')}</span><strong>{title}</strong></div></div>
      </div>
    </aside>
    <div className="portal-main">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-nav-button" type="button" aria-label={t('menu')} aria-expanded={navOpen} onClick={() => setNavOpen(true)}><Menu size={22}/></button><div className="topbar-context"><span className="topbar-context-dot"/>{title}</div></div>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label={t('language')}><button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button><button type="button" className={locale === 'es' ? 'selected' : ''} aria-pressed={locale === 'es'} onClick={() => setLocale('es')}>ES</button></div>
          <div className="account-menu" ref={menuRef}>
            <button type="button" className="account-trigger" aria-label={`${t('menu')}: ${displayName}`} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span className="avatar">{initial}</span><span className="account-trigger-name" title={displayName}>{displayName}</span><ChevronDown size={16}/></button>
            {menuOpen && <div className="account-popover" role="menu"><div className="account-popover-header"><span>{t('userEmail')}</span><strong title={email}>{email}</strong></div><div className="account-popover-body"><Link role="menuitem" to="/auth/password" onClick={() => setMenuOpen(false)}><KeyRound size={17}/>{t('changePassword')}</Link>{!canAdmin && <Link role="menuitem" to="/auth/invitation" onClick={() => setMenuOpen(false)}><MailCheck size={17}/>{t('staff.acceptInvitation')}</Link>}{scope === 'admin' && canOwner && <Link role="menuitem" to="/" onClick={() => { setMenuOpen(false); onSwitchScope('owner'); }}><Building2 size={17}/>{t('switchOwner')}</Link>}{scope === 'owner' && canAdmin && <Link role="menuitem" to="/admin" onClick={() => { setMenuOpen(false); onSwitchScope('admin'); }}><ShieldCheck size={17}/>{t('switchAdmin')}</Link>}</div><div className="account-popover-footer"><button type="button" role="menuitem" disabled={loggingOut} onClick={logout}><LogOut size={17}/>{loggingOut ? t('signingOut') : t('signOut')}</button>{logoutError && <p className="menu-error" role="alert">{t('genericError')}</p>}</div></div>}
          </div>
        </div>
      </header>
      <main className="content" id="main-content">{children}</main>
      <footer className="portal-footer"><span>© {new Date().getFullYear()} PlayERP</span><span>{t('securityNote')}</span></footer>
    </div>
  </div>;
}
