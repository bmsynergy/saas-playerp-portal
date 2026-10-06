import { supabase } from './supabase';
import { SUPABASE_URL } from './config';
import { PortalError } from './errors';
import { PsError, psErrorFromCode } from './printServerApi';

// Device sheet of a venue's Print Server (PE-384). Rebuilt field by field: technical tokens,
// credential hashes and certificate bodies are never copied into state even if a backend
// change starts sending them.
export type OpStatus = 'pending' | 'applied' | 'failed';
export type DeviceOp = { command_id: string; kind: string; status: OpStatus; requested_at: string | null; completed_at: string | null; error_code: string | null };
export type DeviceSheet = {
  device: { id: string; serial: string; hostname: string; model: string; status: string; legacy: boolean } | null;
  wifi: { ssid: string; psk: string; admin_code: string; wifi_applied_at: string | null; admin_code_applied_at: string | null } | null;
  rotations: DeviceOp[];
  cert: { hostname: string | null; not_before: string | null; not_after: string | null; der_sha256: string | null; updated_at: string | null; status: 'valid' | 'expired' | 'none' };
  cert_operations: DeviceOp[];
  can_manage: boolean; is_platform_admin: boolean;
};
export type InventoryDevice = { id: string; serial: string; hostname: string; model: string; status: string; legacy: boolean; venue_id: string | null; venue_name: string | null;
  print_server_id: string | null; software_version: string | null; last_seen_at: string | null; online: boolean; created_at: string | null };

type Raw = Record<string, unknown>;
const str = (v: unknown) => typeof v === 'string' && v !== '' ? v : null;
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const code = (v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(v) ? v : v == null ? null : 'other';
const bad = (): never => { throw new PortalError('genericError'); };
function op(v: unknown): DeviceOp {
  const o = obj(v) ?? bad();
  const status = o.status === 'applied' || o.status === 'failed' ? o.status : 'pending';
  return { command_id: String(o.command_id ?? ''), kind: String(o.kind ?? ''), status, requested_at: str(o.requested_at), completed_at: str(o.completed_at), error_code: code(o.error_code) };
}
export function projectDeviceSheet(v: unknown): DeviceSheet {
  const s = obj(v) ?? bad();
  if (s.ok !== true) throw psErrorFromCode(s.error);
  const d = obj(s.device); const w = obj(s.wifi); const c = obj(s.cert) ?? {};
  return {
    device: d && typeof d.id === 'string' ? { id: d.id, serial: String(d.serial ?? ''), hostname: String(d.hostname ?? ''), model: String(d.model ?? ''), status: String(d.status ?? ''), legacy: d.legacy === true } : null,
    wifi: w && typeof w.ssid === 'string' ? { ssid: w.ssid, psk: String(w.psk ?? ''), admin_code: String(w.admin_code ?? ''), wifi_applied_at: str(w.wifi_applied_at), admin_code_applied_at: str(w.admin_code_applied_at) } : null,
    rotations: Array.isArray(s.rotations) ? s.rotations.map(op) : [],
    cert: { hostname: str(c.hostname), not_before: str(c.not_before), not_after: str(c.not_after), der_sha256: str(c.der_sha256), updated_at: str(c.updated_at),
      status: c.status === 'valid' || c.status === 'expired' ? c.status : 'none' },
    cert_operations: Array.isArray(s.cert_operations) ? s.cert_operations.map(op) : [],
    can_manage: s.can_manage === true, is_platform_admin: s.is_platform_admin === true,
  };
}
async function rpc(name: string, params: Raw = {}, signal?: AbortSignal): Promise<unknown> {
  const req = supabase.rpc(name, params);
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  return data;
}
async function action(name: string, params: Raw): Promise<Raw> {
  const data = obj(await rpc(name, params)) ?? bad();
  if (data.ok !== true) throw psErrorFromCode(data.error);
  return data;
}
export async function getDeviceSheet(venueId: string, signal?: AbortSignal): Promise<DeviceSheet> {
  return projectDeviceSheet(await rpc('ps_panel_device', { p_venue_id: venueId }, signal));
}
export async function rotateWifi(venueId: string) { return action('ps_panel_rotate_wifi', { p_venue_id: venueId }); }
export async function rotateAdminCode(venueId: string) { return action('ps_panel_rotate_admin_code', { p_venue_id: venueId }); }
export async function renewCert(printServerId: string) { return action('ps_admin_cert_renew', { p_print_server_id: printServerId }); }

// Upload goes through the edge, which parses the certificate server-side. A private key is refused
// here before it leaves the browser, and again by the server.
export async function uploadCert(printServerId: string, certPem: string, chainPem: string): Promise<Raw> {
  if (/PRIVATE\s+KEY/i.test(certPem + chainPem)) throw new PsError('dev.error.private_key_rejected');
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PortalError('sessionExpired');
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ps-cert-admin`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', print_server_id: printServerId, cert_pem: certPem, chain_pem: chainPem.trim() || null }) });
  } catch { throw new PortalError('networkError'); }
  const data = await response.json().catch(() => null) as Raw | null;
  if (response.status === 401) throw new PortalError('sessionExpired');
  if (response.status === 403) throw new PortalError('accessDenied');
  if (!data || data.ok !== true) throw new PsError(`dev.error.${code(data?.error) ?? 'other'}`);
  return data;
}

// Platform inventory (platform Admin only; the backend answers 42501 to anyone else).
export async function getInventoryDevices(signal?: AbortSignal): Promise<InventoryDevice[]> {
  const data = obj(await rpc('portal_ps_devices', {}, signal)) ?? bad();
  return (Array.isArray(data.devices) ? data.devices : []).map((v: unknown) => {
    const d = obj(v) ?? bad();
    return { id: String(d.id), serial: String(d.serial ?? ''), hostname: String(d.hostname ?? ''), model: String(d.model ?? ''), status: String(d.status ?? ''), legacy: d.legacy === true,
      venue_id: str(d.venue_id), venue_name: str(d.venue_name), print_server_id: str(d.print_server_id), software_version: str(d.software_version),
      last_seen_at: str(d.last_seen_at), online: d.online === true, created_at: str(d.created_at) };
  });
}
export async function createDevice(model: string) { return action('ps_admin_device_create', { p_model: model, p_notes: null }); }
export async function assignDevice(deviceId: string, venueId: string): Promise<{ code: string; expires_at: string | null; replaces: boolean }> {
  const data = await action('ps_admin_device_assign', { p_device_id: deviceId, p_venue_id: venueId });
  return typeof data.enrollment_code === 'string' ? { code: data.enrollment_code, expires_at: str(data.expires_at), replaces: !!data.replaces_device_id } : bad();
}
export async function revokeDevice(deviceId: string, retire: boolean) { return action('ps_admin_device_revoke', { p_device_id: deviceId, p_reason: retire ? 'retired' : 'portal_admin' }); }

// QR content for the Wi-Fi label: Wi-Fi only (WPA), never the administrative code or a token.
export function wifiQrPayload(ssid: string, psk: string): string {
  const esc = (v: string) => v.replace(/([\;,:"])/g, '\\$1');
  return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(psk)};;`;
}
