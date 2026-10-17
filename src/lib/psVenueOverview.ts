import { supabase } from './supabase';
import { PortalError } from './errors';
import { projectPsLink, type PsDeviceLink } from './psLink';

export type PsVenueState = 'online' | 'offline' | 'unknown' | 'pending';
// PE-462: a device assigned but not yet prepared/synced is listed with state 'pending'
// and possibly without print_server_id; `id` is the stable row/sheet id in every case.
export type PsVenueServer = {
  id: string; print_server_id: string | null; inventory_device_id: string | null; serial: string | null;
  hostname: string | null; label: string | null; firmware_version: string | null;
  state: PsVenueState; attention: boolean; error_count: number; warning_count: number; last_seen_at: string | null;
  link?: PsDeviceLink;
};
export type PsVenueGroup = {
  venue_id: string; venue_name: string; venue_slug: string | null; venue_is_active: boolean;
  location_short: string | null; print_server_count: number;
  states: Record<PsVenueState | 'attention', number>; print_servers: PsVenueServer[];
};
export type PsUnassignedDevice = {
  inventory_device_id: string; serial: string | null; hostname: string | null; label: string | null;
  model: string | null; status: 'stock' | 'retired'; last_venue_name: string | null;
  pending_venue_name: string | null; created_at: string | null;
  link?: PsDeviceLink;
};
export type PsVenueOverview = {
  contract_version: 1; generated_at: string | null; online_window_seconds: number;
  summary: { venues: number; print_servers: number; unassigned: number; in_stock: number; retired: number };
  venues: PsVenueGroup[];
  unassigned: { count: number; in_stock: number; retired: number; devices: PsUnassignedDevice[] };
};
type Raw = Record<string, unknown>;
const bad = (): never => { throw new PortalError('genericError'); };
const obj = (value: unknown): Raw => value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : bad();
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const required = (value: unknown): string => str(value) ?? bad();
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : bad();
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : bad();

// Explicit projection: only the published overview DTO enters the query cache.
export function projectPsVenueOverview(value: unknown): PsVenueOverview {
  const data = obj(value), summary = obj(data.summary), free = obj(data.unassigned);
  if (data.contract_version !== 1) return bad();
  return {
    contract_version: 1, generated_at: str(data.generated_at), online_window_seconds: count(data.online_window_seconds),
    summary: { venues: count(summary.venues), print_servers: count(summary.print_servers), unassigned: count(summary.unassigned), in_stock: count(summary.in_stock), retired: count(summary.retired) },
    venues: list(data.venues).map(value => {
      const venue = obj(value), states = obj(venue.states);
      return {
        venue_id: required(venue.venue_id), venue_name: required(venue.venue_name), venue_slug: str(venue.venue_slug), venue_is_active: venue.venue_is_active === true,
        location_short: str(venue.location_short), print_server_count: count(venue.print_server_count),
        states: { online: count(states.online), offline: count(states.offline), unknown: count(states.unknown), pending: count(states.pending), attention: count(states.attention) },
        print_servers: list(venue.print_servers).map(value => {
          const device = obj(value);
          if (!['online', 'offline', 'unknown', 'pending'].includes(required(device.state))) return bad();
          const link = projectPsLink(device.link) ?? undefined;
          const psId = device.state === 'pending' ? str(device.print_server_id) : required(device.print_server_id);
          const inventoryId = str(device.inventory_device_id);
          return { id: psId ?? inventoryId ?? link?.device_id ?? bad(), print_server_id: psId, inventory_device_id: inventoryId, serial: str(device.serial),
            hostname: str(device.hostname), label: str(device.label), firmware_version: str(device.firmware_version), state: device.state as PsVenueState,
            attention: device.attention === true, error_count: count(device.error_count), warning_count: count(device.warning_count), last_seen_at: str(device.last_seen_at), link };
        }),
      };
    }),
    unassigned: { count: count(free.count), in_stock: count(free.in_stock), retired: count(free.retired), devices: list(free.devices).map(value => {
      const device = obj(value);
      if (device.status !== 'stock' && device.status !== 'retired') return bad();
      return { inventory_device_id: required(device.inventory_device_id), serial: str(device.serial), hostname: str(device.hostname), label: str(device.label),
        model: str(device.model), status: device.status, last_venue_name: str(device.last_venue_name), pending_venue_name: str(device.pending_venue_name), created_at: str(device.created_at), link: projectPsLink(device.link) ?? undefined };
    }) },
  };
}
export async function getPsVenueOverview(signal?: AbortSignal): Promise<PsVenueOverview> {
  const request = supabase.rpc('portal_ps_venue_overview');
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return projectPsVenueOverview(data);
}
