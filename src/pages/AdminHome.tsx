import { Link } from 'react-router-dom';
import '../tenant-onboarding.css';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { useLocale } from '../locales';
import { useTenantReadinessList } from '../hooks/useTenantReadinessList';
import type { Lifecycle } from '../lib/tenantOnboarding';

const STATES: Lifecycle[] = ['setup_incomplete', 'ready', 'active', 'suspended'];

export function AdminHome({ canCreate = false }: { canCreate?: boolean }) {
  const { t, locale } = useLocale();
  const number = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US');
  const list = useTenantReadinessList('', '', 1, 5);
  const result = list.data;
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('staffArea')}</p><h1>{t('adminWelcome')}</h1><p>{t('adminLead')}</p></div>{canCreate ? <Link className="button button-primary" to="/admin/tenants/new" data-testid="new-tenant"><Plus size={17}/>{t('tenantNew.button')}</Link> : <div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div>}</div>
    {list.isError ? <div className="form-error" role="alert">{t('genericError')} <button type="button" className="text-link" onClick={() => void list.refetch()}>{t('retry')}</button></div>
      : !result ? <div className="inline-empty" role="status"><span className="spinner"/> {t('loadingTitle')}</div>
      : <>
        <div className="stats-grid tenant-stats-grid"><div className="stat-card"><div className="stat-icon"><Building2 size={22}/></div><span>{t('totalVenues')}</span><strong>{number.format(result.total)}</strong></div>{STATES.map(state => <div className="stat-card" key={state}><div className={`stat-icon readiness-${state}`}><span className="badge-dot"/></div><span>{t(`readiness.lifecycle.${state}`)}</span><strong>{number.format(result.summary[state] ?? 0)}</strong></div>)}</div>
        <section className="overview-panel"><div className="section-heading"><div><p className="eyebrow">{t('directory')}</p><h2>{t('recentlyViewed')}</h2></div><Link className="text-link" to="/admin/tenants">{t('browseDirectory')}<ArrowRight size={17}/></Link></div>
          {result.items.length ? <div className="overview-list">{result.items.map(venue => <Link className="overview-row" key={venue.venue_id} to={`/admin/tenants/${encodeURIComponent(venue.venue_id)}`}><span className="overview-row-icon"><Building2 size={19}/></span><span className="overview-row-copy"><strong>{venue.venue_name}</strong><small>{venue.venue_slug || t('notProvided')}</small></span><span className={`status-badge readiness-${venue.lifecycle}`}><span className="badge-dot"/>{t(`readiness.lifecycle.${venue.lifecycle}`)}</span><ArrowRight size={18} className="row-arrow"/></Link>)}</div> : <div className="inline-empty">{t('emptyDirectory')}</div>}
        </section>
      </>}
  </div>;
}
