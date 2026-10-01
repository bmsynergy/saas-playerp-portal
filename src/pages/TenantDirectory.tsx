import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, MapPin, Search, X } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';

export function TenantDirectory({ venues }: { venues: OwnerVenue[] }) {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return venues;
    return venues.filter((venue) => [venue.name, venue.slug, venue.city].some((value) => value?.toLocaleLowerCase().includes(normalized)));
  }, [venues, query]);
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('staffArea')}</p><h1>{t('tenantDirectory')}</h1><p>{t('directoryLead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    <section className="directory-panel"><div className="directory-toolbar"><label className="search-field"><span className="sr-only">{t('search')}</span><Search size={19}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')}/>{query && <button type="button" aria-label={t('clearSearch')} onClick={() => setQuery('')}><X size={17}/></button>}</label><span className="directory-count">{filtered.length} / {venues.length}</span></div>
      {filtered.length ? <div className="directory-list" aria-label={t('searchResults')}>{filtered.map((venue) => <Link key={venue.id} to={`/admin/tenants/${encodeURIComponent(venue.id)}`} className="directory-row"><span className="directory-row-icon"><Building2 size={21}/></span><span className="directory-row-primary"><strong>{venue.name}</strong><small>{venue.slug || t('notProvided')}</small></span><span className="directory-row-city"><MapPin size={15}/>{venue.city || t('notProvided')}</span><span className={`status-badge ${venue.is_active === true ? 'status-active' : venue.is_active === false ? 'status-inactive' : 'status-unknown'}`}><span className="badge-dot"/>{venue.is_active === true ? t('active') : venue.is_active === false ? t('inactive') : t('unknown')}</span><ArrowRight className="row-arrow" size={18}/></Link>)}</div> : <div className="directory-empty"><div className="directory-empty-icon"><Search size={24}/></div><h2>{query ? t('noResults') : t('emptyDirectory')}</h2>{query && <p>{t('noResultsHint')}</p>}</div>}
    </section>
  </div>;
}
