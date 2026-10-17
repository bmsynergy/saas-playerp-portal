import { firmwareRing, type FirmwareRing } from './firmwareEligibility';
import { supabase } from './supabase';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './config';
import { errorCode, PortalError } from './errors';
import { linkAssign, projectPsLink, type PsAssignResult, type PsDeviceLink } from './psLink';
import { projectAdminOtaExtras, type AdminOtaExtras } from './psOtaDevice';

export type DeviceModel = { model: string; label: string; archs: string[]; default_arch: string; active: boolean; is_default: boolean };
export type AdminDeviceDetail = {
  device: { id: string; serial: string; hostname: string; model: string; arch: string; label: string | null; status: string; legacy: boolean; venue_id: string | null; venue_name: string | null };
  update: { current_version: string | null; latest_stable: { edition_id: string; version: string; model: string; arch: string } | null;
    candidate: {edition_id:string;version:string;signed_at:string|null;sha256_short:string|null} | null; newest_signed: null; effective_ring: FirmwareRing | null; can_update: boolean; newer_signed_unpromoted: boolean;
    update_available: boolean; reason: string | null; active_update: { deployment_id: string; status: string; stage: string | null; progress: number | null } | null;
    ota: AdminOtaExtras };
  delete: { allowed: boolean; blockers: string[] };
};
export type NewAdminDevice = { model: string; arch: string; label: string; venue_id: string | null };
export type AdminDeviceCreated = { device: { id: string; serial: string }; assignment: { code: string; expires_at: string | null; replaces: boolean } | null };
type Raw = Record<string, unknown>;
const bad = (): never => { throw new PortalError('genericError'); };
const obj = (v: unknown): Raw => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : bad();
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const required = (v: unknown): string => str(v) ?? bad();
const errors = ['same_venue','legacy_device','device_retired','device_already_assigned','device_not_assigned','move_failed','unknown_model','arch_not_supported','unknown_venue','unknown_device','confirmation_mismatch','delete_blocked','no_stable_release','up_to_date','update_in_progress','device_not_active','edition_not_latest_stable','update_changed','edition_not_candidate','confirmation_required','metadata_missing','no_general_update','ring_not_allowed',
  'newer_not_enabled','newer_incompatible','edition_not_installable','device_channel_not_enabled','not_newer','expected_channel_required','bad_expected_revision',
  // PE-473 set_channel / update_device / validate_device
  'channel_changed','group_required','group_ring_mismatch','unknown_group','invalid_channel','edition_not_selectable',
  'channel_not_canary','canary_ring_disabled','edition_lab_only','lab_build','edition_not_signed','edition_not_installed','already_confirmed','incompatible_device'];
