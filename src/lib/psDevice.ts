import { supabase } from './supabase';
import { SUPABASE_URL } from './config';
import { PortalError } from './errors';
import { PsError, psErrorFromCode } from './printServerApi';

// Device sheet of a venue's Print Server (PE-384). Rebuilt field by field: technical tokens,
// credential hashes and certificate bodies are never copied into state even if a backend
// change starts sending them.
export type OpStatus = 'pending' | 'applied' | 'failed';
export type WaitReason = 'applying' | 'ota_active' | 'reboot_pending' | 'wifi_change' | 'printing' | 'safety_check_unavailable' | 'bridge_unavailable' | 'device_offline' | 'awaiting_device';
export const WAIT_REASONS: readonly WaitReason[] = ['applying', 'ota_active', 'reboot_pending', 'wifi_change', 'printing', 'safety_check_unavailable', 'bridge_unavailable', 'device_offline', 'awaiting_device'];
// PE-428: received_at/wait_reason/error_detail/previous_kept describe what the device did with the request.
export type DeviceOp = { command_id: string; kind: string; status: OpStatus; requested_at: string | null; completed_at: string | null; error_code: string | null;
  received_at?: string | null; wait_reason?: WaitReason | 'other' | null; wait_updated_at?: string | null; error_detail?: string | null; previous_kept?: boolean };
