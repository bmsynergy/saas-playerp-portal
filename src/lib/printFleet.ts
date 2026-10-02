// Types and pure helpers for the platform Print Server fleet. No I/O here:
// everything takes its rows, its filter and `now` so it can be unit-tested.
export type PsLastStatus = { uptime_seconds: number | null; queue_depth: number | null; portal_url: string | null; note: string | null };
export type PsPendingEnrollment = { id: string; label: string | null; expires_at: string | null; created_at: string | null };
export type FleetServer = {
  id: string; label: string | null; status: string; device_id: string | null; hostname: string | null;
  software_version: string | null; local_address: string | null; local_port: number | null;
  enrolled_at: string | null; last_seen_at: string | null; last_status_at: string | null; last_status: PsLastStatus | null;
  channel_opened_at: string | null; online: boolean; ca_cert_available: boolean; ca_cert_fingerprint: string | null;
};
export type FleetRow = {
  venue_id: string; venue_name: string; venue_slug: string | null; venue_is_active: boolean | null;
  print_server: FleetServer | null; pending_enrollment: PsPendingEnrollment | null;
  revoked_count: number; last_revoked_at: string | null;
  printers_total: number; printers_active: number; printers_paused: number; printers_with_error: number; pending_jobs: number;
};
export type FleetState = 'online' | 'offline' | 'pending' | 'none';
export type FleetSignal = '' | '3m' | '1h' | '24h' | 'older' | 'never';
export type FleetPrinters = '' | 'with' | 'without' | 'paused' | 'error';
export type FleetFilter = { query: string; venue: string; version: string; signal: FleetSignal; state: '' | FleetState; printers: FleetPrinters };

export const NO_VERSION = '__none__';
export const EMPTY_FLEET_FILTER: FleetFilter = { query: '', venue: '', version: '', signal: '', state: '', printers: '' };
export const FLEET_STATES: FleetState[] = ['online', 'offline', 'pending', 'none'];
export const FLEET_SIGNALS: Exclude<FleetSignal, ''>[] = ['3m', '1h', '24h', 'older', 'never'];
export const FLEET_PRINTERS: Exclude<FleetPrinters, ''>[] = ['with', 'without', 'paused', 'error'];
const MINUTE = 60_000; const HOUR = 60 * MINUTE; const DAY = 24 * HOUR;

// An active Print Server is online or offline (as answered by the backend);
// without one the venue is either waiting for an enrollment or has nothing.
export function fleetState(row: Pick<FleetRow, 'print_server' | 'pending_enrollment'>): FleetState {
  if (row.print_server) return row.print_server.online ? 'online' : 'offline';
  return row.pending_enrollment ? 'pending' : 'none';
}
// Milliseconds since the last signal; null when there never was a valid one.
export function signalAge(row: Pick<FleetRow, 'print_server'>, now: number): number | null {
  const seen = row.print_server?.last_seen_at ? Date.parse(row.print_server.last_seen_at) : NaN;
  return Number.isFinite(seen) ? Math.max(0, now - seen) : null;
}
function matchesSignal(row: FleetRow, signal: FleetSignal, now: number) {
  if (!signal) return true;
  const age = signalAge(row, now);
  if (signal === 'never') return age === null;
  if (age === null) return false;
  if (signal === '3m') return age < 3 * MINUTE;
  if (signal === '1h') return age < HOUR;
  if (signal === '24h') return age < DAY;
  return age >= DAY;
}
function matchesPrinters(row: FleetRow, printers: FleetPrinters) {
  if (printers === 'with') return row.printers_total > 0;
  if (printers === 'without') return row.printers_total === 0;
  if (printers === 'paused') return row.printers_paused > 0;
  if (printers === 'error') return row.printers_with_error > 0;
  return true;
}
export function matchesFleet(row: FleetRow, filter: FleetFilter, now: number): boolean {
  const query = filter.query.trim().toLocaleLowerCase();
  if (query && ![row.venue_name, row.venue_slug].some(value => value?.toLocaleLowerCase().includes(query))) return false;
  if (filter.venue && row.venue_id !== filter.venue) return false;
  const version = row.print_server?.software_version || null;
  if (filter.version && (filter.version === NO_VERSION ? version !== null : version !== filter.version)) return false;
  if (filter.state && fleetState(row) !== filter.state) return false;
  return matchesSignal(row, filter.signal, now) && matchesPrinters(row, filter.printers);
}
export function filterFleet(rows: FleetRow[], filter: FleetFilter, now: number): FleetRow[] {
  return rows.filter(row => matchesFleet(row, filter, now));
}
// A venue row without a linked server is not a device, even during enrollment.
export function venueServerRows(rows: FleetRow[], venueId: string): FleetRow[] {
  return rows.filter(row => row.venue_id === venueId && row.print_server !== null);
}
export function filterVenueServers(rows: FleetRow[], venueId: string, filter: FleetFilter, now: number): FleetRow[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const deviceFilter = { ...filter, query: '', venue: '' };
  return venueServerRows(rows, venueId).filter(row => {
    const server = row.print_server!;
    return (!query || [server.label, server.id, server.device_id, server.hostname]
      .some(value => value?.toLocaleLowerCase().includes(query))) && matchesFleet(row, deviceFilter, now);
  });
}
export function fleetVersions(rows: FleetRow[]): string[] {
  return [...new Set(rows.map(row => row.print_server?.software_version).filter((value): value is string => !!value))]
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
export function isFiltered(filter: FleetFilter): boolean {
  return (Object.keys(EMPTY_FLEET_FILTER) as (keyof FleetFilter)[]).some(key => filter[key] !== EMPTY_FLEET_FILTER[key]);
}
// "3 minutes ago" in the portal language; null when the timestamp is absent or invalid.
export function relativeTime(value: string | null, now: number, locale: string): string | null {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return null;
  const seconds = Math.round((time - now) / 1000); const abs = Math.abs(seconds);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return format.format(seconds, 'second');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86400), 'day');
}
export function formatUptime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds); const d = Math.floor(total / 86400); const h = Math.floor(total % 86400 / 3600); const m = Math.floor(total % 3600 / 60);
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : m ? `${m}m ${total % 60}s` : `${total}s`;
}
export function normalizeMac(value: string): string | null {
  const hex = value.replace(/[\s:.-]/g, '').toUpperCase();
  return /^[0-9A-F]{12}$/.test(hex) ? hex.match(/.{2}/g)!.join(':') : null;
}
export function sameMac(a: string | null, b: string | null): boolean {
  const left = a ? normalizeMac(a) : null;
  return !!left && left === (b ? normalizeMac(b) : null);
}
