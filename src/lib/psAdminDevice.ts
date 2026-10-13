import { supabase } from './supabase';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './config';
import { errorCode, PortalError } from './errors';

export type DeviceModel = { model: string; label: string; archs: string[]; default_arch: string };
export type AdminDeviceDetail = {
  device: { id: string; serial: string; hostname: string; model: string; arch: string; label: string | null; status: string; legacy: boolean; venue_id: string | null; venue_name: string | null };
  update: { current_version: string | null; latest_stable: { edition_id: string; version: string; model: string; arch: string } | null;
    update_available: boolean; reason: string | null; active_update: { deployment_id: string; status: string; stage: string | null; progress: number | null } | null };
  delete: { allowed: boolean; blockers: string[] };
};
export type NewAdminDevice = { model: string; arch: string; label: string; venue_id: string | null };
export type AdminDeviceCreated = { device: { id: string; serial: string }; assignment: { code: string; expires_at: string | null; replaces: boolean } | null };
type Raw = Record<string, unknown>;
const bad = (): never => { throw new PortalError('genericError'); };
const obj = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : bad();
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const required = (v: unknown): string => str(v) ?? bad();
const errors = ['unknown_model','arch_not_supported','unknown_venue','unknown_device','confirmation_mismatch','delete_blocked','no_stable_release','up_to_date','update_in_progress','device_not_active','edition_not_latest_stable'];
export class AdminDeviceError extends Error {
  constructor(public key: string) { super(key); }
}
export function adminDeviceErrorKey(error: unknown): string {
  return error instanceof AdminDeviceError ? error.key : errorCode(error);
}
function checked(value: unknown): Raw {
  const data = obj(value);
  if (data.ok === false) throw new AdminDeviceError(`adminDevice.error.${typeof data.error === 'string' && errors.includes(data.error) ? data.error : 'other'}`);
  if (data.ok !== true) return bad();
  return data;
}
async function rpc(name: string, params: Raw = {}, signal?: AbortSignal): Promise<Raw> {
  const request = supabase.rpc(name, params);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return checked(data);
}
// Closed projections: credential material and raw backend errors never enter UI state.
export function projectDeviceModels(value: unknown): DeviceModel[] {
  const data = checked(value);
  if (!Array.isArray(data.models)) return bad();
  return data.models.map(value => {
    const m = obj(value);
    if (!Array.isArray(m.archs) || !m.archs.length) return bad();
    const archs = m.archs.map(required), default_arch = required(m.default_arch);
    if (!archs.includes(default_arch)) return bad();
    return { model: required(m.model), label: required(m.label), archs, default_arch };
  });
}
export function projectAdminDeviceDetail(value: unknown): AdminDeviceDetail {
  const data = checked(value), d = obj(data.device), u = obj(data.update), deletion = obj(data.delete);
  const stable = u.latest_stable == null ? null : obj(u.latest_stable), active = u.active_update == null ? null : obj(u.active_update);
  if (!Array.isArray(deletion.blockers) || typeof deletion.allowed !== 'boolean' || typeof u.update_available !== 'boolean') return bad();
  const latest = stable ? { edition_id: required(stable.edition_id), version: required(stable.version), model: required(stable.model), arch: required(stable.arch) } : null;
  const device = { id: required(d.id), serial: required(d.serial), hostname: required(d.hostname), model: required(d.model), arch: required(d.arch),
    label: str(d.label), status: required(d.status), legacy: d.legacy === true, venue_id: str(d.venue_id), venue_name: str(d.venue_name) };
  const blockers = deletion.blockers.map(required);
  return { device, update: { current_version: str(u.current_version), latest_stable: latest,
    update_available: u.update_available && !!latest && latest.model === device.model && latest.arch === device.arch && !active && !u.reason,
    reason: str(u.reason), active_update: active ? { deployment_id: required(active.deployment_id), status: required(active.status), stage: str(active.phase),
      progress: typeof active.progress === 'number' && Number.isFinite(active.progress) && active.progress >= 0 && active.progress <= 100 ? active.progress : null } : null },
    delete: { allowed: deletion.allowed && !blockers.length && !device.venue_id && !d.print_server_id && device.status !== 'assigned' && !device.legacy, blockers } };
}
export async function getDeviceModels(signal?: AbortSignal): Promise<DeviceModel[]> {
  return projectDeviceModels(await rpc('ps_admin_device_models', {}, signal));
}
export async function getAdminDeviceDetail(id: string, signal?: AbortSignal): Promise<AdminDeviceDetail> {
  return projectAdminDeviceDetail(await rpc('ps_admin_device_detail', { p_device_id: id }, signal));
}
export async function createAdminDevice(input: NewAdminDevice): Promise<AdminDeviceCreated> {
  const data = await rpc('ps_admin_device_create', { p_model: input.model, p_arch: input.arch, p_notes: null, p_label: input.label.trim() || null, p_venue_id: input.venue_id || null });
  const d = obj(data.device), assignment = data.assignment == null ? null : obj(data.assignment);
  return { device: { id: required(d.id), serial: required(d.serial) }, assignment: assignment ? {
    code: required(assignment.enrollment_code), expires_at: str(assignment.expires_at), replaces: !!assignment.replaces_device_id } : null };
}
export async function deleteAdminDevice(id: string, serial: string): Promise<void> {
  await rpc('ps_admin_device_delete', { p_device_id: id, p_confirm_serial: serial });
}
export async function updateAdminDevice(id: string, editionId: string): Promise<{ deployment_id: string }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PortalError('sessionExpired');
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ps-ota-admin`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_device', device_id: id, edition_id: editionId }) });
  } catch { throw new PortalError('networkError'); }
  if (response.status === 401) throw new PortalError('sessionExpired');
  if (response.status === 403) throw new PortalError('accessDenied');
  const data = checked(await response.json().catch(() => null));
  if (!response.ok) throw new AdminDeviceError('adminDevice.error.other');
  return { deployment_id: required(data.deployment_id) };
}