export type DeviceSheet = {
  device: { id: string; serial: string; hostname: string; model: string; status: string; legacy: boolean } | null;
  appliedWifi: { ssid: string; psk: string; applied_at: string } | null;
  appliedAdminCode: { code: string; applied_at: string } | null;
  credentialAccess: boolean; can_manage_credentials: boolean;
  rotations: DeviceOp[];
  cert: { hostname: string | null; not_before: string | null; not_after: string | null; der_sha256: string | null; updated_at: string | null; status: 'valid' | 'expired' | 'none' };
  cert_operations: DeviceOp[];
  can_manage: boolean; is_platform_admin: boolean;
  ps_online: boolean | null; last_seen_at: string | null;
  wifiMethod: string | null; adminCodeMethod: string | null;
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
  const wait = typeof o.wait_reason === 'string' ? (WAIT_REASONS as readonly string[]).includes(o.wait_reason) ? o.wait_reason as WaitReason : 'other' : null;
  // Unstructured device errors never enter UI state (they may contain secrets).
  return { command_id: String(o.command_id ?? ''), kind: String(o.kind ?? ''), status, requested_at: str(o.requested_at), completed_at: str(o.completed_at), error_code: code(o.error_code),
    received_at: str(o.received_at), wait_reason: status === 'pending' ? wait : null, wait_updated_at: str(o.wait_updated_at), error_detail: null, previous_kept: o.previous_kept === true };
}
const ts = (v: string | null | undefined) => { const n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : -Infinity; };
// Latest rotation of one kind (by requested_at, falling back to list order: the backend lists newest first).
export function latestRotation(rotations: DeviceOp[], kind: string): DeviceOp | null {
  let best: DeviceOp | null = null;
  for (const item of rotations) if (item.kind === kind && (!best || ts(item.requested_at) > ts(best.requested_at))) best = item;
  return best;
}
// Reason shown for a pending item. Falls back to the contract rule when the backend sent none.
export function pendingReason(item: DeviceOp, psOnline: boolean | null): WaitReason | 'other' {
  if (item.wait_reason) return item.wait_reason;
  if (psOnline === false) return 'device_offline';
  return item.received_at ? 'applying' : 'awaiting_device';
}
export function confirmedAt(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now()
    ? value : null;
}
export function validRecoveryWifi(ssid: unknown, password: unknown): boolean {
  return typeof ssid === 'string' && new TextEncoder().encode(ssid).length >= 1
    && new TextEncoder().encode(ssid).length <= 32 && !/[\p{C}\p{Zl}\p{Zp}]/u.test(ssid)
    && typeof password === 'string' && /^[0-9]{10}$/.test(password);
}
export function projectDeviceSheet(v: unknown): DeviceSheet {
  const s = obj(v) ?? bad();
  if (s.ok !== true) throw psErrorFromCode(s.error);
  const d = obj(s.device); const w = obj(s.wifi); const c = obj(s.cert) ?? {};
  // Fail closed until Tom's server-side contract is deployed. A status=active or an
  // enrollment-generated value is not proof that a device applied that value.
  const credentialAccess = s.credentials_version === 1 && s.can_read_credentials === true;
  const wifiAt = confirmedAt(w?.wifi_applied_at);
  const codeAt = confirmedAt(w?.admin_code_applied_at);
  return {
    credentialAccess, can_manage_credentials: credentialAccess && s.can_manage_credentials === true,
    appliedWifi: credentialAccess && wifiAt && validRecoveryWifi(w?.ssid, w?.psk)
      ? { ssid: w!.ssid as string, psk: w!.psk as string, applied_at: wifiAt } : null,
    appliedAdminCode: credentialAccess && codeAt && validAdminCode(w?.admin_code)
      ? { code: w!.admin_code as string, applied_at: codeAt } : null,
    device: d && typeof d.id === 'string' ? { id: d.id, serial: String(d.serial ?? ''), hostname: String(d.hostname ?? ''), model: String(d.model ?? ''), status: String(d.status ?? ''), legacy: d.legacy === true } : null,
    rotations: Array.isArray(s.rotations) ? s.rotations.map(op) : [],
    cert: { hostname: str(c.hostname), not_before: str(c.not_before), not_after: str(c.not_after), der_sha256: str(c.der_sha256), updated_at: str(c.updated_at),
      status: c.status === 'valid' || c.status === 'expired' ? c.status : 'none' },
    cert_operations: Array.isArray(s.cert_operations) ? s.cert_operations.map(op) : [],
    can_manage: s.can_manage === true, is_platform_admin: s.is_platform_admin === true,
    ps_online: typeof s.ps_online === 'boolean' ? s.ps_online : null, last_seen_at: str(s.last_seen_at),
    wifiMethod: credentialAccess && wifiAt ? code(w?.wifi_method) : null, adminCodeMethod: credentialAccess && codeAt ? code(w?.admin_code_method) : null,
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
  if (data.ok === false) {
    const error = psErrorFromCode(data.error);
    throw error instanceof PsError ? error : new PsError('dev.progress.requestRejectedUnknown');
  }
  if (data.ok !== true) return bad();
  return data;
}
export async function getDeviceSheet(venueId: string, signal?: AbortSignal): Promise<DeviceSheet> {
  return projectDeviceSheet(await rpc('ps_panel_device', { p_venue_id: venueId }, signal));
}
export async function rotateWifi(venueId: string) { return action('ps_panel_rotate_wifi', { p_venue_id: venueId }); }
export async function rotateAdminCode(venueId: string) { return action('ps_panel_rotate_admin_code', { p_venue_id: venueId }); }
export async function renewCert(printServerId: string) { return action('ps_admin_cert_renew', { p_print_server_id: printServerId }); }

// PE-428 legacy reconciliation (platform staff only; others get 42501). The context never carries
// secret values; the values typed by staff go straight to the RPC and are never stored or logged.
export type LegacyContext = { venue_id: string; device_id: string | null; serial: string | null; legacy: boolean; hostname: string | null; print_server_id: string | null;
  print_server_status: string | null; ca_cert_der_sha256: string | null; software_version: string | null; last_seen_at: string | null; ps_online: boolean;
  wifi_confirmed: boolean; wifi_applied_at: string | null; admin_code_confirmed: boolean; admin_code_applied_at: string | null; wifi_method: string | null; admin_code_method: string | null };
export type LegacyKind = 'wifi' | 'admin_code';
export const LEGACY_ERRORS = ['device_not_found', 'not_legacy', 'print_server_not_active', 'device_not_linked', 'ca_mismatch', 'bad_kind', 'bad_method', 'physical_check_required', 'invalid_value', 'already_confirmed'] as const;
export class LegacyError extends Error { constructor(public key: string) { super(key); } }
const legacyError = (v: unknown) => new LegacyError(`legacy.error.${typeof v === 'string' && (LEGACY_ERRORS as readonly string[]).includes(v) ? v : v === 'forbidden' ? 'forbidden' : 'other'}`);
export const normalizeSha256 = (v: string) => v.replace(/[^0-9a-f]/gi, '').toLowerCase();
export function projectLegacyContext(v: unknown): LegacyContext {
  const s = obj(v) ?? bad();
  if (s.ok !== true) throw legacyError(s.error);
  const sha = str(s.ca_der_sha256 ?? s.ca_cert_der_sha256);
  return { venue_id: String(s.venue_id ?? ''), device_id: str(s.device_id), serial: str(s.serial), legacy: s.legacy === true, hostname: str(s.hostname), print_server_id: str(s.print_server_id),
    print_server_status: str(s.print_server_status), ca_cert_der_sha256: sha && /^[0-9a-f]{64}$/.test(normalizeSha256(sha)) ? sha : null,
    software_version: str(s.software_version), last_seen_at: str(s.last_seen_at), ps_online: s.ps_online === true,
    wifi_confirmed: s.wifi_confirmed === true, wifi_applied_at: str(s.wifi_applied_at), admin_code_confirmed: s.admin_code_confirmed === true, admin_code_applied_at: str(s.admin_code_applied_at),
    wifi_method: code(s.wifi_method), admin_code_method: code(s.admin_code_method) };
}
export async function getLegacyContext(venueId: string, signal?: AbortSignal): Promise<LegacyContext> {
  return projectLegacyContext(await rpc('ps_admin_legacy_credentials_context', { p_venue_id: venueId }, signal));
}
export async function reconcileLegacy(ctx: LegacyContext, kind: LegacyKind, values: { ssid: string; psk: string } | { admin_code: string }, physicalCheck: boolean): Promise<{ applied_at: string | null }> {
  if (!ctx.serial || !ctx.print_server_id || !ctx.ca_cert_der_sha256) throw new LegacyError('legacy.error.device_not_linked');
  const data = obj(await rpc('ps_admin_legacy_credentials_reconcile', { p_serial: ctx.serial, p_print_server_id: ctx.print_server_id, p_ca_der_sha256: ctx.ca_cert_der_sha256,
    p_kind: kind, p_values: values, p_method: kind === 'wifi' ? 'recovery_read_and_join' : 'local_login', p_physical_check: physicalCheck })) ?? bad();
  if (data.ok !== true) throw legacyError(data.error);
  return { applied_at: str(data.applied_at) };
}
export const validAdminCode = (v: unknown) => typeof v === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/.test(v);

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
  if (!Array.isArray(data.devices)) return bad();
  return data.devices.map((v: unknown) => {
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
  const esc = (v: string) => v.replace(/([\\;,:"])/g, '\\$1');
  return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(psk)};;`;
}
