import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, CircleOff, MapPin } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';

export function AdminHome({ venues }: { venues: OwnerVenue[] }) {
  const { t } = useLocale();
  const active = venues.filter((venue) => venue.is_active === true).length;
  const inactive = venues.filter((venue) => venue.is_active === false).length;
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('staffArea')}</p><h1>{t('adminWelcome')}</h1><p>{t('adminLead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    <div className="stats-grid"><div className="stat-card"><div className="stat-icon"><Building2 size={22}/></div><span>{t('totalVenues')}</span><strong>{venues.length}</strong></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2 size={22}/></div><span>{t('activeVenues')}</span><strong>{active}</strong></div><div className="stat-card"><div className="stat-icon muted"><CircleOff size={22}/></div><span>{t('inactiveVenues')}</span><strong>{inactive}</strong></div></div>
    <section className="overview-panel"><div className="section-heading"><div><p className="eyebrow">{t('directory')}</p><h2>{t('recentlyViewed')}</h2></div><Link className="text-link" to="/admin/tenants">{t('browseDirectory')}<ArrowRight size={17}/></Link></div>
      {venues.length ? <div className="overview-list">{venues.slice(0, 5).map((venue) => <Link className="overview-row" key={venue.id} to={`/admin/tenants/${encodeURIComponent(venue.id)}`}><span className="overview-row-icon"><Building2 size={19}/></span><span className="overview-row-copy"><strong>{venue.name}</strong><small><MapPin size={13}/>{venue.city || t('notProvided')}</small></span><span className={`status-badge ${venue.is_active === true ? 'status-active' : venue.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{venue.is_active === true ? t('active') : venue.is_active === false ? t('inactive') : t('unknown')}</span><ArrowRight size={18} className="row-arrow"/></Link>)}</div> : <div className="inline-empty">{t('emptyDirectory')}</div>}
    </section>
  </div>;
}
