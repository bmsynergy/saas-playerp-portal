import { supabase } from './supabase';
import { SUPABASE_URL } from './config';
import { PortalError } from './errors';
import { PsError, psErrorFromCode, selectionRequired, withPs } from './printServerApi';
import { linkAssign, projectPsLink, type PsAssignResult, type PsDeviceLink } from './psLink';

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
  // PE-438: the new PS confirms by itself what it applied at enrollment (no secrets here).
  enroll: EnrollCredentials | null;
  // PE-440: canonical recovery SSID derived from the platform serial and the state of its adoption.
  ssidAdoption: SsidAdoption | null;
};
export type SsidAdoptionState = 'available' | 'pending' | 'applied' | 'failed' | 'provisioned' | 'not_reserved';
export type SsidAdoption = { canonical_ssid: string; current_ssid: string | null; state: SsidAdoptionState; reprint_label: boolean;
  command_id: string | null; requested_at: string | null; completed_at: string | null; error_code: string | null; previous_kept: boolean };
const ADOPTION_STATES: readonly SsidAdoptionState[] = ['available', 'pending', 'applied', 'failed', 'provisioned', 'not_reserved'];
const CANONICAL_SSID = /^PlayERP-Setup-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
export function projectSsidAdoption(v: unknown): SsidAdoption | null {
  const a = obj(v);
  if (!a || !(ADOPTION_STATES as readonly unknown[]).includes(a.state) || typeof a.canonical_ssid !== 'string' || !CANONICAL_SSID.test(a.canonical_ssid)) return null;
  const current = typeof a.current_ssid === 'string' && validRecoveryWifi(a.current_ssid, '0000000000') ? a.current_ssid : null;
  return { canonical_ssid: a.canonical_ssid, current_ssid: current, state: a.state as SsidAdoptionState, reprint_label: a.reprint_label === true,
    command_id: str(a.command_id), requested_at: str(a.requested_at), completed_at: str(a.completed_at), error_code: code(a.error_code), previous_kept: a.previous_kept === true };
}
export type EnrollPartState = 'pending' | 'applied' | 'failed' | 'not_expected' | 'not_applicable' | 'not_emitted';
export type EnrollCredentials = { state: 'pending' | 'applied' | 'failed' | 'not_expected' | 'not_applicable'; wifi: EnrollPartState; admin_code: EnrollPartState;
  wifi_error: string | null; admin_code_error: string | null; acked_at: string | null };
const ENROLL_PARTS: readonly EnrollPartState[] = ['pending', 'applied', 'failed', 'not_expected', 'not_applicable', 'not_emitted'];
export function projectEnroll(v: unknown): EnrollCredentials | null {
  const e = obj(v);
  if (!e || !['pending', 'applied', 'failed', 'not_expected', 'not_applicable'].includes(String(e.state))) return null;
  const part = (x: unknown): EnrollPartState => (ENROLL_PARTS as readonly unknown[]).includes(x) ? x as EnrollPartState : 'pending';
  return { state: e.state as EnrollCredentials['state'], wifi: part(e.wifi), admin_code: part(e.admin_code),
    wifi_error: code(e.wifi_error), admin_code_error: code(e.admin_code_error), acked_at: str(e.acked_at) };
}
export type InventoryDevice = { id: string; serial: string; hostname: string; model: string; status: string; legacy: boolean; venue_id: string | null; venue_name: string | null;
  arch?: string | null; label?: string | null; model_label?: string | null;
  print_server_id: string | null; software_version: string | null; last_seen_at: string | null; online: boolean; created_at: string | null;
  // PE-462: absent with an older backend (callers fall back to status).
  link?: PsDeviceLink };

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
    enroll: projectEnroll(s.enroll_credentials),
    ssidAdoption: projectSsidAdoption(s.wifi_ssid_adoption),
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
  const selection = selectionRequired(data);
  if (selection) throw selection;
  if (data.ok === false) {
    const error = psErrorFromCode(data.error);
    throw error instanceof PsError ? error : new PsError('dev.progress.requestRejectedUnknown');
  }
  if (data.ok !== true) return bad();
  return data;
}
// PE-443: printServerId selects ONE Print Server of the venue; reads never fall back to "the first".
export async function getDeviceSheet(venueId: string, signal?: AbortSignal, printServerId?: string | null): Promise<DeviceSheet> {
  const data = await rpc('ps_panel_device', { p_venue_id: venueId, ...withPs(printServerId) }, signal);
  const selection = selectionRequired(data);
  if (selection) throw selection;
  return projectDeviceSheet(data);
}
export async function rotateWifi(venueId: string, printServerId?: string | null) { return action('ps_panel_rotate_wifi', { p_venue_id: venueId, ...withPs(printServerId) }); }
export async function rotateAdminCode(venueId: string, printServerId?: string | null) { return action('ps_panel_rotate_admin_code', { p_venue_id: venueId, ...withPs(printServerId) }); }
// PE-440: platform staff only (others get 42501). Without confirm it is a read-only preview
// (current -> canonical); with confirm the backend queues ONE wifi_rotate {canonical SSID, current key}.
export type SsidAdoptResult = { current_ssid: string | null; canonical_ssid: string; state: 'preview' | 'pending' | 'applied'; command_id: string | null; already: boolean };
export const ADOPT_ERRORS = ['no_active_print_server', 'device_not_assigned', 'no_device_credentials', 'identity_not_reserved', 'wifi_rotation_pending', 'wifi_not_confirmed',
  'current_psk_not_supported', 'canonical_ssid_in_use', 'canonical_ssid_pending_elsewhere', 'canonical_ssid_reserved'] as const;
