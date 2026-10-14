import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FilterX, Search, Server, X } from 'lucide-react';
import type { Inventory, InventoryItem } from '../lib/printInventory';
import { adminSheetHref } from '../lib/psVenueDevices';
import { useLocale } from '../locales';
import { PrintServersTabs } from './PrintFirmwaresPage';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { fleetStateClass } from './PrintFleetPage';

// PE-443: global list, one row per Print Server (unassigned inventory devices included).
// Filtering and pagination are client-side over portal_ps_inventory.
export type PsListFilter = { query: string; venue: string; connection: string };
export const EMPTY_PS_LIST_FILTER: PsListFilter = { query: '', venue: '', connection: '' };
export const UNASSIGNED = '__unassigned__';
export const ASSIGNED = '__assigned__';

export function filterPsList(items: InventoryItem[], filter: PsListFilter): InventoryItem[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return items.filter(item => {
    if (filter.venue === UNASSIGNED ? item.assignment !== 'unassigned' : filter.venue === ASSIGNED ? item.assignment !== 'assigned' : filter.venue && item.venue_id !== filter.venue) return false;
    if (filter.connection && item.connection !== filter.connection) return false;
    return !query || [item.serial, item.label, item.hostname, item.device_id, item.venue_name, item.last_venue_name].some(value => value?.toLocaleLowerCase().includes(query));
  });
}

const stateOf = (item: InventoryItem): keyof typeof fleetStateClass => item.connection === 'online' ? 'online' : item.connection === 'offline' ? 'offline' : item.connection === 'unassigned' ? 'pending' : 'none';

export function PrintServersListPage({ inventory }: { inventory: Inventory }) {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState<PsListFilter>(EMPTY_PS_LIST_FILTER);
  const filtered = useMemo(() => filterPsList(inventory.items, filter), [inventory.items, filter]);
  const pagination = usePrintListPagination(filtered.length);
  const visible = filtered.slice(pagination.start, pagination.end);
  const venues = useMemo(() => [...new Map(inventory.items.filter(item => item.venue_id).map(item => [item.venue_id!, item.venue_name || item.venue_id!])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [inventory.items]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const set = <K extends keyof PsListFilter>(key: K, value: PsListFilter[K]) => { setFilter(current => ({ ...current, [key]: value })); pagination.reset(); };
  const changed = Object.values(filter).some(Boolean);

  return <div className="page-stack staff-page" data-testid="ps-list-page">
    <div className="page-heading"><div><p className="eyebrow">{t('psm.listEyebrow')}</p><h1>{t('psm.listTitle')}</h1><p>{t('psm.listLead')}</p></div><div className="heading-accent" aria-hidden="true"><Server size={30}/></div></div>
    <PrintServersTabs/>
    <section className="staff-panel" aria-labelledby="ps-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ps.fleetEyebrow')}</p><h2 id="ps-list-title">{t('psm.listTitle')}</h2></div><span className="count-pill">{inventory.items.length}</span></div>
      <div className="directory-toolbar ps-toolbar">
        <label className="search-field"><span className="sr-only">{t('psm.search')}</span><Search size={19}/><input type="search" data-testid="ps-list-search" value={filter.query} onChange={event => set('query', event.target.value)} placeholder={t('psm.search')}/>{filter.query && <button type="button" aria-label={t('clearSearch')} onClick={() => set('query', '')}><X size={17}/></button>}</label>
        <span className="directory-count" data-testid="ps-list-count">{filtered.length} / {inventory.items.length}</span>
      </div>
      <div className="staff-actions ps-filters">
        <select data-testid="ps-list-venue" aria-label={t('psm.col.venue')} value={filter.venue} onChange={event => set('venue', event.target.value)}>
          <option value="">{t('psm.allVenues')}</option><option value={ASSIGNED}>{t('psm.assigned')}</option><option value={UNASSIGNED}>{t('psm.unassigned')}</option>
          {venues.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select data-testid="ps-list-connection" aria-label={t('psm.col.connection')} value={filter.connection} onChange={event => set('connection', event.target.value)}>
          <option value="">{t('psm.anyConnection')}</option>{(['online', 'offline', 'unknown', 'unassigned'] as const).map(value => <option key={value} value={value}>{t(`dash.${value}`)}</option>)}
        </select>
        <button type="button" className="staff-action-link" data-testid="ps-list-clear" disabled={!changed} onClick={() => { setFilter(EMPTY_PS_LIST_FILTER); pagination.reset(); }}><FilterX size={14}/>{t('ps.filter.clear')}</button>
      </div>
      {filtered.length === 0 ? <div className="staff-empty" data-testid="ps-list-empty"><Server size={27}/><strong>{t(inventory.items.length ? 'psm.noMatches' : 'psm.empty')}</strong></div> : <div className="staff-table-wrap"><table className="staff-table ps-fleet-table"><thead><tr><th>{t('psm.col.serial')}</th><th>{t('psm.col.device')}</th><th>{t('psm.col.venue')}</th><th>{t('psm.col.connection')}</th><th>{t('psm.col.firmware')}</th><th>{t('lastSignal')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{visible.map(item => {
        const state = stateOf(item); const name = item.label || item.hostname || item.serial || item.device_id || item.id;
        return <tr key={item.id} data-testid={`ps-list-row-${item.id}`} data-state={state}>
          <td data-label={t('psm.col.serial')}><span className="ps-mono">{item.serial || t('notProvided')}</span></td>
          <td data-label={t('psm.col.device')} className="staff-identity"><strong>{name}</strong>{item.hostname && item.hostname !== name && <small>{item.hostname}</small>}</td>
          <td data-label={t('psm.col.venue')}>{item.assignment === 'assigned' && item.venue_id ? <Link className="text-link" to={`/admin/tenants/${encodeURIComponent(item.venue_id)}/print-servers`}>{item.venue_name || item.venue_id}</Link> : <span className="staff-self-note">{t('psm.unassigned')}{item.last_venue_name ? ` · ${item.last_venue_name}` : ''}</span>}</td>
          <td data-label={t('psm.col.connection')}><span className={`server-status ${fleetStateClass[state]}`}><span className="badge-dot"/>{t(`dash.${item.connection}`)}</span></td>
          <td data-label={t('psm.col.firmware')}><span className="version-text">{item.firmware_known && item.firmware_version ? item.firmware_version : t('notProvided')}</span></td>
          <td data-label={t('lastSignal')}>{item.last_seen_at ? <time dateTime={item.last_seen_at}>{dateFormatter.format(new Date(item.last_seen_at))}</time> : <span className="staff-self-note">{t('ps.never')}</span>}</td>
          <td data-label={t('staff.actions')}><Link className="staff-action-link" data-testid={`ps-list-open-${item.id}`} to={adminSheetHref(item.id)}>{t('psm.openSheet')}<span className="sr-only"> {name}</span><ArrowRight size={14}/></Link></td>
        </tr>;
      })}</tbody></table></div>}
      <PrintListPagination pagination={pagination} id="ps-list"/>
    </section>
  </div>;
}
