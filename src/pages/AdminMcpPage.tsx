import type { ReactNode } from 'react';
import { Bot, Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useLocale } from '../locales';
import type { McpFilters, McpTenantOption, McpVenueList } from '../lib/mcp';

export type AdminMcpPageProps = {
  filters: McpFilters; onFilters: (filters: McpFilters) => void;
  list: McpVenueList | undefined; loading: boolean; error: string | null;
  tenants: McpTenantOption[]; tenantSearch: string; onTenantSearch: (search: string) => void;
  selectedId: string | null; onSelect: (id: string | null) => void;
  detail: ReactNode; onRetry: () => void;
};

export function McpEffectiveBadge({ efectivo, motivo }: { efectivo: boolean; motivo: string }) {
  const { t } = useLocale();
  return <span className={`status-badge mcp-badge ${efectivo ? 'status-active' : 'status-inactive'}`} data-testid="mcp-effective">
    <span className="badge-dot" />{t(efectivo ? 'mcp.effective.on' : 'mcp.effective.off')} · {t(`mcp.reason.${motivo}`)}
  </span>;
}

export function AdminMcpPage({ filters, onFilters, list, loading, error, tenants, tenantSearch, onTenantSearch, selectedId, onSelect, detail, onRetry }: AdminMcpPageProps) {
  const { t } = useLocale();
  const pages = Math.max(1, Math.ceil((list?.total ?? 0) / filters.page_size));
  const set = (patch: Partial<McpFilters>) => onFilters({ ...filters, ...patch, page: patch.page ?? 1 });
  const start = list && list.total ? (list.page - 1) * list.page_size + 1 : 0;
  const end = list ? Math.min(list.total, list.page * list.page_size) : 0;
  return <div className="page-stack staff-page" data-testid="admin-mcp">
    <div className="page-heading"><div><p className="eyebrow">{t('mcp.eyebrow')}</p><h1>{t('mcp.adminTitle')}</h1><p>{t('mcp.adminLead')}</p></div><div className="heading-accent"><Bot size={30} /></div></div>
    <section className="staff-panel" aria-labelledby="mcp-directory-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.directoryEyebrow')}</p><h2 id="mcp-directory-title">{t('mcp.directoryTitle')}</h2></div>{list && <span className="count-pill">{list.total}</span>}</div>
      <div className="mcp-filters">
        <label className="field"><span>{t('mcp.searchVenue')}</span><div className="field-control mcp-search"><Search size={17} aria-hidden="true" /><input value={filters.search} onChange={e => set({ search: e.target.value })} placeholder={t('mcp.searchVenuePlaceholder')} /></div></label>
        <label className="field"><span>{t('mcp.statusFilter')}</span><div className="field-control"><select value={filters.status} onChange={e => set({ status: e.target.value as McpFilters['status'] })}><option value="all">{t('mcp.filterAll')}</option><option value="active">{t('mcp.filterActive')}</option><option value="inactive">{t('mcp.filterInactive')}</option></select></div></label>
        <div className="mcp-tenant-filter"><label className="field" htmlFor="mcp-tenant-search"><span>{t('mcp.tenantFilter')}</span><div className="field-control"><input id="mcp-tenant-search" value={tenantSearch} onChange={e => onTenantSearch(e.target.value)} placeholder={t('mcp.searchTenant')} /></div></label><label className="mcp-sr-only" htmlFor="mcp-tenant-select">{t('mcp.tenantFilter')}</label><select id="mcp-tenant-select" value={filters.tenant ?? ''} onChange={e => set({ tenant: e.target.value || null })}><option value="">{t('mcp.allTenants')}</option>{filters.tenant && !tenants.some(tenant => tenant.owner_user_id === filters.tenant) && <option value={filters.tenant}>{t('mcp.selectedAccount')}</option>}{tenants.map(tenant => <option key={tenant.owner_user_id} value={tenant.owner_user_id}>{tenant.nombre || tenant.email} · {tenant.email}</option>)}</select></div>
      </div>
      {error && <div className="form-error" role="alert"><span>{t(error)}</span><button className="button button-secondary" type="button" onClick={onRetry}>{t('mcp.retry')}</button></div>}
      {loading && <p className="mcp-muted" role="status">{t('mcp.loadingVenues')}</p>}
      {!loading && !error && list?.rows.length === 0 && <div className="inline-empty">{t('mcp.noVenues')}</div>}
      {!loading && list && list.rows.length > 0 && <div className="staff-table-wrap"><table className="staff-table mcp-table"><thead><tr><th>{t('mcp.venueKind')}</th><th>{t('mcp.col.switch')}</th><th>{t('mcp.owners')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{list.rows.map(venue => <tr key={venue.venue_id} className={selectedId === venue.venue_id ? 'mcp-selected-row' : ''}><td data-label={t('mcp.venueKind')} className="staff-identity"><strong><Building2 size={16} aria-hidden="true" /> {venue.nombre}</strong></td><td data-label={t('mcp.col.switch')}><span className={`status-badge ${venue.habilitado ? 'status-active' : 'status-inactive'}`}><span className="badge-dot" />{t(venue.habilitado ? 'mcp.switch.on' : 'mcp.switch.off')}</span></td><td data-label={t('mcp.owners')}>{venue.owners}</td><td data-label={t('staff.actions')}><button type="button" className="button button-secondary" aria-pressed={selectedId === venue.venue_id} onClick={() => onSelect(selectedId === venue.venue_id ? null : venue.venue_id)}>{t(selectedId === venue.venue_id ? 'mcp.closeDetail' : 'mcp.openDetail')}</button></td></tr>)}</tbody></table></div>}
      {list && list.total > 0 && <nav className="mcp-pagination" aria-label={t('mcp.pagination')}><span>{t('mcp.range').replace('{from}', String(start)).replace('{to}', String(end)).replace('{total}', String(list.total))}</span><div><button className="button button-secondary" type="button" disabled={loading || filters.page <= 1} onClick={() => set({ page: filters.page - 1 })} aria-label={t('mcp.previous')}><ChevronLeft size={18} /></button><span>{t('mcp.page').replace('{page}', String(filters.page)).replace('{pages}', String(pages))}</span><button className="button button-secondary" type="button" disabled={loading || filters.page >= pages} onClick={() => set({ page: filters.page + 1 })} aria-label={t('mcp.next')}><ChevronRight size={18} /></button></div></nav>}
    </section>
    {selectedId && <section className="staff-panel" aria-labelledby="mcp-detail-title"><div className="section-heading"><div><p className="eyebrow">{t('mcp.detailEyebrow')}</p><h2 id="mcp-detail-title">{t('mcp.detailTitle')}</h2></div><button type="button" className="button button-secondary" onClick={() => onSelect(null)}>{t('mcp.closeDetail')}</button></div>{detail || <p role="status" className="mcp-muted">{t('mcp.loadingDetail')}</p>}</section>}
  </div>;
}