export class AdoptError extends Error { constructor(public key: string) { super(key); } }
export function projectAdoptResult(v: unknown): SsidAdoptResult {
  const r = obj(v) ?? bad();
  if (r.ok !== true) throw new AdoptError(`adopt.error.${typeof r.error === 'string' && (ADOPT_ERRORS as readonly string[]).includes(r.error) ? r.error : 'other'}`);
  if (typeof r.canonical_ssid !== 'string' || !CANONICAL_SSID.test(r.canonical_ssid) || !['preview', 'pending', 'applied'].includes(String(r.state))) return bad();
  return { current_ssid: typeof r.current_ssid === 'string' ? r.current_ssid : null, canonical_ssid: r.canonical_ssid, state: r.state as SsidAdoptResult['state'],
    command_id: str(r.command_id), already: r.already === true };
}
export async function adoptWifiSsid(venueId: string, confirm: boolean, printServerId?: string | null): Promise<SsidAdoptResult> {
  try { return projectAdoptResult(await rpc('ps_admin_wifi_ssid_adopt', { p_venue_id: venueId, p_confirm: confirm, ...withPs(printServerId) })); }
  catch (error) { if ((error as { code?: string })?.code === '42501') throw new AdoptError('adopt.error.forbidden'); throw error; }
}
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
// Only contiguous hex or colon-separated pairs; never repair malformed evidence.
export function normalizeSha256(value: string): string {
  const v = value.trim();
  return /^(?:[0-9a-f]+|[0-9a-f]{2}(?::[0-9a-f]{2})+)$/i.test(v) ? v.replace(/:/g, '').toLowerCase() : '';
}
export function caEvidenceStatus(input: string, expected: string | null): 'valid' | 'format' | 'unavailable' | 'mismatch' {
  const typed = normalizeSha256(input), ca = expected ? normalizeSha256(expected) : '';
  if (typed.length !== 12 && typed.length !== 64) return 'format';
  if (ca.length !== 64) return 'unavailable';
  return (typed.length === 12 ? ca.startsWith(typed) : ca === typed) ? 'valid' : 'mismatch';
}
export function needsLegacyReconciliation(ctx: LegacyContext): boolean {
  return ctx.legacy && (!ctx.wifi_confirmed || !ctx.admin_code_confirmed);
}
function validateLegacyEvidence(ctx: LegacyContext, kind: LegacyKind, values: { ssid: string; psk: string } | { admin_code: string }, physicalCheck: boolean, evidence: string) {
  if (!physicalCheck) throw new LegacyError('legacy.error.physical_check_required');
  if (!ctx.venue_id || !ctx.device_id || !ctx.serial || !ctx.print_server_id) throw new LegacyError('legacy.error.device_not_linked');
  if (!ctx.legacy) throw new LegacyError('legacy.error.not_legacy');
  if (ctx.print_server_status !== 'active') throw new LegacyError('legacy.error.print_server_not_active');
  const status = caEvidenceStatus(evidence, ctx.ca_cert_der_sha256);
  if (status !== 'valid') throw new LegacyError(status === 'format' ? 'legacy.fingerprintFormat' : status === 'mismatch' ? 'legacy.fingerprintMismatch' : 'legacy.error.device_not_linked');
  if (kind !== 'wifi' && kind !== 'admin_code') throw new LegacyError('legacy.error.bad_kind');
  if (kind === 'wifi' ? ctx.wifi_confirmed : ctx.admin_code_confirmed) throw new LegacyError('legacy.error.already_confirmed');
  if (!(kind === 'wifi' ? 'ssid' in values && validRecoveryWifi(values.ssid, values.psk) : 'admin_code' in values && validAdminCode(values.admin_code))) throw new LegacyError('legacy.error.invalid_value');
}
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
export async function getLegacyContext(venueId: string, signal?: AbortSignal, printServerId?: string | null): Promise<LegacyContext> {
  const data = await rpc('ps_admin_legacy_credentials_context', { p_venue_id: venueId, ...withPs(printServerId) }, signal);
  const selection = selectionRequired(data);
  if (selection) throw selection;
  const context = projectLegacyContext(data);
  if (context.venue_id !== venueId) throw new LegacyError('legacy.error.device_not_linked');
  if (printServerId && context.print_server_id && context.print_server_id !== printServerId) throw new LegacyError('legacy.error.device_not_linked');
  return context;
}
export async function reconcileLegacy(ctx: LegacyContext, kind: LegacyKind, values: { ssid: string; psk: string } | { admin_code: string }, physicalCheck: boolean, evidence: string): Promise<{ applied_at: string | null }> {
  validateLegacyEvidence(ctx, kind, values, physicalCheck, evidence);
  // Re-read with the caller's session: staff permission and the live venue/device/CA link
  // must still hold. The mutating RPC remains the final atomic authority.
  const live = await getLegacyContext(ctx.venue_id, undefined, ctx.print_server_id);
  if (live.venue_id !== ctx.venue_id || live.device_id !== ctx.device_id || live.serial !== ctx.serial || live.print_server_id !== ctx.print_server_id
    || normalizeSha256(live.ca_cert_der_sha256 ?? '') !== normalizeSha256(ctx.ca_cert_der_sha256 ?? '')) throw new LegacyError('legacy.error.device_not_linked');
  validateLegacyEvidence(live, kind, values, physicalCheck, evidence);
  const data = obj(await rpc('ps_admin_legacy_credentials_reconcile', { p_serial: ctx.serial, p_print_server_id: ctx.print_server_id, p_ca_der_sha256: normalizeSha256(live.ca_cert_der_sha256!),
    p_kind: kind, p_values: 'admin_code' in values ? { admin_code: normalizeAdminCode(values.admin_code) } : values, p_method: kind === 'wifi' ? 'recovery_read_and_join' : 'local_login', p_physical_check: physicalCheck })) ?? bad();
  if (data.ok !== true) throw legacyError(data.error);
  return { applied_at: str(data.applied_at) };
}
// Only the three known representations of the current alphabet are equivalent.
// Everything else is legacy and must remain byte-for-byte unchanged. The final
// lookahead requires the exact end; JavaScript $ would also allow a trailing newline.
const currentAdminCode = /^(?:[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}|[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{2})(?![\s\S])/i;
export function normalizeAdminCode(value: string): string {
  return currentAdminCode.test(value) ? value.replace(/-/g, '').toUpperCase() : value;
}
export function formatAdminCode(value: string): string {
  if (!currentAdminCode.test(value)) return value;
  const canonical = normalizeAdminCode(value);
  return `${canonical.slice(0, 5)}-${canonical.slice(5)}`;
}
export const validAdminCode = (v: unknown) => typeof v === 'string' && v.length >= 4 && v.length <= 64 && !/[^!-~]/.test(v);

// Pending credentials, certificates and enrollment share the sheet query. A terminal
// sheet or a network error alone is not a reason to keep querying indefinitely.
export function deviceSheetPollInterval(sheet: DeviceSheet | undefined, localPending: boolean): number | false {
  return localPending || sheet?.rotations.some(o => o.status === 'pending')
    || sheet?.cert_operations.some(o => o.status === 'pending') || sheet?.enroll?.state === 'pending' ? 10_000 : false;
}

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
      arch: str(d.arch), label: str(d.label), model_label: str(d.model_label),
      venue_id: str(d.venue_id), venue_name: str(d.venue_name), print_server_id: str(d.print_server_id), software_version: str(d.software_version),
      last_seen_at: str(d.last_seen_at), online: d.online === true, created_at: str(d.created_at), link: projectPsLink(d.link) ?? undefined };
  });
}
export async function createDevice(model: string) { return action('ps_admin_device_create', { p_model: model, p_notes: null }); }
// PE-462: assigning only saves the venue link; it never issues nor shows a code (see prepareDevice).
export async function assignDevice(deviceId: string, venueId: string): Promise<PsAssignResult> {
  return linkAssign('ps_admin_device_assign', deviceId, venueId);
}
export async function revokeDevice(deviceId: string, retire: boolean) { return action('ps_admin_device_revoke', { p_device_id: deviceId, p_reason: retire ? 'retired' : 'portal_admin' }); }

// QR content for the Wi-Fi label: Wi-Fi only (WPA), never the administrative code or a token.
export function wifiQrPayload(ssid: string, psk: string): string {
  const esc = (v: string) => v.replace(/([\\;,:"])/g, '\\$1');
  return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(psk)};;`;
}
