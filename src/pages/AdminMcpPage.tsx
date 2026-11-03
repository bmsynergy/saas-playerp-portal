import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Building2, ChevronDown, Search } from 'lucide-react';
import { useLocale } from '../locales';
import type { McpFilters, McpVenueList } from '../lib/mcp';
import { PrintListPagination } from '../components/PrintListPagination';

export type AdminMcpPageProps = {
  filters: McpFilters; onFilters: (filters: McpFilters) => void;
  list: McpVenueList | undefined; loading: boolean; error: string | null;
  onRetry: () => void;
};

export function McpEffectiveBadge({ efectivo, motivo }: { efectivo: boolean; motivo: string }) {
  const { t } = useLocale();
  return <span className={`status-badge mcp-badge ${efectivo ? 'status-active' : 'status-inactive'}`} data-testid="mcp-effective">
    <span className="badge-dot" />{t(efectivo ? 'mcp.effective.on' : 'mcp.effective.off')} · {t(`mcp.reason.${motivo}`)}
  </span>;
}

export function AdminMcpPage({ filters, onFilters, list, loading, error, onRetry }: AdminMcpPageProps) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(() => ({ search: filters.search, owner_search: filters.owner_search, status: filters.status }));
  const apply = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onFilters({ ...filters, ...draft, page: 1 }); };
  const page = list?.page ?? filters.page;
  const pageSize = list?.page_size ?? filters.page_size;
  const total = list?.total ?? 0;
  const pagination = { page, pageCount: Math.max(1, Math.ceil(total / pageSize)), pageSize, start: (page - 1) * pageSize, end: Math.min(total, page * pageSize), total, setPage: (next: number) => onFilters({ ...filters, page: next }), setPageSize: () => {} };
  return <div className="page-stack staff-page" data-testid="admin-mcp">
    <div className="page-heading"><div><p className="eyebrow">{t('mcp.eyebrow')}</p><h1>{t('mcp.adminTitle')}</h1><p>{t('mcp.adminLead')}</p></div><div className="heading-accent"><Bot size={30} /></div></div>
    <section className="staff-panel" aria-labelledby="mcp-directory-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.directoryEyebrow')}</p><h2 id="mcp-directory-title">{t('mcp.directoryTitle')}</h2></div>{list && <span className="count-pill">{list.total}</span>}</div>
      <form className="mcp-filters" role="search" onSubmit={apply}>
        <label className="field"><span>{t('mcp.searchVenue')}</span><div className="field-control mcp-search"><Search size={17} aria-hidden="true" /><input value={draft.search} onChange={e => setDraft(current => ({ ...current, search: e.target.value }))} placeholder={t('mcp.searchVenuePlaceholder')} /></div></label>
        <label className="field"><span>{t('mcp.searchOwner')}</span><div className="field-control mcp-search"><Search size={17} aria-hidden="true" /><input value={draft.owner_search} onChange={e => setDraft(current => ({ ...current, owner_search: e.target.value }))} placeholder={t('mcp.searchOwnerPlaceholder')} /></div></label>
        <label className="field"><span>{t('mcp.statusFilter')}</span><span className="native-select-wrap"><select value={draft.status} onChange={e => setDraft(current => ({ ...current, status: e.target.value as McpFilters['status'] }))}><option value="all">{t('mcp.filterAll')}</option><option value="active">{t('mcp.filterActive')}</option><option value="inactive">{t('mcp.filterInactive')}</option></select><ChevronDown size={16} aria-hidden="true" /></span></label>
        <button className="button button-primary mcp-filter-submit" type="submit"><Search size={16} aria-hidden="true" />{t('mcp.searchButton')}</button>
      </form>
      {error && <div className="form-error" role="alert"><span>{t(error)}</span><button className="button button-secondary" type="button" onClick={onRetry}>{t('mcp.retry')}</button></div>}
      {loading && <p className="mcp-muted" role="status">{t('mcp.loadingVenues')}</p>}
      {!loading && !error && list?.rows.length === 0 && <div className="inline-empty">{t('mcp.noVenues')}</div>}
      <div data-pagination-list="mcp" />
      {!loading && list && list.rows.length > 0 && <div className="staff-table-wrap"><table className="staff-table mcp-table"><thead><tr><th>{t('mcp.venueKind')}</th><th>{t('mcp.col.switch')}</th><th>{t('mcp.owners')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{list.rows.map(venue => { const href = `/admin/tenants/${encodeURIComponent(venue.venue_id)}/mcp`; return <tr key={venue.venue_id}><td data-label={t('mcp.venueKind')} className="staff-identity"><Link className="mcp-venue-link" to={href}><Building2 size={16} aria-hidden="true" /> {venue.nombre}</Link></td><td data-label={t('mcp.col.switch')}><span className={`status-badge ${venue.habilitado ? 'status-active' : 'status-inactive'}`}><span className="badge-dot" />{t(venue.habilitado ? 'mcp.switch.on' : 'mcp.switch.off')}</span></td><td data-label={t('mcp.owners')}>{venue.owners}</td><td data-label={t('staff.actions')}><Link className="button button-secondary" to={href}>{t('mcp.openDetail')}</Link></td></tr>; })}</tbody></table></div>}
      {list && list.total > 0 && <PrintListPagination pagination={pagination} id="mcp" disabled={loading} fixedSize/>}
    </section>
  </div>;
}
