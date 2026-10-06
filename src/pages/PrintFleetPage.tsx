import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, FilterX, Printer, Search, Server, X } from 'lucide-react';
import { EMPTY_FLEET_FILTER, FLEET_PRINTERS, FLEET_SIGNALS, FLEET_STATES, NO_VERSION, filterFleet, filterVenueServers, fleetState, fleetVersions, isFiltered, relativeTime, venueServerRows, type FleetFilter, type FleetRow } from '../lib/printFleet';
import { useLocale } from '../locales';
import { PrintServersTabs } from './PrintFirmwaresPage';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';

export const fleetStateClass = { online: 'server-online', offline: 'server-offline', pending: 'server-pending', none: 'server-noSignal' } as const;

type PrintFleetPageProps = { rows: FleetRow[]; venueId?: string; detailHref?: (row: FleetRow) => string | null };

export function PrintFleetPage({ rows, venueId, detailHref }: PrintFleetPageProps) {
  const { locale, t } = useLocale();
  const [filter, setFilter] = useState<FleetFilter>(EMPTY_FLEET_FILTER);
  const [now, setNow] = useState(() => Date.now());
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);

  // Relative times and the "last signal" filter move with the clock, and with every refetch.
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  useEffect(() => setNow(Date.now()), [rows]);

  const isVenue = venueId !== undefined;
  const scopedRows = useMemo(() => isVenue ? venueServerRows(rows, venueId) : rows, [rows, venueId, isVenue]);
  const filtered = useMemo(() => isVenue ? filterVenueServers(rows, venueId, filter, now) : filterFleet(rows, filter, now), [rows, venueId, isVenue, filter, now]);
  const pagination = usePrintListPagination(filtered.length);
  const visible = filtered.slice(pagination.start, pagination.end);
  const versions = useMemo(() => fleetVersions(scopedRows), [scopedRows]);
  const venues = useMemo(() => [...scopedRows].sort((a, b) => a.venue_name.localeCompare(b.venue_name)), [scopedRows]);
  const set = <K extends keyof FleetFilter>(key: K, value: FleetFilter[K]) => { setFilter(current => ({ ...current, [key]: value })); pagination.reset(); };

  useEffect(() => { setFilter(EMPTY_FLEET_FILTER); pagination.reset(); }, [venueId]);

  return <div className="page-stack staff-page" data-testid="fleet-page">
    {!isVenue && <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('ps.title')}</h1><Link className="staff-action-link" to="/admin/print-servers">{locale === 'es' ? 'Ver dashboard' : 'View dashboard'}</Link><p>{t('ps.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Server size={30}/></div></div>}
    {!isVenue && <PrintServersTabs/>}
    <section className="staff-panel" aria-labelledby="fleet-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t(isVenue ? 'ps.venueEyebrow' : 'ps.fleetEyebrow')}</p><h2 id="fleet-list-title">{t(isVenue ? 'ps.venueTitle' : 'ps.fleetTitle')}</h2></div><span className="count-pill">{scopedRows.length}</span></div>
      <div className="directory-toolbar ps-toolbar">
        <label className="search-field"><span className="sr-only">{t(isVenue ? 'ps.venueSearch' : 'ps.filter.search')}</span><Search size={19}/><input type="search" data-testid="fleet-filter-search" value={filter.query} onChange={event => set('query', event.target.value)} placeholder={t(isVenue ? 'ps.venueSearchPlaceholder' : 'ps.filter.searchPlaceholder')}/>{filter.query && <button type="button" aria-label={t('clearSearch')} onClick={() => set('query', '')}><X size={17}/></button>}</label>
        <span className="directory-count" data-testid="fleet-count">{t(isVenue ? 'ps.venueCount' : 'ps.count').replace('{n}', String(filtered.length)).replace('{m}', String(scopedRows.length))}</span>
      </div>
      <div className="staff-actions ps-filters">
        {!isVenue && <select data-testid="fleet-filter-venue" aria-label={t('ps.filter.venue')} value={filter.venue} onChange={event => set('venue', event.target.value)}><option value="">{t('ps.filter.allVenues')}</option>{venues.map(row => <option key={row.venue_id} value={row.venue_id}>{row.venue_name}</option>)}</select>}
        <select data-testid="fleet-filter-version" aria-label={t('ps.filter.version')} value={filter.version} onChange={event => set('version', event.target.value)}><option value="">{t('ps.filter.allVersions')}</option>{versions.map(version => <option key={version} value={version}>{version}</option>)}<option value={NO_VERSION}>{t(isVenue ? 'ps.venueNoVersion' : 'ps.filter.noVersion')}</option></select>
        <select data-testid="fleet-filter-signal" aria-label={t('ps.filter.signal')} value={filter.signal} onChange={event => set('signal', event.target.value as FleetFilter['signal'])}><option value="">{t('ps.filter.anySignal')}</option>{FLEET_SIGNALS.map(item => <option key={item} value={item}>{t(`ps.filter.signal.${item}`)}</option>)}</select>
        <select data-testid="fleet-filter-state" aria-label={t('ps.filter.state')} value={filter.state} onChange={event => set('state', event.target.value as FleetFilter['state'])}><option value="">{t('ps.filter.anyState')}</option>{FLEET_STATES.filter(item => !isVenue || item === 'online' || item === 'offline').map(item => <option key={item} value={item}>{t(`ps.state.${item}`)}</option>)}</select>
        <select data-testid="fleet-filter-printers" aria-label={t('ps.filter.printers')} value={filter.printers} onChange={event => set('printers', event.target.value as FleetFilter['printers'])}><option value="">{t('ps.filter.anyPrinters')}</option>{FLEET_PRINTERS.map(item => <option key={item} value={item}>{t(`ps.filter.printers.${item}`)}</option>)}</select>
        <button type="button" className="staff-action-link" data-testid="fleet-filter-clear" disabled={!isFiltered(filter)} onClick={() => { setFilter(EMPTY_FLEET_FILTER); pagination.reset(); }}><FilterX size={14}/>{t('ps.filter.clear')}</button>
      </div>
      {filtered.length === 0 ? <div className="staff-empty" data-testid="fleet-empty"><Server size={27}/><strong>{t(isVenue ? (scopedRows.length ? 'ps.venueNoMatches' : 'ps.venueEmpty') : (scopedRows.length ? 'ps.noMatches' : 'ps.emptyFleet'))}</strong></div> : <div className="staff-table-wrap"><table className="staff-table ps-fleet-table"><thead><tr><th>{t(isVenue ? 'ps.col.device' : 'ps.col.venue')}</th><th>{t('ps.col.state')}</th><th>{t('version')}</th><th>{t('lastSignal')}</th><th>{t('ps.col.printers')}</th><th>{t('ps.col.queue')}</th>{(!isVenue || detailHref) && <th>{t('staff.actions')}</th>}</tr></thead><tbody>{visible.map(row => {
        const state = fleetState(row); const server = row.print_server;
        const relative = relativeTime(server?.last_seen_at ?? null, now, locale);
        const queueDepth = server?.last_status?.queue_depth ?? null;
        const deviceName = server?.label?.trim() || server?.hostname?.trim() || server?.device_id?.trim() || server?.id;
        const rowDetailHref = isVenue ? detailHref?.(row) : `/admin/print-servers/${encodeURIComponent(row.venue_id)}`;
        return <tr key={isVenue ? server?.id : row.venue_id} data-testid={`fleet-row-${row.venue_id}`} data-state={state}>
          {isVenue ? <td data-label={t('ps.col.device')} className="staff-identity ps-device-identity"><strong>{deviceName}</strong><small>{t('ps.deviceIdentifier').replace('{id}', server?.id ?? '')}</small></td> : <td data-label={t('ps.col.venue')} className="staff-identity"><strong>{row.venue_name}{row.venue_is_active === false && <span className="staff-self ps-inactive">{t('ps.venueInactive')}</span>}</strong><small>{row.venue_slug || t('notProvided')}</small></td>}
          <td data-label={t('ps.col.state')}><span className={`server-status ${fleetStateClass[state]}`}><span className="badge-dot"/>{t(`ps.state.${state}`)}</span>{server && row.pending_enrollment && <small className="ps-sub">{t('ps.replacementPending')}</small>}</td>
          <td data-label={t('version')}><span className="version-text">{server?.software_version || t('notProvided')}</span></td>
          <td data-label={t('lastSignal')}>{relative && server?.last_seen_at ? <span className="ps-signal"><span className="staff-date"><Clock3 size={14}/>{relative}</span><small className="ps-sub"><time dateTime={server.last_seen_at}>{dateFormatter.format(new Date(server.last_seen_at))}</time></small></span> : <span className="staff-self-note">{t('ps.never')}</span>}</td>
          <td data-label={t('ps.col.printers')}><span className="staff-role"><Printer size={15}/>{row.printers_total}</span><small className="ps-sub">{t('ps.printersSummary').replace('{paused}', String(row.printers_paused)).replace('{errors}', String(row.printers_with_error))}</small></td>
          <td data-label={t('ps.col.queue')}><strong>{row.pending_jobs}</strong> {t('ps.pendingJobsShort')}<small className="ps-sub">{t('ps.queueDepth')}: {queueDepth ?? t('notProvided')}</small></td>
          {(!isVenue || detailHref) && <td data-label={t('staff.actions')}>{rowDetailHref && <Link className="staff-action-link" data-testid={`fleet-open-${row.venue_id}`} to={rowDetailHref}>{t('ps.open')}<span className="sr-only"> {isVenue ? deviceName : row.venue_name}</span><ArrowRight size={14}/></Link>}</td>}
        </tr>;
      })}</tbody></table></div>}
      <PrintListPagination pagination={pagination} id="fleet"/>
    </section>
  </div>;
}
