import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Search, Server, X } from 'lucide-react';
import type { PsVenueOverview } from '../lib/psVenueOverview';
import { adminSheetHref } from '../lib/psVenueDevices';
import { useLocale } from '../locales';
import { ClearFiltersButton } from '../components/ClearFiltersButton';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { PrintServersTabs } from './PrintFirmwaresPage';
import { PsLinkStateBadge } from '../components/PsLinkStateBadge';
import { reportedOr } from '../lib/psLink';

export type PsListFilter = { query: string; venue: string; connection: string };
export const EMPTY_PS_LIST_FILTER: PsListFilter = { query: '', venue: '', connection: '' };
export const UNASSIGNED = '__unassigned__';
export const ASSIGNED = '__assigned__';

type Venue = PsVenueOverview['venues'][number];
type ServerRow = Venue['print_servers'][number];
type Card = { kind: 'venue'; venue: Venue; servers: ServerRow[] } | { kind: 'unassigned' };
const matches = (query: string, values: (string | null | undefined)[]) => !query || values.some(value => value?.toLocaleLowerCase().includes(query));

export function filterPsVenueCards(overview: PsVenueOverview, filter: PsListFilter): Card[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const venues: Card[] = filter.venue === UNASSIGNED ? [] : overview.venues.flatMap(venue => {
    if (filter.venue && filter.venue !== ASSIGNED && filter.venue !== venue.venue_id) return [];
    const servers = venue.print_servers.filter(server =>
      (!filter.connection || server.state === filter.connection) &&
      (matches(query, [venue.venue_name, venue.venue_slug, venue.location_short]) || matches(query, [server.hostname, server.serial, server.label, server.firmware_version, server.link?.display_name, server.link?.reported.hostname])));
    return servers.length ? [{ kind: 'venue' as const, venue, servers }] : [];
  });
  if (filter.venue && filter.venue !== UNASSIGNED || filter.connection) return venues;
  const inStockMatches = overview.unassigned.devices.some(device => matches(query, [device.serial, device.hostname, device.label, device.model, device.last_venue_name, device.pending_venue_name]));
  return inStockMatches || !query ? [...venues, { kind: 'unassigned' }] : venues;
}

