import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft, Clock3, Server } from 'lucide-react';
import type { TenantDetail } from '../lib/types';
import { signalState } from '../lib/status';
import { useLocale } from '../locales';
import { VenueDetailsPanel, VenueSectionTabs } from './VenueSections';

export type TenantTab = 'overview' | 'users' | 'print-servers' | 'print-server-detail';

export function TenantDetailPage({ detail, tab = 'overview', users, printServers }: { detail: TenantDetail; tab?: TenantTab; users?: ReactNode; printServers?: ReactNode }) {
  const { t } = useLocale();
  const { venue } = detail;
  const base = `/admin/tenants/${encodeURIComponent(venue.id)}`;
  return <div className="page-stack">
    <Link className="back-link" to="/admin/tenants"><ArrowLeft size={17}/>{t('backToDirectory')}</Link>
    <div className="page-heading detail-heading"><div><p className="eyebrow">{t('tenantOverview')}</p><h1>{venue.name}</h1><p>{t('detailLead')}</p></div><span className={`status-badge ${venue.is_active === true ? 'status-active' : venue.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{venue.is_active === true ? t('active') : venue.is_active === false ? t('inactive') : t('unknown')}</span></div>
    <VenueSectionTabs active={tab === 'print-server-detail' ? 'print-servers' : tab} users={users !== undefined} printServers={printServers !== undefined} render={(item) => <NavLink key={item.section} end={item.section === 'overview'} to={item.section === 'overview' ? base : `${base}/${item.section}`} data-testid={item.testId} className={({ isActive }) => `detail-tab ${isActive ? 'active' : ''}`}>{item.icon}{item.label}</NavLink>}/>
    {tab === 'users' && users !== undefined ? users : (tab === 'print-servers' || tab === 'print-server-detail') && printServers !== undefined ? printServers : <><VenueDetailsPanel venue={venue} scope="admin"/>{printServers === undefined && <VenueServerSummary servers={detail.print_servers}/>}</>}
  </div>;
}

// Operations keeps the existing venue-authorized summary. The full fleet and
// management panel remain behind their separate platform Admin permission.
function VenueServerSummary({servers}:{servers:TenantDetail['print_servers']}) {
  const {t,locale}=useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section className="servers-panel"><div className="section-heading"><div><p className="eyebrow">{t('connectedServers')}</p><h2>{t('printServers')}</h2></div><span className="count-pill">{servers.length}</span></div>
      {servers.length ? <div className="table-scroll"><table className="servers-table"><thead><tr><th scope="col">{t('serverId')}</th><th scope="col">{t('version')}</th><th scope="col">{t('lastSignal')}</th><th scope="col">{t('state')}</th></tr></thead><tbody>{servers.map((server) => {
        const state = signalState(server);
        const signalDate = server.last_seen_at ? new Date(server.last_seen_at) : null;
        const validDate = signalDate && !Number.isNaN(signalDate.getTime()) ? signalDate : null;
        return <tr key={server.id}><td data-label={t('serverId')}><span className="server-id"><span className="server-icon"><Server size={18}/></span><span title={server.id}>{server.id}</span></span></td><td data-label={t('version')}><span className="version-text">{server.software_version || t('notProvided')}</span></td><td data-label={t('lastSignal')}><span className="signal-text"><Clock3 size={16}/>{validDate ? <time dateTime={server.last_seen_at || undefined}>{dateFormatter.format(validDate)}</time> : t('lastSignalUnknown')}</span></td><td data-label={t('state')}><span className={`server-status server-${state}`}><span className="badge-dot"/>{t(state)}</span></td></tr>;
      })}</tbody></table></div> : <div className="inline-empty servers-empty"><Server size={25}/>{t('noServers')}</div>}
    </section>
  );
}
