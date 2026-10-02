import { certificateDerFingerprint, certificateFilename, formatFingerprint } from './certificate';
import { projectInventory, type Inventory } from './printInventory';
import { supabase } from './supabase';
import { errorCode, PortalError } from './errors';
import type { FleetRow, FleetServer, PsLastStatus, PsPendingEnrollment } from './printFleet';

// Browser publishable key + the user's own session only. Every RPC answer is
// rebuilt field by field from an explicit allow-list: unknown keys (hashes,
// credentials, certificate bodies, anything added later) are never copied into
// state, the query cache or a log. The one-time enrollment code and the public
// certificate are returned to their caller and stored nowhere else.
export type PanelServer = FleetServer & { ca_cert_updated_at: string | null; ca_cert_der_sha256: string | null; ca_cert_status: 'reported' | 'pending' };
export type PrinterReport = { reachable: boolean | null; local_address: string | null; model: string | null; state: string | null; error: string | null; reported_at: string | null };
export type Workstation = { id: string; name: string };
export type PanelPrinter = {
  id: string; label: string; location: string | null; model: string | null; mac_address: string | null; paper_width_chars: number | null;
  is_active: boolean; print_route: string | null; last_seen_at: string | null; last_error: string | null;
  last_report: PrinterReport | null; last_report_at: string | null; pending_jobs: number; workstations: Workstation[]; created_at: string | null;
};
export type ScanCandidate = { mac_address: string | null; local_address: string | null; model: string | null; hostname: string | null; port: number | null; reachable: boolean | null; printer_id: string | null };
export type ScanResult = { candidates: ScanCandidate[]; count: number; scanned_at: string | null; network: string | null };
export type PanelScan = {
  command_id: string; status: string; created_at: string | null; expires_at: string | null; completed_at: string | null;
  result: ScanResult | null; error_code: string | null; error_detail: string | null;
};
export type PanelState = {
  venue_id: string; can_manage: boolean; server_time: string | null;
  print_server: PanelServer | null; pending_enrollment: PsPendingEnrollment | null; printers: PanelPrinter[]; last_scan: PanelScan | null;
};
export type Enrollment = { print_server_id: string | null; enrollment_code: string; expires_at: string | null };
export type ScanRequest = { command_id: string; status: string; already: boolean; expires_at: string | null; ps_online: boolean };
export type CertDownload = { pem: string; filename: string; fingerprint: string | null; derFingerprint: string; pemSha256: string | null; updated_at: string | null };
export type RemoveResult = { removed: true } | { removed: false; workstations: Workstation[]; pending_jobs: number };
export type NewPrinter = { label: string; mac_address: string; model: string; location: string };
// One printer's queue, newest first. The error is a code, never server text.
export type PrinterJob = { id: string; status: string; source_type: string | null; attempts: number; created_at: string | null; started_at: string | null; completed_at: string | null; error_code: string | null; attempt_error_code: string | null };
export type PrinterJobsPage = { jobs: PrinterJob[]; total: number; limit: number; offset: number };

export class PsError extends Error {
  constructor(public key: string) { super(key); }
}
const codes: Record<string, string> = {
  label_required: 'ps.error.labelRequired', invalid_mac: 'ps.error.invalidMac', no_active_print_server: 'ps.error.noActivePrintServer',
  mac_already_registered: 'ps.error.macAlreadyRegistered', label_already_used: 'ps.error.labelAlreadyUsed',
  printer_not_on_ps_route: 'ps.error.printerNotOnPsRoute', printer_in_use: 'ps.error.printerInUse', printer_not_found: 'ps.error.printerNotFound',
  ca_cert_invalid: 'ps.error.invalidCert',
  no_ca_cert_reported: 'ps.error.noCaCert', print_server_not_found: 'ps.error.printServerNotFound', venue_not_found: 'ps.error.venueNotFound',
  command_not_found: 'ps.error.commandNotFound', printer_paused: 'ps.error.printerPaused',
  forbidden: 'accessDenied', not_authorized: 'accessDenied', access_denied: 'accessDenied',
};
// Known backend slugs become localized keys; raw server text is never shown.
export function psErrorKey(error: unknown): string { return error instanceof PsError ? error.key : errorCode(error); }
export function psErrorFromCode(code: unknown): PsError | PortalError {
  const key = typeof code === 'string' ? codes[code] : undefined;
  return key ? new PsError(key) : new PortalError('genericError');
}

