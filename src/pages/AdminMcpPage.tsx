import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useLocale } from '../locales';
import type { McpFilters, McpTenantOption, McpVenueList } from '../lib/mcp';

export type AdminMcpPageProps = {
  filters: McpFilters; onFilters: (filters: McpFilters) => void;
  list: McpVenueList | undefined; loading: boolean; error: string | null;
  tenants: McpTenantOption[]; tenantSearch: string; onTenantSearch: (search: string) => void;
  onRetry: () => void;
};

export function McpEffectiveBadge({ efectivo, motivo }: { efectivo: boolean; motivo: string }) {
  const { t } = useLocale();
  return <span className={`status-badge mcp-badge ${efectivo ? 'status-active' : 'status-inactive'}`} data-testid="mcp-effective">
    <span className="badge-dot" />{t(efectivo ? 'mcp.effective.on' : 'mcp.effective.off')} · {t(`mcp.reason.${motivo}`)}
  </span>;
}

export function AdminMcpPage({ filters, onFilters, list, loading, error, tenants, tenantSearch, onTenantSearch, onRetry }: AdminMcpPageProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(() => ({ search: filters.search, owner_search: filters.owner_search, status: filters.status, tenant: filters.tenant }));
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / filters.page_size));
  const apply = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onFilters({ ...filters, ...draft, page: 1 }); };
  const start = list && list.total ? (list.page - 1) * list.page_size + 1 : 0;
  const end = list ? Math.min(list.total, list.page * list.page_size) : 0;
  return <div className="page-stack staff-page" data-testid="admin-mcp">
    <div className="page-heading"><div><p className="eyebrow">{t('mcp.eyebrow')}</p><h1>{t('mcp.adminTitle')}</h1><p>{t('mcp.adminLead')}</p></div><div className="heading-accent"><Bot size={30} /></div></div>
    <section className="staff-panel" aria-labelledby="mcp-directory-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.directoryEyebrow')}</p><h2 id="mcp-directory-title">{t('mcp.directoryTitle')}</h2></div>{list && <span className="count-pill">{list.total}</span>}</div>
      <form className="mcp-filters" role="search" onSubmit={apply}>
        <label className="field"><span>{t('mcp.searchVenue')}</span><div className="field-control mcp-search"><Search size={17} aria-hidden="true" /><input value={draft.search} onChange={e => setDraft(current => ({ ...current, search: e.target.value }))} placeholder={t('mcp.searchVenuePlaceholder')} /></div></label>
        <label className="field"><span>{t('mcp.searchOwner')}</span><div className="field-control mcp-search"><Search size={17} aria-hidden="true" /><input value={draft.owner_search} onChange={e => setDraft(current => ({ ...current, owner_search: e.target.value }))} placeholder={t('mcp.searchOwnerPlaceholder')} /></div></label>
        <label className="field"><span>{t('mcp.statusFilter')}</span><div className="field-control"><select value={draft.status} onChange={e => setDraft(current => ({ ...current, status: e.target.value as McpFilters['status'] }))}><option value="all">{t('mcp.filterAll')}</option><option value="active">{t('mcp.filterActive')}</option><option value="inactive">{t('mcp.filterInactive')}</option></select></div></label>
        <div className="mcp-tenant-filter"><label className="field" htmlFor="mcp-tenant-search"><span>{t('mcp.tenantFilter')}</span><div className="field-control"><input id="mcp-tenant-search" value={tenantSearch} onChange={e => onTenantSearch(e.target.value)} placeholder={t('mcp.searchTenant')} /></div></label><label className="mcp-sr-only" htmlFor="mcp-tenant-select">{t('mcp.tenantFilter')}</label><select id="mcp-tenant-select" value={draft.tenant ?? ''} onChange={e => setDraft(current => ({ ...current, tenant: e.target.value || null }))}><option value="">{t('mcp.allTenants')}</option>{draft.tenant && !tenants.some(tenant => tenant.owner_user_id === draft.tenant) && <option value={draft.tenant}>{t('mcp.selectedAccount')}</option>}{tenants.map(tenant => <option key={tenant.owner_user_id} value={tenant.owner_user_id}>{tenant.nombre || tenant.email} · {tenant.email}</option>)}</select></div>
        <button className="button button-primary mcp-filter-submit" type="submit"><Search size={16} aria-hidden="true" />{t('mcp.searchButton')}</button>
      </form>
      {error && <div className="form-error" role="alert"><span>{t(error)}</span><button className="button button-secondary" type="button" onClick={onRetry}>{t('mcp.retry')}</button></div>}
      {loading && <p className="mcp-muted" role="status">{t('mcp.loadingVenues')}</p>}
      {!loading && !error && list?.rows.length === 0 && <div className="inline-empty">{t('mcp.noVenues')}</div>}
      {!loading && list && list.rows.length > 0 && <div className="staff-table-wrap"><table className="staff-table mcp-table"><thead><tr><th>{t('mcp.venueKind')}</th><th>{t('mcp.col.switch')}</th><th>{t('mcp.owners')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{list.rows.map(venue => { const href = `/admin/tenants/${encodeURIComponent(venue.venue_id)}/mcp`; return <tr key={venue.venue_id}><td data-label={t('mcp.venueKind')} className="staff-identity"><Link className="mcp-venue-link" to={href}><Building2 size={16} aria-hidden="true" /> {venue.nombre}</Link></td><td data-label={t('mcp.col.switch')}><span className={`status-badge ${venue.habilitado ? 'status-active' : 'status-inactive'}`}><span className="badge-dot" />{t(venue.habilitado ? 'mcp.switch.on' : 'mcp.switch.off')}</span></td><td data-label={t('mcp.owners')}>{venue.owners}</td><td data-label={t('staff.actions')}><Link className="button button-secondary" to={href}>{t('mcp.openDetail')}</Link></td></tr>; })}</tbody></table></div>}
      {list && list.total > 0 && <nav className="mcp-pagination" aria-label={t('mcp.pagination')}><span>{t('mcp.range').replace('{from}', String(start)).replace('{to}', String(end)).replace('{total}', String(list.total))}</span><div><button className="button button-secondary" type="button" disabled={loading || filters.page <= 1} onClick={() => onFilters({ ...filters, page: filters.page - 1 })} aria-label={t('mcp.previous')}><ChevronLeft size={18} /></button><span>{t('mcp.page').replace('{page}', String(filters.page)).replace('{pages}', String(pages))}</span><button className="button button-secondary" type="button" disabled={loading || filters.page >= pages} onClick={() => onFilters({ ...filters, page: filters.page + 1 })} aria-label={t('mcp.next')}><ChevronRight size={18} /></button></div></nav>}
    </section>
  </div>;
}