const editionReasons = ['not_newer','ring_disabled','edition_lab_only','lab_build','canary_not_confirmed','edition_not_signed','update_in_progress','device_not_active'];
export class AdminDeviceError extends Error {
  constructor(public key: string, public blockers: string[] = [], public nextStep: 'unassign' | 'retire' | null = null) { super(key); }
}
export function adminDeviceErrorKey(error: unknown): string {
  return error instanceof AdminDeviceError ? error.key : errorCode(error);
}
function checked(value: unknown): Raw {
  const data = obj(value);
  if (data.ok === false) {
    const code = typeof data.error === 'string' ? data.error : '';
    if (code === 'delete_blocked') {
      const blockers = Array.isArray(data.blockers) ? data.blockers.filter((value): value is string => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value)) : [];
      throw new AdminDeviceError('adminDevice.error.delete_blocked', blockers, data.next_step === 'unassign' || data.next_step === 'retire' ? data.next_step : null);
    }
    if (['update_changed', 'edition_not_candidate', 'confirmation_required'].includes(code)) throw new AdminDeviceError('adminDevice.updateChanged');
    if (['metadata_missing', 'no_general_update', 'ring_not_allowed'].includes(code)) throw new AdminDeviceError(`adminDevice.reason.${code}`);
    if (code === 'edition_not_selectable' && typeof data.reason === 'string' && editionReasons.includes(data.reason)) throw new AdminDeviceError(`otaDevice.edition.reason.${data.reason}`);
    throw new AdminDeviceError(`adminDevice.error.${errors.includes(code) ? code : 'other'}`);
  }
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
  const ota=projectAdminOtaExtras(u), effective_ring=firmwareRing(u.effective_ring), rawCandidate=u.candidate==null?null:obj(u.candidate);
  const candidate=rawCandidate&&str(rawCandidate.edition_id)&&str(rawCandidate.version)&&str(rawCandidate.signed_at)
    ? {edition_id:str(rawCandidate.edition_id)!,version:str(rawCandidate.version)!,signed_at:str(rawCandidate.signed_at),sha256_short:str(rawCandidate.sha256_short)}:null;
  const metadataValid=!!ota.editions && !!effective_ring && !!ota.channel && ota.channel.ring===effective_ring;
  const reason=str(u.reason)??(active?'update_in_progress':!metadataValid?'metadata_missing':null);
  const canUpdate=metadataValid && u.can_update===true && u.update_available===true && !active && !reason && !!str(u.current_version) &&
    !!candidate && ota.editions!.some(e=>e.edition_id===candidate.edition_id&&e.selectable);
  return { device, update: { current_version: str(u.current_version), latest_stable: latest,
    candidate, newest_signed:null, effective_ring, can_update:canUpdate, newer_signed_unpromoted:u.newer_signed_unpromoted===true,
    update_available:canUpdate,
    reason, active_update: active ? { deployment_id: required(active.deployment_id), status: required(active.status), stage: str(active.phase),
      progress: typeof active.progress === 'number' && Number.isFinite(active.progress) && active.progress >= 0 && active.progress <= 100 ? active.progress : null } : null,
    ota },
    delete: { allowed: deletion.allowed && !blockers.length && !device.venue_id && !d.print_server_id && device.status === 'retired' && !device.legacy, blockers } };
}
export async function getDeviceModels(signal?: AbortSignal): Promise<DeviceModel[]> {
  return projectDeviceModels(await rpc('ps_admin_device_models', {}, signal));
}
export async function getAdminDeviceDetail(id: string, signal?: AbortSignal): Promise<AdminDeviceDetail> {
  const detail = projectAdminDeviceDetail(await rpc('ps_admin_device_detail', { p_device_id: id }, signal));
  if (detail.device.id !== id) throw new PortalError('accessDenied');
  return detail;
}
export async function createAdminDevice(input: NewAdminDevice): Promise<AdminDeviceCreated> {
  const data = await rpc('ps_admin_device_create', { p_model: input.model, p_arch: input.arch, p_notes: null, p_label: input.label.trim() || null, p_venue_id: input.venue_id || null });
  const d = obj(data.device), assignment = data.assignment == null ? null : obj(data.assignment);
  // PE-462: creating with a venue may no longer issue a code; only a real code is shown.
  return { device: { id: required(d.id), serial: required(d.serial) }, assignment: assignment && str(assignment.enrollment_code) ? {
    code: required(assignment.enrollment_code), expires_at: str(assignment.expires_at), replaces: !!assignment.replaces_device_id } : null };
}
export async function deleteAdminDevice(id: string, serial: string): Promise<void> {
  await rpc('ps_admin_device_delete', { p_device_id: id, p_confirm_serial: serial });
}
// All OTA admin actions go to the edge with the signed-in staff JWT; the server repeats every check.
async function postOtaAdmin(body: Raw): Promise<Raw> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PortalError('sessionExpired');
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ps-ota-admin`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body) });
  } catch { throw new PortalError('networkError'); }
  if (response.status === 401) throw new PortalError('sessionExpired');
  if (response.status === 403) throw new PortalError('accessDenied');
  const data = checked(await response.json().catch(() => null));
  if (!response.ok) throw new AdminDeviceError('adminDevice.error.other');
  return data;
}
async function sessionOrThrow(): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) throw new PortalError('sessionExpired');
}
export async function updateAdminDevice(id: string, editionId: string, expectedInstalled?: string | null): Promise<{ deployment_id: string }> {
  await sessionOrThrow();
  const fresh = await getAdminDeviceDetail(id);
  const editions = fresh.update.ota.editions;
  // PE-474: only server-listed installable editions from a current v2 snapshot.
  const allowed = fresh.update.can_update && !!editions?.some(e => e.edition_id === editionId && e.selectable) && !fresh.update.active_update;
  if (fresh.device.id !== id || !allowed || !expectedInstalled || fresh.update.current_version !== expectedInstalled) throw new AdminDeviceError('adminDevice.updateChanged');
  const data = await postOtaAdmin({ action: 'update_device', device_id: id, edition_id: editionId, expected_installed_version: expectedInstalled });
  return { deployment_id: required(data.deployment_id) };
}
// Channel changes use the displayed optimistic snapshot and never touch groups.
export async function setAdminDeviceChannel(id:string,channel:FirmwareRing,expectedChannel:FirmwareRing,expectedRevision:number):Promise<{changed:boolean}> {
  return changeChannel({device_id:id},channel,expectedChannel,expectedRevision);
}
export async function setPrintServerChannel(id:string,channel:FirmwareRing,expectedChannel:FirmwareRing,expectedRevision:number):Promise<{changed:boolean}> {
  return changeChannel({print_server_id:id},channel,expectedChannel,expectedRevision);
}
async function changeChannel(identity:Raw,channel:FirmwareRing,expectedChannel:FirmwareRing,expectedRevision:number):Promise<{changed:boolean}> {
  if (!firmwareRing(channel)||!firmwareRing(expectedChannel)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0) throw new AdminDeviceError('adminDevice.error.channel_changed');
  const data=await postOtaAdmin({action:'set_channel',...identity,channel,expected_channel:expectedChannel,expected_revision:expectedRevision});
  return {changed:data.changed===true};
}
// Asks the device to prove (signature + health) that it runs this exact edition; nothing is downloaded or installed.
export async function validateAdminDevice(id: string, editionId: string, expectedInstalled: string): Promise<{ target_id: string }> {
  const data = await postOtaAdmin({ action: 'validate_device', device_id: id, edition_id: editionId, expected_installed_version: expectedInstalled });
  return { target_id: required(data.target_id) };
}

export type DeviceModelCatalog = { models: DeviceModel[]; default: { model: string; label: string; arch: string } | null };
export type ManageAction = { allowed: boolean; reason: string | null };
export type AdminDeviceManage = AdminDeviceDetail & { actions: Record<'assign' | 'move' | 'unassign' | 'retire' | 'delete' | 'prepare', ManageAction>; link?: PsDeviceLink };
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
  const action = (key: 'assign' | 'move' | 'unassign' | 'retire' | 'delete' | 'prepare'): ManageAction => {
    if ((key === 'retire' || key === 'prepare') && actions[key] == null) return { allowed: false, reason: 'contract_unavailable' };
    const raw = obj(actions[key]);
    const reason = str(raw.reason);
    // Do not render unstructured backend reasons or relax the detail deletion guard.
    const safeReason = reason && /^[a-z][a-z0-9_]{0,63}$/.test(reason) ? reason : reason ? 'other' : null;
    const allowed = raw.allowed === true && !reason && !detail.device.legacy && (key === 'delete' || detail.device.status !== 'retired') && (key !== 'delete' || (detail.delete.allowed && raw.confirm_with === 'serial'))
      && (key !== 'retire' || (raw.confirm_with === 'serial' && raw.revoke_reason === 'retired' && detail.device.status !== 'retired' && !detail.device.legacy));
    return { allowed, reason: safeReason };
  };
  return { ...detail, actions: { assign: action('assign'), move: action('move'), unassign: action('unassign'), retire: action('retire'), delete: action('delete'), prepare: action('prepare') }, link: projectPsLink(data.link) ?? undefined };
}
export async function getAdminDeviceManage(id: string, signal?: AbortSignal): Promise<AdminDeviceManage> {
  const detail = projectAdminDeviceManage(await rpc('ps_admin_device_manage', { p_device_id: id }, signal));
  if (detail.device.id !== id) throw new PortalError('accessDenied');
  return detail;
}
export async function moveAdminDevice(id: string, venueId: string): Promise<PsAssignResult> {
  return linkAssign('ps_admin_device_move', id, venueId);
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