type Raw = Record<string, unknown>;
const bad = (): never => { throw new PortalError('genericError'); };
const str = (v: unknown) => typeof v === 'string' && v !== '' ? v : null;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const count = (v: unknown) => Math.max(0, num(v) ?? 0);
const bool = (v: unknown) => typeof v === 'boolean' ? v : null;
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

function lastStatus(v: unknown): PsLastStatus | null {
  const s = obj(v);
  return s ? { uptime_seconds: num(s.uptime_seconds), queue_depth: num(s.queue_depth), portal_url: str(s.portal_url), note: str(s.note) } : null;
}
function pendingEnrollment(v: unknown): PsPendingEnrollment | null {
  const p = obj(v);
  if (!p) return null;
  return typeof p.id === 'string' ? { id: p.id, label: str(p.label), expires_at: str(p.expires_at), created_at: str(p.created_at) } : bad();
}
function fleetServer(v: unknown): FleetServer | null {
  const s = obj(v);
  if (!s) return null;
  if (typeof s.id !== 'string') return bad();
  return { id: s.id, label: str(s.label), status: str(s.status) ?? 'active', device_id: str(s.device_id), hostname: str(s.hostname),
    software_version: str(s.software_version), local_address: str(s.local_address), local_port: num(s.local_port),
    enrolled_at: str(s.enrolled_at), last_seen_at: str(s.last_seen_at), last_status_at: str(s.last_status_at), last_status: lastStatus(s.last_status),
    channel_opened_at: str(s.channel_opened_at), online: s.online === true, ca_cert_available: s.ca_cert_available === true, ca_cert_fingerprint: str(s.ca_cert_fingerprint) };
}
export function projectFleetRow(v: unknown): FleetRow {
  const r = obj(v);
  if (!r || typeof r.venue_id !== 'string' || typeof r.venue_name !== 'string') return bad();
  return { venue_id: r.venue_id, venue_name: r.venue_name, venue_slug: str(r.venue_slug), venue_is_active: bool(r.venue_is_active),
    print_server: fleetServer(r.print_server), pending_enrollment: pendingEnrollment(r.pending_enrollment),
    revoked_count: count(r.revoked_count), last_revoked_at: str(r.last_revoked_at),
    printers_total: count(r.printers_total), printers_active: count(r.printers_active), printers_paused: count(r.printers_paused),
    printers_with_error: count(r.printers_with_error), pending_jobs: count(r.pending_jobs) };
}
function workstation(v: unknown): Workstation {
  const w = obj(v);
  return w && typeof w.id === 'string' ? { id: w.id, name: str(w.name) ?? w.id } : bad();
}
function printer(v: unknown): PanelPrinter {
  const p = obj(v);
  if (!p || typeof p.id !== 'string') return bad();
  const report = obj(p.last_report);
  return { id: p.id, label: str(p.label) ?? '', location: str(p.location), model: str(p.model), mac_address: str(p.mac_address), paper_width_chars: num(p.paper_width_chars),
    is_active: p.is_active === true, print_route: str(p.print_route), last_seen_at: str(p.last_seen_at), last_error: str(p.last_error),
    last_report: report ? { reachable: bool(report.reachable), local_address: str(report.local_address), model: str(report.model), state: str(report.state), error: str(report.error), reported_at: str(report.reported_at) } : null,
    last_report_at: str(p.last_report_at), pending_jobs: count(p.pending_jobs), workstations: list(p.workstations).map(workstation), created_at: str(p.created_at) };
}
function scanResult(v: unknown): ScanResult | null {
  const r = obj(v);
  if (!r) return null;
  const candidates = list(r.candidates).map(item => {
    const c = obj(item) ?? bad();
    return { mac_address: str(c.mac_address), local_address: str(c.local_address), model: str(c.model), hostname: str(c.hostname), port: num(c.port), reachable: bool(c.reachable), printer_id: str(c.printer_id) };
  });
  return { candidates, count: num(r.count) ?? candidates.length, scanned_at: str(r.scanned_at), network: str(r.network) };
}
export function projectScan(v: unknown): PanelScan | null {
  const s = obj(v);
  if (!s) return null;
  if (typeof s.command_id !== 'string' || typeof s.status !== 'string') return bad();
  return { command_id: s.command_id, status: s.status, created_at: str(s.created_at), expires_at: str(s.expires_at), completed_at: str(s.completed_at),
    result: scanResult(s.result), error_code: str(s.error_code), error_detail: str(s.error_detail) };
}
// Codes are short slugs; anything else (free text, a payload, a token) becomes 'other'.
const code = (v: unknown) => v === null || v === undefined ? null : typeof v === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(v) ? v : 'other';
export function projectPrinterJobs(v: unknown): PrinterJobsPage {
  const r = obj(v);
  if (!r || !Array.isArray(r.jobs)) return bad();
  const jobs = r.jobs.map(item => {
    const j = obj(item);
    if (!j || typeof j.id !== 'string' || typeof j.status !== 'string') return bad();
    return { id: j.id, status: j.status, source_type: code(j.source_type), attempts: count(j.attempts), created_at: str(j.created_at), started_at: str(j.started_at),
      completed_at: str(j.completed_at), error_code: code(j.error_code), attempt_error_code: code(j.attempt_error_code) };
  });
  return { jobs, total: Math.max(count(r.total), jobs.length), limit: Math.max(1, num(r.limit) ?? jobs.length), offset: count(r.offset) };
}
export function projectPanelState(v: unknown): PanelState {
  const s = obj(v);
  if (!s || typeof s.venue_id !== 'string') return bad();
  const server = fleetServer(s.print_server);
  return { venue_id: s.venue_id, can_manage: s.can_manage === true, server_time: str(s.server_time),
    print_server: server && { ...server, ca_cert_updated_at: str(obj(s.print_server)?.ca_cert_updated_at), ca_cert_der_sha256: str(obj(s.print_server)?.ca_cert_der_sha256), ca_cert_status: obj(s.print_server)?.ca_cert_status === 'reported' ? 'reported' : 'pending' },
    pending_enrollment: pendingEnrollment(s.pending_enrollment), printers: list(s.printers).map(printer), last_scan: projectScan(s.last_scan) };
}

