import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Clock3, FilterX, RefreshCw, Search, Server, X } from 'lucide-react';
import { ASSIGNED_VENUE, EMPTY_INVENTORY_FILTER, UNKNOWN_VERSION, UNASSIGNED_VENUE, filterInventory, inventoryVersions, summarizeInventory, type Inventory, type InventoryFilter, type InventoryItem } from '../lib/printInventory';
import { useLocale } from '../locales';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import '../print-dashboard.css';
import { PrintServersTabs } from './PrintFirmwaresPage';

type Props = { inventory: Inventory; refreshing: boolean; stale: boolean; onRefresh: () => void };
type Metric = { key: string; state: string; count: number; tone: string };

export function PrintDashboardPage({ inventory, refreshing, stale, onRefresh }: Props) {
  const { locale, t } = useLocale();
  const [filter, setFilter] = useState<InventoryFilter>(EMPTY_INVENTORY_FILTER);
  const listRef = useRef<HTMLElement>(null);
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US'), [locale]);
  const filtered = useMemo(() => filterInventory(inventory.items, filter), [inventory.items, filter]);
  const pagination = usePrintListPagination(filtered.length);
  const visible = filtered.slice(pagination.start, pagination.end);
  const summary = useMemo(() => summarizeInventory(filtered), [filtered]);
  const versions = useMemo(() => inventoryVersions(inventory.items), [inventory.items]);
  const changed = Object.values(filter).some(Boolean);
  const metrics: Metric[] = [
    { key: 'total', state: '', count: summary.total, tone: 'neutral' },
    { key: 'online', state: 'online', count: summary.online, tone: 'success' },
    { key: 'offline', state: 'offline', count: summary.offline, tone: 'danger' },
    { key: 'unknown', state: 'unknown', count: summary.unknown, tone: 'warning' },
    { key: 'errors', state: 'errors', count: summary.with_errors, tone: 'danger' },
    { key: 'unassigned', state: 'unassigned', count: summary.unassigned, tone: 'warning' },
  ];
  const set = <K extends keyof InventoryFilter>(key: K, value: InventoryFilter[K]) => { setFilter(current => ({ ...current, [key]: value })); pagination.reset(); };
  const focusList = (state: string | null) => {
    if (state !== null) set('state', state);
    window.requestAnimationFrame(() => {
      listTitleRef.current?.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      listRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };
  const formatDate = (value: string | null | undefined) => {
    if (!value) return t('ps.never');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t('ps.never') : dateFormatter.format(date);
  };

  return <div className="page-stack print-dashboard" data-testid="dashboard-page">
    <header className="page-heading print-dashboard-heading">
      <div><p className="eyebrow">{t('dash.eyebrow')}</p><h1>{t('dash.title')}</h1><p>{t('dash.lead')}</p></div>
      <div className="print-dashboard-heading-actions">
        <Link className="button button-secondary" to="/admin/print-servers/list" data-testid="dashboard-open-list">{t('dash.fullList')}<ArrowRight size={16}/></Link>
        <button className="button button-secondary" type="button" onClick={onRefresh} disabled={refreshing} data-testid="dashboard-refresh"><RefreshCw size={16} className={refreshing ? 'print-dashboard-spinning' : ''}/>{refreshing ? t('dash.refreshing') : t('dash.refresh')}</button>
      </div>
    </header>
    <PrintServersTabs/>

    <div className="print-dashboard-meta" aria-live="polite"><Clock3 size={15}/><span>{t('dash.updated')} <time dateTime={inventory.generated_at}>{formatDate(inventory.generated_at)}</time></span><span className="print-dashboard-meta-separator" aria-hidden="true">·</span><span>{t('dash.window').replace('{n}', String(Math.round(inventory.online_window_seconds / 60)))}</span></div>
    {stale && <div className="print-dashboard-alert" role="status" data-testid="dashboard-stale"><AlertCircle size={17}/><span>{t('dash.stale')}</span><button type="button" onClick={onRefresh} disabled={refreshing}>{t('retry')}</button></div>}

    <section className="print-dashboard-filter-panel" aria-label={t('dash.filters')}>
      <div className="print-dashboard-filter-heading"><strong>{t('dash.filters')}</strong><span data-testid="dashboard-filter-count">{t('ps.count').replace('{n}', numberFormatter.format(filtered.length)).replace('{m}', numberFormatter.format(inventory.items.length))}</span></div>
      <div className="print-dashboard-filters">
        <label className="print-dashboard-search"><span className="sr-only">{t('dash.search')}</span><Search size={17}/><input type="search" value={filter.query} onChange={event => set('query', event.target.value)} placeholder={t('dash.searchPlaceholder')} data-testid="inventory-filter-search"/>{filter.query && <button type="button" aria-label={t('clearSearch')} onClick={() => set('query', '')}><X size={15}/></button>}</label>
        <label><span>{t('dash.filter.assignment')}</span><select value={filter.venue} onChange={event => set('venue', event.target.value)} data-testid="inventory-filter-venue"><option value="">{t('dash.filter.allVenues')}</option><option value={ASSIGNED_VENUE}>{t('dash.filter.assigned')}</option><option value={UNASSIGNED_VENUE}>{t('dash.filter.unassigned')}</option></select></label>
        <label><span>{t('dash.state')}</span><select value={filter.state} onChange={event => set('state', event.target.value)} data-testid="inventory-filter-state"><option value="">{t('ps.filter.anyState')}</option>{['online', 'offline', 'unknown', 'unassigned', 'errors', 'warnings'].map(state => <option key={state} value={state}>{t(`dash.${state}`)}</option>)}</select></label>
        <label><span>{t('dash.version')}</span><select value={filter.version} onChange={event => set('version', event.target.value)} data-testid="inventory-filter-version"><option value="">{t('ps.filter.allVersions')}</option>{versions.map(version => <option key={version ?? UNKNOWN_VERSION} value={version ?? UNKNOWN_VERSION}>{version ?? t('dash.unknownVersion')}</option>)}</select></label>
        <button className="print-dashboard-clear" type="button" disabled={!changed} onClick={() => { setFilter(EMPTY_INVENTORY_FILTER); pagination.reset(); }} data-testid="dashboard-filter-clear"><FilterX size={15}/>{t('ps.filter.clear')}</button>
      </div>
    </section>

    <section className="print-dashboard-metrics" aria-label={t('dash.metrics')} data-testid="dashboard-metrics">
      {metrics.map(metric => <button type="button" key={metric.key} className={`print-dashboard-metric print-dashboard-${metric.tone}`} onClick={() => focusList(metric.key === 'total' ? null : metric.state)} data-testid={`dashboard-metric-${metric.key}`} aria-label={`${t(`dash.${metric.key}`)}: ${metric.count}`}>
        <span className="print-dashboard-metric-label">{t(`dash.${metric.key}`)}</span><strong>{numberFormatter.format(metric.count)}</strong><span className="print-dashboard-metric-action">{t('dash.viewInList')} <ArrowRight size={14}/></span>
      </button>)}
    </section>
    <div className="print-dashboard-summary-dates"><span>{t('dash.latestContact')}: <strong>{formatDate(summary.last_seen_at)}</strong></span><span>{t('dash.latestNotice')}: <strong>{formatDate(summary.last_issue_at)}</strong></span><span>{t('dash.unassignedHint')}</span></div>

    <section className="print-dashboard-firmware" aria-labelledby="dashboard-firmware-title" data-testid="dashboard-firmware">
      <div className="print-dashboard-section-title"><div><p className="eyebrow">{t('dash.distribution')}</p><h2 id="dashboard-firmware-title">{t('dash.firmware')}</h2><p>{t('dash.denominator').replace('{n}', numberFormatter.format(summary.total))}</p></div></div>
      {summary.total === 0 ? <div className="print-dashboard-empty-small">{t('dash.noDistribution')}</div> : <div className="print-dashboard-firmware-list">{summary.firmware.map(entry => <div className="print-dashboard-firmware-row" key={entry.version ?? UNKNOWN_VERSION} data-testid={`dashboard-firmware-${entry.version ?? UNKNOWN_VERSION}`}>
        <div><strong>{entry.version ?? t('dash.unknownVersion')}</strong><span>{numberFormatter.format(entry.count)} / {numberFormatter.format(summary.total)} · {new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', { maximumFractionDigits: 1 }).format(entry.pct)}%</span></div>
        <div className="print-dashboard-track" role="img" aria-label={`${entry.version ?? t('dash.unknownVersion')}: ${entry.pct}%`}><span style={{ width: `${Math.max(0, Math.min(100, entry.pct))}%` }}/></div>
      </div>)}</div>}
    </section>

    <section className="print-dashboard-inventory" aria-labelledby="dashboard-list-title" ref={listRef} data-testid="dashboard-inventory">
      <div className="print-dashboard-section-title print-dashboard-list-heading"><div><p className="eyebrow">{t('dash.inventoryEyebrow')}</p><h2 id="dashboard-list-title" ref={listTitleRef} tabIndex={-1}>{t('dash.inventory')}</h2><p>{t('dash.sameFilter')}</p></div><span className="count-pill">{numberFormatter.format(filtered.length)}</span></div>
      {filtered.length === 0 ? <div className="print-dashboard-empty" data-testid="dashboard-empty"><Server size={27}/><strong>{inventory.items.length ? t('dash.noMatches') : t('dash.empty')}</strong><p>{inventory.items.length ? t('dash.noMatchesHint') : t('dash.emptyHint')}</p></div> : <div className="print-dashboard-table-wrap"><table className="print-dashboard-table"><thead><tr><th>{t('dash.device')}</th><th>{t('dash.venue')}</th><th>{t('dash.state')}</th><th>{t('dash.version')}</th><th>{t('dash.lastContact')}</th><th>{t('dash.notices')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{visible.map(item => <InventoryRow key={item.id} item={item} t={t} formatDate={formatDate}/>)}</tbody></table></div>}
      <PrintListPagination pagination={pagination} id="dashboard"/>
    </section>
  </div>;
}

function InventoryRow({ item, t, formatDate }: { item: InventoryItem; t: (key: string) => string; formatDate: (value: string | null | undefined) => string }) {
  const status = item.assignment === 'unassigned' ? 'unassigned' : item.connection;
  const venue = item.assignment === 'unassigned' ? t('dash.unassigned') : item.venue_name || item.venue_id || t('dash.unknownVenue');
  const notice = item.issues.length ? item.issues.map(issue => `${t(issue.level === 'error' ? 'dash.issueError' : issue.level === 'warning' ? 'dash.issueWarning' : 'dash.issueOther')}: ${issue.code} (${issue.count})`).join(' · ') : item.error_count ? t('dash.errorsCount').replace('{n}', String(item.error_count)) : item.warning_count ? t('dash.warningsCount').replace('{n}', String(item.warning_count)) : t('dash.noNotices');
  return <tr data-testid={`inventory-row-${item.id}`} key={item.id}>
    <td data-label={t('dash.device')}><strong>{item.label || item.hostname || item.device_id}</strong><small>{item.device_id}</small></td>
    <td data-label={t('dash.venue')}><strong>{venue}</strong>{item.assignment === 'unassigned' && item.last_venue_name && <small>{t('dash.previousVenue')}: {item.last_venue_name}</small>}</td>
    <td data-label={t('dash.state')}><span className={`print-dashboard-status print-dashboard-status-${status}`}><span aria-hidden="true"/>{t(`dash.${status}`)}</span></td>
    <td data-label={t('dash.version')}>{item.firmware_known && item.firmware_version ? item.firmware_version : t('dash.unknownVersion')}</td>
    <td data-label={t('dash.lastContact')}><time dateTime={item.last_seen_at || undefined}>{formatDate(item.last_seen_at)}</time></td>
    <td data-label={t('dash.notices')}><span className={item.error_count ? 'print-dashboard-issue-error' : ''}>{notice}</span>{item.last_issue_at && <small>{formatDate(item.last_issue_at)}</small>}</td>
    <td data-label={t('staff.actions')}>{item.venue_id && item.assignment === 'assigned' ? <Link to={`/admin/print-servers/${encodeURIComponent(item.venue_id)}`} className="staff-action-link">{t('ps.open')}<span className="sr-only"> {venue}</span><ArrowRight size={14}/></Link> : <span className="print-dashboard-no-detail">{t('dash.noDetail')}</span>}</td>
  </tr>;
}
