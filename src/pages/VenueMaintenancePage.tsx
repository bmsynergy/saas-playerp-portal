import { RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';
import type { MaintenanceRunFilters, MaintenanceVenueRuns } from '../lib/maintenance';
import { PrintListPagination } from '../components/PrintListPagination';
import { MaintenanceNights } from './MaintenanceNights';
import '../maintenance.css';

type Props = {
  data: MaintenanceVenueRuns;
  filters: MaintenanceRunFilters;
  onFiltersChange: (patch: Partial<MaintenanceRunFilters>) => void;
  onPageChange: (page: number) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function VenueMaintenancePage({ data, filters, onFiltersChange, onPageChange, loading, error, onRefresh }: Props) {
  const { locale, t } = useLocale();
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const formatDate = (value: string | null) => {
    if (!value) return t('maintenance.unavailable');
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  };
  const pagination = { page: data.page, pageCount: data.pages, pageSize: data.page_size, start: (data.page - 1) * data.page_size, end: Math.min(data.page * data.page_size, data.total), total: data.total, setPage: onPageChange, setPageSize: () => {} };
  return <section className="maintenance-panel maintenance-venue-detail" aria-labelledby="venue-maintenance-title" data-testid="venue-maintenance-page">
    <div className="maintenance-section-head"><div><p className="eyebrow">{t('maintenance.historyEyebrow')}</p><h2 id="venue-maintenance-title">{t('maintenance.venueTab')}</h2><p>{t('maintenance.historyLead')}</p></div><button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true"/>{t('maintenance.refresh')}</button></div>
    <p className="maintenance-venue-context">{t('maintenance.lastSuccess')}: {formatDate(data.venue.last_success_date)} · {data.venue.timezone}</p>
    <div className="maintenance-filters maintenance-run-filters">
      <label><span>{t('maintenance.from')}</span><input type="date" value={filters.from || data.from} max={filters.to || data.to} onChange={event => onFiltersChange({ from: event.target.value, page: 1 })}/></label>
      <label><span>{t('maintenance.to')}</span><input type="date" value={filters.to || data.to} min={filters.from || data.from} onChange={event => onFiltersChange({ to: event.target.value, page: 1 })}/></label>
      <label><span>{t('maintenance.statusFilter')}</span><select value={filters.status} onChange={event => onFiltersChange({ status: event.target.value, page: 1 })}><option value="">{t('maintenance.allStatuses')}</option>{['success','error','missing','running','problem'].map(status => <option key={status} value={status}>{t(`maintenance.status.${status}`)}</option>)}</select></label>
      <label><span>{t('maintenance.taskFilter')}</span><select value={filters.task} onChange={event => onFiltersChange({ task: event.target.value, page: 1 })}><option value="">{t('maintenance.allTasks')}</option>{data.task_keys.map(task => <option key={task} value={task}>{task}</option>)}</select></label>
      <label><span>{t('maintenance.order')}</span><select value={filters.order} onChange={event => onFiltersChange({ order: event.target.value as MaintenanceRunFilters['order'], page: 1 })}><option value="desc">{t('maintenance.newestFirst')}</option><option value="asc">{t('maintenance.oldestFirst')}</option></select></label>
    </div>
    {data.range_clamped && <p className="maintenance-muted maintenance-range-note" role="status">{t('maintenance.rangeClamped')}</p>}
    {error && <div className="maintenance-inline-error" role="alert"><span>{error}</span><button className="button button-secondary" type="button" onClick={onRefresh}>{t('maintenance.retry')}</button></div>}
    <PrintListPagination pagination={pagination} id="venue-maintenance" disabled={loading} fixedSize/>
    {loading && <p className="maintenance-muted" role="status">{t('maintenance.loadingHistory')}</p>}
    <div aria-busy={loading}>{!loading && !error && <MaintenanceNights nights={data.nights} venueId={data.venue.venue_id}/>}</div>
  </section>;
}
