import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, MapPin, Search } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { matchesText } from '../lib/adminLists';

export function TenantDirectory({ venues }: { venues: OwnerVenue[] }) {
  const { t } = useLocale();
  const { filters, set, clear } = useAdminListFilters();
  const filtered = useMemo(() => {
    return venues.filter(venue => matchesText(filters.query, venue.name, venue.slug, venue.city) && (!filters.status || (filters.status === 'active' ? venue.is_active === true : filters.status === 'inactive' ? venue.is_active === false : venue.is_active == null)));
  }, [venues, filters]);
  const pages = usePrintListPagination(filtered.length);
  const setFilter = (key: keyof typeof filters, value: string) => { set(key, value); pages.reset(); };
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('staffArea')}</p><h1>{t('tenantDirectory')}</h1><p>{t('directoryLead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    <section className="directory-panel"><div className="directory-toolbar"><AdminListFilters id="tenants" filters={filters} set={setFilter} clear={() => { clear(); pages.reset(); }} statuses={[{ value: 'active', label: t('active') }, { value: 'inactive', label: t('inactive') }, { value: 'unknown', label: t('unknown') }]}/><span className="directory-count">{filtered.length} / {venues.length}</span></div>
      {filtered.length ? <div className="directory-list" aria-label={t('searchResults')}>{filtered.slice(pages.start, pages.end).map((venue) => <Link key={venue.id} to={`/admin/tenants/${encodeURIComponent(venue.id)}`} className="directory-row"><span className="directory-row-icon"><Building2 size={21}/></span><span className="directory-row-primary"><strong>{venue.name}</strong><small>{venue.slug || t('notProvided')}</small></span><span className="directory-row-city"><MapPin size={15}/>{venue.city || t('notProvided')}</span><span className={`status-badge ${venue.is_active === true ? 'status-active' : venue.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{venue.is_active === true ? t('active') : venue.is_active === false ? t('inactive') : t('unknown')}</span><ArrowRight className="row-arrow" size={18}/></Link>)}</div> : <div className="directory-empty"><div className="directory-empty-icon"><Search size={24}/></div><h2>{filters.query || filters.status ? t('noResults') : t('emptyDirectory')}</h2>{(filters.query || filters.status) && <p>{t('noResultsHint')}</p>}</div>}
      <PrintListPagination pagination={pages} id="tenants"/>
    </section>
  </div>;
}
