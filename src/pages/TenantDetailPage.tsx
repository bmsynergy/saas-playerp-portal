import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Clock3, Globe2, Mail, MapPin, Phone, Server } from 'lucide-react';
import type { TenantDetail } from '../lib/types';
import { signalState } from '../lib/status';
import { useLocale } from '../locales';
import { DetailItem } from './OwnerPage';

export function TenantDetailPage({ detail }: { detail: TenantDetail }) {
  const { t, locale } = useLocale();
  const { venue, print_servers: servers } = detail;
  const dateFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return <div className="page-stack">
    <Link className="back-link" to="/admin/tenants"><ArrowLeft size={17}/>{t('backToDirectory')}</Link>
    <div className="page-heading detail-heading"><div><p className="eyebrow">{t('tenantOverview')}</p><h1>{venue.name}</h1><p>{t('detailLead')}</p></div><span className={`status-badge ${venue.is_active === true ? 'status-active' : venue.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{venue.is_active === true ? t('active') : venue.is_active === false ? t('inactive') : t('unknown')}</span></div>
    <section className="detail-panel"><div className="section-heading"><div><p className="eyebrow">{t('venues')}</p><h2>{t('venueDetails')}</h2></div><span className="section-icon"><Building2 size={20}/></span></div><div className="detail-grid"><DetailItem icon={<MapPin size={19}/>} label={t('city')} value={venue.city}/><DetailItem icon={<Globe2 size={19}/>} label={t('slug')} value={venue.slug}/><DetailItem icon={<MapPin size={19}/>} label={t('address')} value={venue.address}/><DetailItem icon={<Globe2 size={19}/>} label={t('timezone')} value={venue.timezone}/><DetailItem icon={<Phone size={19}/>} label={t('phone')} value={venue.phone}/><DetailItem icon={<Mail size={19}/>} label={t('email')} value={venue.email} isEmail/></div></section>
    <section className="servers-panel"><div className="section-heading"><div><p className="eyebrow">{t('connectedServers')}</p><h2>{t('printServers')}</h2></div><span className="count-pill">{servers.length}</span></div>
      {servers.length ? <div className="table-scroll"><table className="servers-table"><thead><tr><th scope="col">{t('serverId')}</th><th scope="col">{t('version')}</th><th scope="col">{t('lastSignal')}</th><th scope="col">{t('state')}</th></tr></thead><tbody>{servers.map((server) => {
        const state = signalState(server);
        const signalDate = server.last_seen_at ? new Date(server.last_seen_at) : null;
        const validDate = signalDate && !Number.isNaN(signalDate.getTime()) ? signalDate : null;
        return <tr key={server.id}><td data-label={t('serverId')}><span className="server-id"><span className="server-icon"><Server size={18}/></span><span title={server.id}>{server.id}</span></span></td><td data-label={t('version')}><span className="version-text">{server.software_version || t('notProvided')}</span></td><td data-label={t('lastSignal')}><span className="signal-text"><Clock3 size={16}/>{validDate ? <time dateTime={server.last_seen_at || undefined}>{dateFormatter.format(validDate)}</time> : t('lastSignalUnknown')}</span></td><td data-label={t('state')}><span className={`server-status server-${state}`}><span className="badge-dot"/>{t(state)}</span></td></tr>;
      })}</tbody></table></div> : <div className="inline-empty servers-empty"><Server size={25}/>{t('noServers')}</div>}
    </section>
  </div>;
}
