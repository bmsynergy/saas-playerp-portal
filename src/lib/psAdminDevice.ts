import { firmwareBlockReason } from './firmwareEligibility';
import { supabase } from './supabase';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './config';
import { errorCode, PortalError } from './errors';

export type DeviceModel = { model: string; label: string; archs: string[]; default_arch: string; active: boolean; is_default: boolean };
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
const errors = ['same_venue','legacy_device','device_retired','device_already_assigned','device_not_assigned','move_failed','unknown_model','arch_not_supported','unknown_venue','unknown_device','confirmation_mismatch','delete_blocked','no_stable_release','up_to_date','update_in_progress','device_not_active','edition_not_latest_stable'];
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
    return { model: required(m.model), label: required(m.label), archs, default_arch, active: m.active === true, is_default: m.is_default === true };
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
  const reason = firmwareBlockReason(str(u.current_version), latest, device.model, device.arch, u.update_available === true, str(u.reason)) ?? (active ? 'update_in_progress' : null);
  return { device, update: { current_version: str(u.current_version), latest_stable: latest,
    update_available: u.update_available && !!latest && !active && !reason,
    reason, active_update: active ? { deployment_id: required(active.deployment_id), status: required(active.status), stage: str(active.phase),
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
export async function updateAdminDevice(id: string, editionId: string, expectedInstalled?: string | null): Promise<{ deployment_id: string }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PortalError('sessionExpired');
  const fresh = await getAdminDeviceDetail(id);
  if (fresh.device.id !== id || !fresh.update.update_available || fresh.update.latest_stable?.edition_id !== editionId || (expectedInstalled !== undefined && fresh.update.current_version !== expectedInstalled)) throw new AdminDeviceError('adminDevice.updateChanged');
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

export type DeviceModelCatalog = { models: DeviceModel[]; default: { model: string; label: string; arch: string } | null };
export type ManageAction = { allowed: boolean; reason: string | null };
export type AdminDeviceManage = AdminDeviceDetail & { actions: Record<'assign' | 'move' | 'unassign' | 'delete', ManageAction> };
export type AdminVenueOption = { id: string; name: string; slug: string | null; city: string | null; state: string | null; is_active: boolean; assigned_device: { id: string; serial: string } | null };

export function projectDeviceModelCatalog(value: unknown): DeviceModelCatalog {
  const data = checked(value);
  const models = projectDeviceModels(value).filter(model => model.active);
  if (data.default == null) return { models, default: null };
  const choice = obj(data.default), model = models.find(model => model.model === choice.model && model.is_default);
  if (!model || choice.arch !== model.default_arch || !model.archs.includes(required(choice.arch))) return bad();
  return { models, default: { model: model.model, label: model.label, arch: model.default_arch } };
}
export async function getDeviceModelCatalog(signal?: AbortSignal): Promise<DeviceModelCatalog> {
  return projectDeviceModelCatalog(await rpc('ps_admin_device_models', {}, signal));
}
export function projectAdminDeviceManage(value: unknown): AdminDeviceManage {
  const data = checked(value), detail = projectAdminDeviceDetail(value), actions = obj(data.actions);
  const action = (key: 'assign' | 'move' | 'unassign' | 'delete'): ManageAction => {
    const raw = obj(actions[key]);
    const reason = str(raw.reason);
    // Do not render unstructured backend reasons or relax the detail deletion guard.
    const safeReason = reason && /^[a-z][a-z0-9_]{0,63}$/.test(reason) ? reason : reason ? 'other' : null;
    const allowed = raw.allowed === true && !reason && (key !== 'delete' || (detail.delete.allowed && raw.confirm_with === 'serial'));
    return { allowed, reason: safeReason };
  };
  return { ...detail, actions: { assign: action('assign'), move: action('move'), unassign: action('unassign'), delete: action('delete') } };
}
export async function getAdminDeviceManage(id: string, signal?: AbortSignal): Promise<AdminDeviceManage> {
  return projectAdminDeviceManage(await rpc('ps_admin_device_manage', { p_device_id: id }, signal));
}
export async function moveAdminDevice(id: string, venueId: string): Promise<{ code: string; expires_at: string | null; replaces: boolean }> {
  const data = await rpc('ps_admin_device_move', { p_device_id: id, p_venue_id: venueId });
  return { code: required(data.enrollment_code), expires_at: str(data.expires_at), replaces: !!data.replaces_device_id };
}
export function projectAdminVenues(value: unknown): AdminVenueOption[] {
  const data = checked(value);
  if (!Array.isArray(data.venues)) return bad();
  return data.venues.map(value => {
    const venue = obj(value), device = venue.assigned_device == null ? null : obj(venue.assigned_device);
    return { id: required(venue.id), name: required(venue.name), slug: str(venue.slug), city: str(venue.city), state: str(venue.state),
      is_active: venue.is_active === true, assigned_device: device ? { id: required(device.id), serial: required(device.serial) } : null };
  });
}
export async function searchAdminVenues(query: string, includeVenueId?: string, signal?: AbortSignal): Promise<AdminVenueOption[]> {
  return projectAdminVenues(await rpc('ps_admin_venue_search', { p_query: query.trim() || null, p_limit: 20, p_include_venue_id: includeVenueId || null }, signal));
}
