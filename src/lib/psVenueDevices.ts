import { supabase } from './supabase';
import { PortalError } from './errors';
import { psErrorFromCode, selectionRequired } from './printServerApi';

// PE-443: several Print Servers per venue. A device is addressed by a stable id: the
// print_server_id when it is active, otherwise its inventory id. Rebuilt field by field.
export type VenueDevice = {
  id: string; print_server_id: string | null; inventory_device_id: string | null; serial: string | null; label: string | null; hostname: string | null;
  status: string | null; online: boolean; software_version: string | null; last_seen_at: string | null; printers_total: number;
};
export type UnassignedPrinter = { id: string; label: string; mac_address: string | null; model: string | null; location: string | null; is_active: boolean };
export type VenueDevices = { venue_id: string; can_manage: boolean; devices: VenueDevice[]; unassigned_printers: UnassignedPrinter[] };
export type DeviceSheetRef = {
  kind: 'print_server' | 'inventory'; print_server_id: string | null; inventory_device_id: string | null;
  venue_id: string | null; venue_name: string | null; status: string | null; can_manage: boolean; is_staff: boolean;
};

type Raw = Record<string, unknown>;
const bad = (): never => { throw new PortalError('genericError'); };
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const str = (v: unknown) => typeof v === 'string' && v !== '' ? v : null;
const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

async function rpc(name: string, params: Raw, signal?: AbortSignal): Promise<Raw> {
  const req = supabase.rpc(name, params);
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  const out = obj(data) ?? bad();
  const selection = selectionRequired(out);
  if (selection) throw selection;
  if (out.ok !== true) throw psErrorFromCode(out.error);
  return out;
}

export function projectVenueDevice(v: unknown): VenueDevice {
  const d = obj(v);
  if (!d || typeof d.id !== 'string' || !d.id) return bad();
  return { id: d.id, print_server_id: str(d.print_server_id), inventory_device_id: str(d.inventory_device_id), serial: str(d.serial), label: str(d.label),
    hostname: str(d.hostname), status: str(d.status), online: d.online === true, software_version: str(d.software_version), last_seen_at: str(d.last_seen_at),
    printers_total: count(d.printers_total) };
}
function unassignedPrinter(v: unknown): UnassignedPrinter {
  const p = obj(v);
  if (!p || typeof p.id !== 'string') return bad();
  return { id: p.id, label: str(p.label) ?? '', mac_address: str(p.mac_address), model: str(p.model), location: str(p.location), is_active: p.is_active !== false };
}
export function projectVenueDevices(v: unknown, venueId: string): VenueDevices {
  const d = obj(v) ?? bad();
  if (d.venue_id !== venueId) throw new PortalError('accessDenied');
  return { venue_id: venueId, can_manage: d.can_manage === true, devices: list(d.devices).map(projectVenueDevice), unassigned_printers: list(d.unassigned_printers).map(unassignedPrinter) };
}
export async function getVenueDevices(venueId: string, signal?: AbortSignal): Promise<VenueDevices> {
  return projectVenueDevices(await rpc('ps_panel_devices', { p_venue_id: venueId }, signal), venueId);
}
export function projectSheetRef(v: unknown): DeviceSheetRef {
  const r = obj(v) ?? bad();
  if (r.kind !== 'print_server' && r.kind !== 'inventory') return bad();
  if (r.kind === 'print_server' && !str(r.print_server_id)) return bad();
  if (r.kind === 'inventory' && !str(r.inventory_device_id)) return bad();
  return { kind: r.kind, print_server_id: str(r.print_server_id), inventory_device_id: str(r.inventory_device_id), venue_id: str(r.venue_id), venue_name: str(r.venue_name),
    status: str(r.status), can_manage: r.can_manage === true, is_staff: r.is_staff === true };
}
export async function resolveDeviceSheet(id: string, signal?: AbortSignal): Promise<DeviceSheetRef> {
  const ref = projectSheetRef(await rpc('ps_device_sheet_resolve', { p_id: id }, signal));
  if (ref.print_server_id !== id && ref.inventory_device_id !== id) throw new PortalError('accessDenied');
  return ref;
}
export const deviceName = (d: Pick<VenueDevice, 'label' | 'hostname' | 'serial' | 'id'>) => d.label?.trim() || d.hostname?.trim() || d.serial?.trim() || d.id;
export const adminSheetHref = (id: string) => `/admin/print-servers/devices/${encodeURIComponent(id)}`;
export const ownerSheetHref = (venueId: string, id: string) => `/?venue=${encodeURIComponent(venueId)}&section=print-servers&device=${encodeURIComponent(id)}`;
