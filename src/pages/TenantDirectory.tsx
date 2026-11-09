import { useEffect, useState } from 'react';
import '../tenant-onboarding.css';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Plus, Search } from 'lucide-react';
import { useLocale } from '../locales';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination } from '../components/PrintListPagination';
import { useTenantReadinessList } from '../hooks/useTenantReadinessList';
import type { Lifecycle } from '../lib/tenantOnboarding';

export function TenantDirectory({ canCreate = false }: { canCreate?: boolean }) {
  const { t, locale } = useLocale();
  const number = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US');
  const { filters, set, clear } = useAdminListFilters();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(filters.query), 250);
    return () => window.clearTimeout(timer);
  }, [filters.query]);
  const list = useTenantReadinessList(query, filters.status as Lifecycle | '', page, pageSize);
  const result = list.data;
  useEffect(() => { if (result && page > result.pages) setPage(result.pages); }, [result, page]);
  const setFilter = (key: keyof typeof filters, value: string) => { set(key, value); setPage(1); };
  const pagination = {
    page: result?.page ?? page, pageCount: result?.pages ?? 1, pageSize: result?.page_size ?? pageSize,
    start: ((result?.page ?? page) - 1) * (result?.page_size ?? pageSize),
    end: result ? Math.min(result.page * result.page_size, result.total) : 0,
    total: result?.total ?? 0, setPage, setPageSize: (size: number) => { setPageSize(size); setPage(1); },
  };
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{t('staffArea')}</p><h1>{t('tenantDirectory')}</h1><p>{t('directoryLead')}</p></div>{canCreate ? <Link className="button button-primary" to="/admin/tenants/new" data-testid="new-tenant"><Plus size={17}/>{t('tenantNew.button')}</Link> : <div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div>}</div>
    <section className="directory-panel"><div className="directory-toolbar"><AdminListFilters id="tenants" filters={filters} set={setFilter} clear={() => { clear(); setPage(1); }} searchPlaceholder={t('searchPlaceholder')} statuses={(['setup_incomplete', 'ready', 'active', 'suspended'] as const).map(value => ({ value, label: t(`readiness.lifecycle.${value}`) }))}/>{result && !list.isError && <span className="directory-count">{number.format(result.total)}</span>}</div>
      <div data-pagination-list="tenants" />
      {list.isError ? <div className="form-error" role="alert">{t('genericError')} <button type="button" className="text-link" onClick={() => void list.refetch()}>{t('retry')}</button></div>
        : !result ? <div className="inline-empty" role="status"><span className="spinner"/> {t('loadingTitle')}</div>
        : result.items.length ? <div className="directory-list" aria-label={t('searchResults')}>{result.items.map(venue => <Link key={venue.venue_id} to={`/admin/tenants/${encodeURIComponent(venue.venue_id)}`} className="directory-row tenant-directory-row"><span className="directory-row-icon"><Building2 size={21}/></span><span className="directory-row-primary"><strong>{venue.venue_name}</strong><small>{venue.venue_slug || t('notProvided')}</small></span><span className={`status-badge readiness-${venue.lifecycle}`}><span className="badge-dot"/>{t(`readiness.lifecycle.${venue.lifecycle}`)}</span><ArrowRight className="row-arrow" size={18}/></Link>)}</div>
        : <div className="directory-empty"><div className="directory-empty-icon"><Search size={24}/></div><h2>{filters.query || filters.status ? t('noResults') : t('emptyDirectory')}</h2>{(filters.query || filters.status) && <p>{t('noResultsHint')}</p>}</div>}
      {result && !list.isError && <PrintListPagination pagination={pagination} id="tenants" disabled={list.isFetching || query !== filters.query}/>}
    </section>
  </div>;
}