async function rpc(name: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
  const req = supabase.rpc(name, params);
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  return data;
}
// Write RPCs answer {ok:true,...} or {ok:false,error:'slug'}.
async function action(name: string, params: Record<string, unknown>): Promise<Raw> {
  const data = obj(await rpc(name, params)) ?? bad();
  if (data.ok !== true) throw psErrorFromCode(data.error);
  return data;
}
export async function getInventory(signal?: AbortSignal): Promise<Inventory> {
  return projectInventory(await rpc('portal_ps_inventory', {}, signal));
}
export async function getFleet(signal?: AbortSignal): Promise<FleetRow[]> {
  const data = await rpc('portal_ps_fleet', {}, signal);
  return Array.isArray(data) ? data.map(projectFleetRow) : bad();
}
export async function getPanelState(venueId: string, signal?: AbortSignal, scope: 'owner' | 'admin' = 'admin'): Promise<PanelState | null> {
  const data = await rpc('ps_panel_state', { p_venue_id: venueId }, signal);
  if (data === null) return null;
  const state = projectPanelState(data);
  if (state.venue_id !== venueId) throw new PortalError('accessDenied');
  // Device notes are not part of the owner view; omit them before caching.
  if (scope === 'owner' && state.print_server?.last_status) state.print_server.last_status.note = null;
  return state;
}
export async function createEnrollment(venueId: string, label: string): Promise<Enrollment> {
  const data = await action('ps_panel_create_enrollment', { p_venue_id: venueId, p_label: label.trim() || null, p_ttl_minutes: 60 });
  return typeof data.enrollment_code === 'string' && data.enrollment_code
    ? { print_server_id: str(data.print_server_id), enrollment_code: data.enrollment_code, expires_at: str(data.expires_at) } : bad();
}
export async function revokePrintServer(printServerId: string): Promise<{ jobs_cancelled: number }> {
  const data = await action('ps_panel_revoke', { p_print_server_id: printServerId, p_reason: 'portal_admin' });
  return { jobs_cancelled: count(data.jobs_cancelled) };
}
// Public certificate only. Anything that looks like key material is refused here,
// before it can reach a component or a file.
export async function getCaCert(venueId: string): Promise<CertDownload> {
  const data = await action('ps_panel_ca_cert', { p_venue_id: venueId });
  const pem = typeof data.ca_cert_pem === 'string' ? data.ca_cert_pem : '';
  if (/PRIVATE\s+KEY/i.test(pem)) throw new PsError('ps.error.privateKeyRefused');
  let computed: string;
  try { computed = await certificateDerFingerprint(pem); }
  catch { throw new PsError('ps.error.invalidCert'); }
  if (data.ca_cert_status !== 'reported' || !formatFingerprint(str(data.ca_cert_der_sha256)) ||
      formatFingerprint(computed) !== formatFingerprint(str(data.ca_cert_der_sha256))) throw new PsError('ps.error.invalidCert');
  return { pem, filename: certificateFilename(venueId), derFingerprint: computed,
    pemSha256: str(data.ca_cert_pem_sha256), fingerprint: str(data.ca_cert_fingerprint), updated_at: str(data.ca_cert_updated_at) };
}
export async function requestScan(venueId: string): Promise<ScanRequest> {
  const data = await action('ps_panel_request_scan', { p_venue_id: venueId });
  return typeof data.command_id === 'string'
    ? { command_id: data.command_id, status: str(data.status) ?? 'pending', already: data.already === true, expires_at: str(data.expires_at), ps_online: data.ps_online === true } : bad();
}
export async function getCommand(commandId: string): Promise<PanelScan> {
  const data = await action('ps_panel_command', { p_command_id: commandId });
  return projectScan(data) ?? bad();
}
// Read-only: both ids travel together, so the backend never answers with another venue's or printer's jobs.
export async function getPrinterJobs(venueId: string, printerId: string, limit: number, offset: number): Promise<PrinterJobsPage> {
  return projectPrinterJobs(await action('ps_panel_printer_jobs', { p_venue_id: venueId, p_printer_id: printerId, p_limit: limit, p_offset: offset }));
}
export async function addPrinter(venueId: string, input: NewPrinter): Promise<{ id: string | null; label: string | null }> {
  const data = await action('ps_panel_add_printer', { p_venue_id: venueId, p_label: input.label.trim(), p_mac_address: input.mac_address.trim(),
    p_model: input.model.trim() || null, p_location: input.location.trim() || null });
  const created = obj(data.printer);
  return { id: str(created?.id), label: str(created?.label) };
}
export async function renamePrinter(printerId: string, label: string): Promise<void> {
  await action('ps_panel_update_printer', { p_printer_id: printerId, p_label: label.trim() });
}
export async function setPrinterActive(printerId: string, active: boolean): Promise<void> {
  await action('ps_panel_set_printer_active', { p_printer_id: printerId, p_active: active });
}
export async function testPrint(printerId: string): Promise<{ job_id: string | null }> {
  const data = await action('ps_panel_test_print', { p_printer_id: printerId, p_note: 'portal' });
  return { job_id: str(data.job_id) };
}
// Without force the backend refuses a printer that workstations or queued jobs
// still use and says which; the caller asks again before forcing.
export async function removePrinter(printerId: string, force: boolean): Promise<RemoveResult> {
  const data = obj(await rpc('ps_panel_remove_printer', { p_printer_id: printerId, p_force: force })) ?? bad();
  if (data.ok === true) return { removed: true };
  if (data.error === 'printer_in_use' && !force) return { removed: false, workstations: list(data.workstations).map(workstation), pending_jobs: count(data.pending_jobs) };
  throw psErrorFromCode(data.error);
}
export const printServerApi = { createEnrollment, revokePrintServer, getCaCert, requestScan, getCommand, getPrinterJobs, addPrinter, renamePrinter, setPrinterActive, testPrint, removePrinter };
export type PrintServerApi = typeof printServerApi;
// Wraps every call so the route can react to a failure (expired session, lost
// permission) without the page knowing about authentication.
export function withFailureHook(api: PrintServerApi, onFailure: (key: string) => Promise<void> | void): PrintServerApi {
  const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    try { return await fn(...args); }
    catch (error) { await onFailure(psErrorKey(error)); throw error; }
  };
  return { createEnrollment: wrap(api.createEnrollment), revokePrintServer: wrap(api.revokePrintServer), getCaCert: wrap(api.getCaCert), requestScan: wrap(api.requestScan),
    getCommand: wrap(api.getCommand), getPrinterJobs: wrap(api.getPrinterJobs), addPrinter: wrap(api.addPrinter), renamePrinter: wrap(api.renamePrinter), setPrinterActive: wrap(api.setPrinterActive),
    testPrint: wrap(api.testPrint), removePrinter: wrap(api.removePrinter) };
}