export function PrintServersListPage({ overview }: { overview: PsVenueOverview }) {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState<PsListFilter>(EMPTY_PS_LIST_FILTER);
  const cards = useMemo(() => filterPsVenueCards(overview, filter), [overview, filter]);
  const pagination = usePrintListPagination(cards.length);
  const visible = cards.slice(pagination.start, pagination.end);
  const number = useMemo(() => new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US'), [locale]);
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string) => Number.isFinite(Date.parse(v)) ? f.format(new Date(v)) : t('psLink.pending'); }, [locale, t]);
  const set = <K extends keyof PsListFilter>(key: K, value: PsListFilter[K]) => { setFilter(current => ({ ...current, [key]: value })); pagination.reset(); };
  const changed = Object.values(filter).some(Boolean);

  return <div className="page-stack staff-page" data-testid="ps-list-page">
    <div className="page-heading"><div><p className="eyebrow">{t('psm.listEyebrow')}</p><h1>{t('psm.listTitle')}</h1><p>{t('psm.listLead')}</p></div><div className="heading-accent" aria-hidden="true"><Server size={30}/></div></div>
    <PrintServersTabs/>
    <section className="staff-panel" aria-labelledby="ps-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ps.fleetEyebrow')}</p><h2 id="ps-list-title">{t('psm.listTitle')}</h2></div><span className="count-pill">{number.format(overview.summary.print_servers)}</span></div>
      <div className="directory-toolbar ps-toolbar"><label className="search-field"><span className="sr-only">{t('psm.search')}</span><Search size={19}/><input type="search" data-testid="ps-list-search" value={filter.query} onChange={event => set('query', event.target.value)} placeholder={t('psm.search')}/>{filter.query && <button type="button" aria-label={t('clearSearch')} onClick={() => set('query', '')}><X size={17}/></button>}</label><span className="directory-count" data-testid="ps-list-count">{number.format(cards.length)} / {number.format(overview.venues.length + 1)} {t('psm.venueCards')}</span></div>
      <div className="staff-actions ps-filters"><select data-testid="ps-list-venue" aria-label={t('psm.col.venue')} value={filter.venue} onChange={event => set('venue', event.target.value)}><option value="">{t('psm.allVenues')}</option><option value={ASSIGNED}>{t('psm.assigned')}</option><option value={UNASSIGNED}>{t('psm.unassignedStock')}</option>{overview.venues.map(venue => <option key={venue.venue_id} value={venue.venue_id}>{venue.venue_name}</option>)}</select><select data-testid="ps-list-connection" aria-label={t('psm.col.connection')} value={filter.connection} onChange={event => set('connection', event.target.value)}><option value="">{t('psm.anyConnection')}</option>{(['online', 'offline', 'unknown', 'pending'] as const).map(state => <option key={state} value={state}>{t(`psm.state.${state}`)}</option>)}</select><ClearFiltersButton testId="ps-list-clear" disabled={!changed} onClick={() => { setFilter(EMPTY_PS_LIST_FILTER); pagination.reset(); }}/></div>
      {cards.length === 0 ? <div className="staff-empty" data-testid="ps-list-empty"><Server size={27}/><strong>{t(changed || overview.summary.print_servers || overview.unassigned.count ? 'psm.noMatches' : 'psm.empty')}</strong></div> : <div className="ps-venue-grid">{visible.map(card => card.kind === 'venue' ? <details className="ps-venue-card" key={card.venue.venue_id} data-testid={`ps-venue-${card.venue.venue_id}`}><summary><span className="ps-venue-heading"><strong>{card.venue.venue_name}</strong><small>{card.venue.location_short || card.venue.venue_slug}</small></span><span className="ps-venue-count">{t('psm.serverCount').replace('{count}', number.format(card.venue.print_server_count))}</span><ChevronDown className="ps-venue-chevron" size={19} aria-hidden="true"/><div className="ps-venue-state-summary" aria-label={t('psm.stateSummary')}>{(['online', 'offline', 'unknown', 'pending'] as const).map(state => <span key={state} className={`ps-venue-state ps-venue-state-${state}`}>{t(`psm.state.${state}`)} <strong>{number.format(card.venue.states[state])}</strong></span>)}{card.venue.states.attention > 0 && <span className="ps-venue-attention">{t('psm.attention').replace('{count}', number.format(card.venue.states.attention))}</span>}</div></summary><div className="ps-venue-details"><div className="staff-table-wrap"><table className="staff-table ps-fleet-table"><thead><tr><th>{t('psm.col.device')}</th><th>{t('psm.col.serial')}</th><th>{t('psm.col.firmware')}</th><th>{t('psm.col.connection')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{card.servers.map(server => { const l = server.link; return <tr key={server.id} data-testid={`ps-list-row-${server.id}`} data-link-state={l?.state}><td data-label={t('psm.col.device')} className="staff-identity">{l ? <><strong>{l.display_name}</strong><small>{l.model_label ?? l.model} · {t('ps.hostname')}: {reportedOr(l.reported.hostname, t('psLink.pending'))}</small></> : <><strong>{server.hostname || server.label || t('notProvided')}</strong>{server.label && server.label !== server.hostname && <small>{server.label}</small>}</>}</td><td data-label={t('psm.col.serial')}><span className="ps-mono">{l?.serial || server.serial || t('notProvided')}</span></td><td data-label={t('psm.col.firmware')}>{l ? reportedOr(l.reported.firmware_version, t('psLink.pending')) : server.firmware_version || t('notProvided')}</td><td data-label={t('psm.col.connection')}>{l && <PsLinkStateBadge state={l.state}/>}<span className={`server-status ${server.state === 'online' ? 'server-online' : server.state === 'offline' ? 'server-offline' : server.state === 'pending' ? 'server-pending' : 'server-noSignal'}`}><span className="badge-dot"/>{t(`psm.state.${server.state}`)}</span>{l && <small className="ps-sub">{t('psLink.lastSeen')}: {l.reported.last_seen_at ? date(l.reported.last_seen_at) : t('psLink.pending')}</small>}{server.attention && <small className="ps-venue-attention">{t('psm.needsAttention')}</small>}</td><td data-label={t('staff.actions')}><Link className="staff-action-link" data-testid={`ps-list-open-${server.id}`} to={adminSheetHref(l?.device_id ?? server.id)}>{t('psm.openSheet')}<span className="sr-only"> {l?.display_name || server.hostname || server.serial}</span><ArrowRight size={14}/></Link></td></tr>; })}</tbody></table></div></div></details> : <article className="ps-venue-card ps-unassigned-card" key="unassigned" data-testid="ps-unassigned-card"><div className="ps-unassigned-heading"><div className="ps-venue-heading"><strong>{t('psm.unassignedStock')}</strong><small>{t('psm.unassignedLead')}</small></div><span className="ps-venue-count">{number.format(overview.unassigned.count)}</span></div><div className="ps-venue-state-summary"><span className="ps-venue-state">{t('psm.inStock')} <strong>{number.format(overview.unassigned.in_stock)}</strong></span><span className="ps-venue-state">{t('psm.retired')} <strong>{number.format(overview.unassigned.retired)}</strong></span></div>{overview.unassigned.count === 0 && <p className="ps-unassigned-note">{t('psm.unassignedEmpty')}</p>}{overview.unassigned.devices.some(device => device.pending_venue_name) && <p className="ps-unassigned-note">{t('psm.pendingOverlapNote')}</p>}<Link className="staff-action-link" to="/admin/print-servers/inventory" data-testid="ps-unassigned-inventory">{t('psm.openInventory')}<ArrowRight size={14}/></Link></article>)}</div>}
      <PrintListPagination pagination={pagination} id="ps-list"/>
    </section>
  </div>;
}
