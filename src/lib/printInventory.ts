import { PortalError } from './errors';

export type InventoryIssue = { level: string; source: string; code: string; count: number; at: string | null };
export type InventoryItem = {
  id: string; device_id: string | null; label: string | null; hostname: string | null;
  assignment: 'assigned' | 'unassigned'; venue_id: string | null; venue_name: string | null; last_venue_name: string | null;
  connection: 'online' | 'offline' | 'unknown' | 'unassigned';
  last_seen_at: string | null; last_report_at: string | null; firmware_version: string | null; firmware_known: boolean;
  error_count: number; warning_count: number; printers_total: number | null; pending_jobs: number | null;
  last_issue_at: string | null; issues: InventoryIssue[];
};
export type Inventory = { contract_version: 1; generated_at: string; online_window_seconds: number; items: InventoryItem[] };
export type InventoryFilter = { venue: string; state: string; version: string; query: string };
export const EMPTY_INVENTORY_FILTER: InventoryFilter = { venue: '', state: '', version: '', query: '' };
export const UNKNOWN_VERSION = '__unknown__';
export const ASSIGNED_VENUE = '__assigned__';
export const UNASSIGNED_VENUE = '__unassigned__';
const bad = (): never => { throw new PortalError('genericError'); };
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const count = (value: unknown): number => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : bad();
const date = (value: unknown): string | null => value === null ? null : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : bad();

// Closed projection: no raw reports, credentials, error text or extra server fields reach the page.
export function projectInventory(value: unknown): Inventory {
  const data = obj(value);
  if (data.contract_version !== 1 || !Array.isArray(data.items)) return bad();
  const generated_at = date(data.generated_at) ?? bad();
  const items = data.items.map(value => {
    const row = obj(value);
    const id = str(row.id) ?? bad();
    const assignment = row.assignment;
    const connection = row.connection;
    if (assignment !== 'assigned' && assignment !== 'unassigned') return bad();
    if (!['online', 'offline', 'unknown', 'unassigned'].includes(String(connection))) return bad();
    if ((assignment === 'unassigned') !== (connection === 'unassigned')) return bad();
    const venue_id = str(row.venue_id);
    if (assignment === 'assigned' && !venue_id) return bad();
    if (typeof row.firmware_known !== 'boolean' || !Array.isArray(row.issues)) return bad();
    return {
      id, device_id: str(row.device_id), label: str(row.label), hostname: str(row.hostname), assignment,
      venue_id, venue_name: str(row.venue_name), last_venue_name: str(row.last_venue_name),
      connection: connection as InventoryItem['connection'],
      last_seen_at: date(row.last_seen_at), last_report_at: date(row.last_report_at),
      firmware_known: row.firmware_known && !!str(row.firmware_version),
      firmware_version: row.firmware_known ? str(row.firmware_version) : null,
      error_count: count(row.error_count), warning_count: count(row.warning_count),
      printers_total: row.printers_total === null ? null : count(row.printers_total),
      pending_jobs: row.pending_jobs === null ? null : count(row.pending_jobs),
      last_issue_at: date(row.last_issue_at),
      issues: row.issues.map(value => { const issue = obj(value); return {
        level: str(issue.level) ?? bad(), source: str(issue.source) ?? bad(), code: str(issue.code) ?? bad(),
        count: count(issue.count), at: date(issue.at),
      }; }),
    } satisfies InventoryItem;
  });
  if (new Set(items.map(item => item.id)).size !== items.length) return bad();
  return { contract_version: 1, generated_at, online_window_seconds: count(data.online_window_seconds), items };
}
export function filterInventory(items: InventoryItem[], filter: InventoryFilter): InventoryItem[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return items.filter(item => {
    if (filter.venue && (filter.venue === ASSIGNED_VENUE ? item.assignment !== 'assigned' : filter.venue === UNASSIGNED_VENUE ? item.assignment !== 'unassigned' : true)) return false;
    if (filter.version && (filter.version === UNKNOWN_VERSION ? item.firmware_known : !item.firmware_known || item.firmware_version !== filter.version)) return false;
    if (filter.state && (filter.state === 'errors' ? item.error_count === 0 : filter.state === 'warnings' ? item.warning_count === 0 : item.connection !== filter.state)) return false;
    return !query || [item.label, item.hostname, item.device_id, item.venue_name].some(value => value?.toLocaleLowerCase().includes(query));
  });
}
export function inventoryVersions(items: InventoryItem[]): (string | null)[] {
  return [...new Set(items.map(item => item.firmware_known ? item.firmware_version : null))].sort((a, b) => a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { numeric: true }));
}
const latest = (values: (string | null)[]) => values.reduce<string | null>((last, value) => value && (!last || Date.parse(value) > Date.parse(last)) ? value : last, null);
export function summarizeInventory(items: InventoryItem[]) {
  return {
    total: items.length,
    online: items.filter(item => item.connection === 'online').length,
    offline: items.filter(item => item.connection === 'offline').length,
    unknown: items.filter(item => item.connection === 'unknown').length,
    unassigned: items.filter(item => item.assignment === 'unassigned').length,
    with_errors: items.filter(item => item.error_count > 0).length,
    with_warnings: items.filter(item => item.warning_count > 0).length,
    last_seen_at: latest(items.filter(item => item.assignment === 'assigned').map(item => item.last_seen_at)),
    last_issue_at: latest(items.map(item => item.last_issue_at)),
    firmware: inventoryVersions(items).map(version => {
      const count = items.filter(item => (item.firmware_known ? item.firmware_version : null) === version).length;
      return { version, count, pct: items.length ? count * 100 / items.length : 0 };
    }),
  };
}
