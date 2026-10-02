import { describe, expect, it } from 'vitest';
import { EMPTY_FLEET_FILTER, NO_VERSION, filterVenueServers, venueServerRows, filterFleet, fleetState, fleetVersions, formatUptime, isFiltered, normalizeMac, relativeTime, sameMac, type FleetFilter, type FleetRow, type FleetServer } from '../src/lib/printFleet';

const now = Date.parse('2026-10-01T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000; const HOUR = 60 * MIN;
const server = (over: Partial<FleetServer> = {}): FleetServer => ({ id: 'ps', label: null, status: 'active', device_id: null, hostname: null, software_version: '1.4.0',
  local_address: null, local_port: null, enrolled_at: null, last_seen_at: ago(MIN), last_status_at: null, last_status: null, channel_opened_at: null,
  online: true, ca_cert_available: false, ca_cert_fingerprint: null, ...over });
const row = (id: string, name: string, over: Partial<FleetRow> = {}): FleetRow => ({ venue_id: id, venue_name: name, venue_slug: name.toLowerCase().replace(/\s+/g, '-'), venue_is_active: true,
  print_server: null, pending_enrollment: null, revoked_count: 0, last_revoked_at: null, printers_total: 0, printers_active: 0, printers_paused: 0, printers_with_error: 0, pending_jobs: 0, ...over });
// Five venues: online, offline for hours, offline for days, enrollment pending, nothing.
const rows: FleetRow[] = [
  row('a', 'Arcade Centro', { print_server: server(), printers_total: 2, printers_active: 2 }),
  row('b', 'Bowling Norte', { print_server: server({ software_version: '1.3.2', online: false, last_seen_at: ago(5 * HOUR) }), printers_total: 3, printers_active: 2, printers_paused: 1 }),
  row('c', 'Cine Sur', { print_server: server({ software_version: '1.3.2', online: false, last_seen_at: ago(72 * HOUR) }), printers_total: 1, printers_active: 1, printers_with_error: 1 }),
  row('d', 'Dardos Este', { pending_enrollment: { id: 'e', label: null, expires_at: null, created_at: null } }),
  row('e', 'Escape Oeste', { venue_slug: 'salas-escape' }),
];
const ids = (filter: Partial<FleetFilter>) => filterFleet(rows, { ...EMPTY_FLEET_FILTER, ...filter }, now).map(item => item.venue_id);

describe('fleet filters each reduce the list', () => {
  it('no filter keeps every venue', () => { expect(ids({})).toEqual(['a', 'b', 'c', 'd', 'e']); expect(isFiltered(EMPTY_FLEET_FILTER)).toBe(false); });
  it('free text matches venue name or slug', () => {
    expect(ids({ query: '  NORTE ' })).toEqual(['b']);
    expect(ids({ query: 'salas-esc' })).toEqual(['e']);
    expect(ids({ query: 'nowhere' })).toEqual([]);
  });
  it('venue select keeps only that venue', () => expect(ids({ venue: 'c' })).toEqual(['c']));
  it('version keeps that version, or the venues without version / Print Server', () => {
    expect(fleetVersions(rows)).toEqual(['1.4.0', '1.3.2']);
    expect(ids({ version: '1.3.2' })).toEqual(['b', 'c']);
    expect(ids({ version: '1.4.0' })).toEqual(['a']);
    expect(ids({ version: NO_VERSION })).toEqual(['d', 'e']);
  });
  it('last signal windows', () => {
    expect(ids({ signal: '3m' })).toEqual(['a']);
    expect(ids({ signal: '1h' })).toEqual(['a']);
    expect(ids({ signal: '24h' })).toEqual(['a', 'b']);
    expect(ids({ signal: 'older' })).toEqual(['c']);
    expect(ids({ signal: 'never' })).toEqual(['d', 'e']);
  });
  it('Print Server state', () => {
    expect(rows.map(fleetState)).toEqual(['online', 'offline', 'offline', 'pending', 'none']);
    expect(ids({ state: 'online' })).toEqual(['a']);
    expect(ids({ state: 'offline' })).toEqual(['b', 'c']);
    expect(ids({ state: 'pending' })).toEqual(['d']);
    expect(ids({ state: 'none' })).toEqual(['e']);
  });
  it('printers', () => {
    expect(ids({ printers: 'with' })).toEqual(['a', 'b', 'c']);
    expect(ids({ printers: 'without' })).toEqual(['d', 'e']);
    expect(ids({ printers: 'paused' })).toEqual(['b']);
    expect(ids({ printers: 'error' })).toEqual(['c']);
  });
  it('filters combine, and any active filter is reported for the clear button', () => {
    expect(ids({ version: '1.3.2', printers: 'error' })).toEqual(['c']);
    expect(ids({ state: 'online', signal: 'older' })).toEqual([]);
    expect(isFiltered({ ...EMPTY_FLEET_FILTER, printers: 'with' })).toBe(true);
  });
});
describe('fleet helpers', () => {
  it('a signal exactly three minutes old is outside the 3-minute window; an invalid one counts as never', () => {
    const edge = [row('x', 'X', { print_server: server({ last_seen_at: ago(3 * MIN) }) }), row('y', 'Y', { print_server: server({ last_seen_at: 'invalid' }) })];
    expect(filterFleet(edge, { ...EMPTY_FLEET_FILTER, signal: '3m' }, now)).toEqual([]);
    expect(filterFleet(edge, { ...EMPTY_FLEET_FILTER, signal: 'never' }, now).map(item => item.venue_id)).toEqual(['y']);
  });
  it('formats relative time, uptime and MAC addresses', () => {
    expect(relativeTime(ago(5 * MIN), now, 'en')).toBe('5 minutes ago');
    expect(relativeTime(ago(2 * HOUR), now, 'es')).toBe('hace 2 horas');
    expect(relativeTime(null, now, 'en')).toBeNull();
    expect(formatUptime(93784)).toBe('1d 2h 3m');
    expect(formatUptime(null)).toBeNull();
    expect(normalizeMac('aa-bb-cc-dd-ee-ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('aa:bb:cc')).toBeNull();
    expect(sameMac('AA:BB:CC:DD:EE:FF', 'aabbccddeeff')).toBe(true);
    expect(sameMac(null, null)).toBe(false);
  });
});


describe('venue device context', () => {
  const local = row('local', 'Venue-only name', { print_server: server({ id: 'ps-local-id', label: 'Receipt station', hostname: 'counter-host', device_id: 'device-serial' }) });
  const foreign = row('foreign', 'Other venue', { print_server: server({ label: 'Receipt station', hostname: 'foreign-host' }) });
  const empty = row('empty', 'No linked device');
  const pending = row('pending', 'Enrollment only', { pending_enrollment: { id: 'pending-id', label: 'Receipt station', expires_at: null, created_at: null } });
  const devices = [local, foreign, empty, pending];
  const search = (query: string, extra: Partial<FleetFilter> = {}) => filterVenueServers(devices, 'local', { ...EMPTY_FLEET_FILTER, query, ...extra }, now);
  it('searches each available PS identifier case-insensitively, without widening venue scope', () => {
    for (const query of [' RECEIPT ', 'ps-local', 'counter-host', 'device-serial']) expect(search(query)).toEqual([local]);
    for (const query of ['Venue-only', 'Other venue', 'foreign-host']) expect(search(query)).toEqual([]);
    expect(search('', { venue: 'foreign' })).toEqual([local]);
  });
  it('does not count empty venues or pending enrollments as linked devices', () => {
    expect(venueServerRows(devices, 'local')).toEqual([local]);
    for (const id of ['empty', 'pending', 'missing']) expect(venueServerRows(devices, id)).toEqual([]);
    expect(filterVenueServers(devices, 'pending', EMPTY_FLEET_FILTER, now)).toEqual([]);
  });
  it('combines device search with existing state, version, signal and printer filters', () => {
    expect(search('Receipt', { state: 'online', version: '1.4.0', signal: '3m', printers: 'without' })).toEqual([local]);
    for (const extra of [{state:'offline'}, {version:'9.9'}, {signal:'older'}, {printers:'with'}] as Partial<FleetFilter>[]) expect(search('Receipt', extra)).toEqual([]);
  });
  it('retains global venue-name/slug search including venues without devices', () => {
    expect(filterFleet(devices, { ...EMPTY_FLEET_FILTER, query: 'Venue-only' }, now)).toEqual([local]);
    expect(filterFleet(devices, { ...EMPTY_FLEET_FILTER, query: 'Receipt' }, now)).toEqual([]);
    expect(filterFleet(devices, EMPTY_FLEET_FILTER, now)).toEqual(devices);
  });
});
