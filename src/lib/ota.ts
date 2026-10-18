import { compareFirmware, type StableFirmware } from './firmwareEligibility';
import { projectFirmwareRelease, type FirmwareRelease } from './firmware';
import { utcBounds } from './adminLists';
import { supabase } from './supabase';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './config';
import { PortalError } from './errors';
import { PsError } from './printServerApi';
import { projectFirmwareLifecycle, type FirmwareLifecycle, type FirmwareConfirmation } from './firmwareLifecycle';

// OTA of the Print Server app (PE-385). Platform Admin only for the overview, signing and
// deployments; owners use a separate venue-scoped General-only action. Every answer is rebuilt field by
// field: unknown keys are never copied into state or the query cache.
export type Ring = 'lab' | 'canary' | 'general';
export const RINGS: Ring[] = ['lab', 'canary', 'general'];
export type OtaKey = { key_id: string; public_key_b64: string | null; active: boolean };
export type OtaRelease = {
  id: string; version: string; revision: string | null; model: string; arch: string; filename: string; sha256: string | null; size_bytes: number | null;
  created_at: string | null; edition_id: string | null; edition_status: 'preparing' | 'signed' | null; signed_at: string | null; key_id: string | null; canary_confirmed_at: string | null;
  lifecycle: FirmwareLifecycle | null;
};
export type OtaGroup = { id: string; name: string; ring: Ring; created_at: string | null; member_count: number; kind: 'deployment' };
export type OtaTarget = {
  id: string; deployment_id: string | null; print_server_id: string; edition_id: string | null; from_version: string | null; desired_version: string | null;
  installed_version: string | null; status: string; phase: string | null; progress: number | null; error_code: string | null; error_detail: string | null;
  signed: boolean; issued_at: string | null; expires_at: string | null; offered_at: string | null; updated_at: string | null;
  venue_name: string | null; hostname: string | null;
};
export type OtaDevice = {
  print_server_id: string; venue_id: string | null; venue_name: string | null; hostname: string | null; serial: string | null; model: string | null;
  installed_version: string | null; last_seen_at: string | null; online: boolean; target: OtaTarget | null;
};
export type OtaDeployment = {
  id: string; ring: Ring | null; group_id: string | null; group_name: string | null; edition_id: string | null; version: string | null;
  created_at: string | null; created_by_email: string | null; targets: OtaTarget[];
};
export type OtaAudit = { at: string | null; action: string; target_type: string | null; target_id: string | null; metadata: string | null; actor_email: string | null };
export type OtaOverview = { contract_version: 2; server_time: string | null; keys: OtaKey[]; totals: { releases:number; devices:number; deployments:number; open_targets:number; channels:Record<string,number> }; groups: OtaGroup[]; deployments: OtaDeploymentItem[]; audit: OtaAudit[] };
export type OtaEvent = { id: string; phase: string | null; status: string | null; progress: number | null; error_code: string | null; error_detail: string | null; detail: string | null; created_at: string | null };
export type PanelOta = { candidate: {edition_id:string;version:string;signed_at:string} | null; model: string | null; arch: string | null; latest_stable: StableFirmware | null; availability: 'available' | 'unavailable' | 'unknown'; reason: string | null; can_update: boolean; device_id: string | null; newer_signed_unpromoted: boolean; print_server_id: string; hostname: string | null; installed_version: string | null; desired_version: string | null; status: string; phase: string | null; progress: number | null; updated_at: string | null };

type Raw = Record<string, unknown>;
const bad = (): never => { throw new PortalError('genericError'); };
const str = (v: unknown) => typeof v === 'string' && v !== '' ? v : null;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const ring = (v: unknown): Ring | null => v === 'lab' || v === 'canary' || v === 'general' ? v : null;
const slug = (v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(v) ? v : null;
const pct = (v: unknown) => { const n = num(v); return n === null ? null : Math.max(0, Math.min(100, Math.round(n))); };
const text = (v: unknown) => v == null ? null : typeof v === 'string' ? (v || null) : JSON.stringify(v);

function target(v: unknown): OtaTarget {
  const t = obj(v) ?? bad();
  if (typeof t.id !== 'string') return bad();
  return { id: t.id, deployment_id: str(t.deployment_id), print_server_id: String(t.print_server_id ?? ''), edition_id: str(t.edition_id),
    from_version: str(t.from_version), desired_version: str(t.desired_version), installed_version: str(t.installed_version),
    status: str(t.status) ?? 'unknown', phase: str(t.phase), progress: pct(t.progress), error_code: str(t.error_code), error_detail: str(t.error_detail),
    signed: t.signed === true, issued_at: str(t.issued_at), expires_at: str(t.expires_at), offered_at: str(t.offered_at), updated_at: str(t.updated_at),
    venue_name: str(t.venue_name), hostname: str(t.hostname) };
}
export function projectOverview(v: unknown): OtaOverview {
  const d = obj(v) ?? bad(), totals = obj(d.totals) ?? bad();
  if (d.ok !== true || d.contract_version !== 2 || ['keys','groups','deployments'].some(key=>!Array.isArray(d[key])) ||
    list(d.groups).length > 100 || list(d.deployments).length > 10 ||
    (!Array.isArray(d.audit) && !(d.audit_included === false && d.audit === undefined))) return bad();
  return {
    contract_version: 2, server_time: str(d.server_time),
    totals: { releases: num(totals.releases) ?? 0, devices: num(totals.devices) ?? 0, deployments: num(totals.deployments) ?? 0, open_targets: num(totals.open_targets) ?? 0, channels: counts(totals.channels) },
    keys: list(d.keys).map(item => { const k = obj(item) ?? bad(); return { key_id: String(k.key_id ?? ''), public_key_b64: str(k.public_key_b64), active: k.active === true }; }),
    groups: list(d.groups).map(item => {
      const g = obj(item) ?? bad();
      if (typeof g.id !== 'string' || g.kind !== 'deployment' || !ring(g.ring) || !Number.isSafeInteger(g.member_count) || Number(g.member_count)<0) return bad();
      return { id: g.id, name: String(g.name ?? ''), ring: ring(g.ring)!, created_at: str(g.created_at), member_count: Number(g.member_count), kind: 'deployment' };
    }),
    deployments: list(d.deployments).map(item => {
      const p = obj(item) ?? bad(); if (typeof p.id !== 'string') return bad();
      const target_by_status = counts(p.target_counts);
      return { id:p.id, ring:ring(p.ring), group_id:str(p.group_id), group_name:str(p.group_name), edition_id:str(p.edition_id), version:str(p.version),
        created_at:str(p.created_at), created_by_email:str(p.created_by_email), target_by_status, target_count:Object.values(target_by_status).reduce((a,b)=>a+b,0) };
    }),
    audit: list(d.audit).map(item => { const a=obj(item)??bad(); return {at:str(a.at),action:String(a.action??''),target_type:str(a.target_type),target_id:str(a.target_id),metadata:text(a.metadata),actor_email:str(a.actor_email)}; }),
  };
}

async function rpc(name: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
  const req = supabase.rpc(name, params);
  const { data, error } = await (signal ? req.abortSignal(signal) : req);
  if (error) throw error;
  return data;
}
const groupErrors: Record<string, string> = { invalid_ring: 'ota.error.invalidRing', invalid_name: 'ota.error.invalidName', duplicate_name: 'ota.error.duplicateName' };
const fnErrors: Record<string, string> = {
  device_channel_not_enabled: 'adminDevice.error.device_channel_not_enabled', not_newer: 'adminDevice.error.not_newer', newer_not_enabled: 'adminDevice.reason.newer_not_enabled', newer_incompatible: 'adminDevice.reason.newer_incompatible', edition_not_installable: 'adminDevice.error.edition_not_installable',
  update_changed: 'adminDevice.updateChanged', edition_not_general: 'adminDevice.updateChanged', no_general_update: 'adminDevice.reason.no_general_update', up_to_date: 'adminDevice.reason.up_to_date', update_in_progress: 'adminDevice.reason.update_in_progress', metadata_missing: 'adminDevice.reason.metadata_missing',
  canary_not_confirmed: 'ota.error.canaryNotConfirmed', ring_requires_group: 'ota.error.ringRequiresGroup', already_signed: 'ota.error.alreadySigned', forbidden: 'accessDenied',
  confirmation_required: 'fw.lifecycle.error.confirmationRequired', release_changed: 'fw.lifecycle.error.releaseChanged',
  availability_changed: 'fw.lifecycle.error.availabilityChanged', edition_retired: 'fw.lifecycle.error.retired',
  ring_disabled: 'fw.lifecycle.error.ringDisabled', edition_lab_only: 'fw.lifecycle.error.labOnly',
  edition_not_signed: 'fw.lifecycle.error.notSigned', incompatible_device: 'fw.lifecycle.error.incompatible',
  release_not_ready: 'fw.lifecycle.reason.release_not_ready', lab_build: 'fw.lifecycle.reason.lab_build',
  revision_not_general: 'fw.lifecycle.reason.revision_not_general',
};
async function action(name: string, params: Record<string, unknown>): Promise<Raw> {
  const data = obj(await rpc(name, params)) ?? bad();
  if (data.ok !== true) throw new PsError((typeof data.error === 'string' && groupErrors[data.error]) || 'ota.error.other');
  return data;
}

export async function getOtaOverview(signal?: AbortSignal): Promise<OtaOverview> {
  return projectOverview(await rpc('ps_ota_admin_overview', { p_include_audit: false }, signal));
}
export async function getTargetEvents(targetId: string, signal?: AbortSignal): Promise<OtaEvent[]> {
  const data = obj(await rpc('ps_ota_target_events', { p_target_id: targetId }, signal)) ?? bad();
  if (data.ok !== true) throw new PsError('ota.error.other');
  return list(data.events).map(item => {
    const e = obj(item) ?? bad();
    return { id: String(e.id ?? ''), phase: str(e.phase), status: str(e.status), progress: pct(e.progress), error_code: str(e.error_code), error_detail: str(e.error_detail), detail: text(e.detail), created_at: str(e.created_at) };
  });
}
export async function createGroup(name: string, r: Ring): Promise<void> {
  await action('ps_ota_group_create', { p_name: name.trim(), p_ring: r });
}
export async function setGroupMembers(groupId: string, ids: string[]): Promise<void> {
  await action('ps_ota_group_set_members', { p_group_id: groupId, p_print_server_ids: ids });
}

export class OtaActionError extends PsError {
  constructor(key:string, public code:string, public devices:{print_server_id:string;channel:Ring|null;installed_version:string|null;reason:string|null}[]) { super(key); }
}
// Same call shape as ps-firmware-admin: the user's JWT, never a service key.
async function call(body: Raw): Promise<Raw> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new PortalError('sessionExpired');
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ps-ota-admin`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLIC_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new PortalError('networkError'); }
  const data = await response.json().catch(() => null) as Raw | null;
  if (response.status === 401) throw new PortalError('sessionExpired');
  if (response.status === 403) throw new PortalError('accessDenied');
  if (!response.ok || !data || data.ok !== true) {
    const code = typeof data?.error === 'string' ? data.error : '';
    throw new OtaActionError(fnErrors[code] ?? 'ota.error.other', code, list(data?.devices).map(v => { const d=obj(v)??{}; return {print_server_id:str(d.print_server_id)??'',channel:ring(d.channel),installed_version:str(d.installed_version),reason:slug(d.reason)}; }));
  }
  return data;
}
export async function signEdition(releaseId: string, confirmation: FirmwareConfirmation): Promise<{ version: string | null; key_id: string | null }> {
  const data = await call({ action: 'sign', release_id: releaseId, confirmation });
  return { version: str(data.version), key_id: str(data.key_id) };
}
export type DeployTarget = { group_id: string } | { ring: Ring; print_server_ids: string[] };
export async function deployEdition(editionId: string, to: DeployTarget): Promise<{ targets: number }> {
  const data = await call({ action: 'deploy', edition_id: editionId, ...to });
  return { targets: Array.isArray(data.targets) ? data.targets.length : num(data.targets) ?? 0 };
}

export async function getPanelOta(venueId: string, signal?: AbortSignal, printServerId?: string | null): Promise<PanelOta[]> {
  const data = obj(await rpc('ps_panel_ota', { p_venue_id: venueId, ...(printServerId ? { p_print_server_id: printServerId } : {}) }, signal)) ?? bad();
  if (data.ok !== true) throw new PsError('ota.error.other');
  return list(data.print_servers).map(item => {
    const p = obj(item) ?? bad();
    const u = obj(p.update), latest = obj(u?.latest_stable), rawCandidate=obj(u?.candidate);
    const model = str(p.model), arch = str(p.arch), current=str(u?.current_version)??str(p.installed_version);
    const stable = latest && str(latest.edition_id) && str(latest.version) && str(latest.model) && str(latest.arch)
      ? { edition_id: str(latest.edition_id)!, version: str(latest.version)!, model: str(latest.model)!, arch: str(latest.arch)! } : null;
    const candidate = rawCandidate && str(rawCandidate.edition_id) && str(rawCandidate.version) && str(rawCandidate.signed_at)
      ? {edition_id:str(rawCandidate.edition_id)!,version:str(rawCandidate.version)!,signed_at:str(rawCandidate.signed_at)!} : null;
    const reason=str(u?.reason)??(!u || !model || !arch || !current || (u.update_available===true&&!candidate)?'metadata_missing':null);
    const compatible = stable && stable.model === model && stable.arch === arch ? stable : null;
    return { candidate, model, arch, latest_stable: compatible,
      availability: !u || reason==='metadata_missing' ? 'unknown' : reason==='no_stable_release' ? 'unavailable' : 'available', reason,
      can_update:u?.can_update===true && u.update_available===true && !u.active_update && !reason && !!model && !!arch && !!candidate && compareFirmware(candidate.version,current)===1 && !!str(u.device_id),
      device_id:str(u?.device_id),newer_signed_unpromoted:u?.newer_signed_unpromoted===true,
      print_server_id: String(p.print_server_id ?? ''), hostname: str(p.hostname), installed_version: str(p.installed_version), desired_version: str(p.desired_version),
      status: slug(p.status) ?? 'none', phase: slug(p.phase), progress: pct(p.progress), updated_at: str(p.updated_at) };
  });
}

// Re-read the exact venue/device before confirmation; the server repeats all checks atomically.
export async function updateOwnedDevice(venueId: string, deviceId: string, editionId: string, expectedInstalled: string, printServerId?: string | null): Promise<void> {
  const fresh = (await getPanelOta(venueId, undefined, printServerId)).find(p => p.device_id === deviceId && (!printServerId || p.print_server_id === printServerId));
  if (!fresh?.can_update || fresh.candidate?.edition_id !== editionId || !expectedInstalled || fresh.installed_version !== expectedInstalled) throw new PsError('adminDevice.updateChanged');
  await call({action: 'update_owned_device', venue_id: venueId, device_id: deviceId, edition_id: editionId, expected_installed_version: expectedInstalled});
}

// A target is "Restored" when the device rolled back to its previous version on its own.
export const ACTIVE_STATUSES = ['pending', 'in_progress'];
export function statusClass(status: string): string {
  if (status === 'committed') return 'server-online';
  if (status === 'rolled_back') return 'server-offline';
  if (status === 'rejected' || status === 'failed') return 'server-revoked';
  return 'server-pending';
}

// PE-409: complementary reads keep the legacy overview contract compatible.
export type OtaDeploymentItem = Omit<OtaDeployment, 'targets'> & { target_count: number; target_by_status: Record<string, number> };
export type OtaAuditItem = OtaAudit & { id: string; created_at: string | null };
export type OtaEventItem = OtaEvent & { target_id: string | null; print_server_id: string | null; target_from_version: string | null; target_desired_version: string | null; hostname: string | null };
export type OtaChannelRow = {
  print_server_id:string; device_id:string|null; serial:string|null; name:string|null; hostname:string|null;
  venue_id:string|null; venue_name:string|null; channel:Ring; channel_revision:number; channel_source:string;
  channel_updated_at:string|null; status:string; online:boolean; last_seen_at:string|null; installed_version:string|null;
  model:string|null; arch:string|null; update_in_progress:boolean; href:string|null;
};
export type OtaPageItems = { firmwares: FirmwareRelease; channels: OtaChannelRow; deployments: OtaDeploymentItem; targets: OtaTarget; audit: OtaAuditItem; events: OtaEventItem };
export type OtaPageKind = keyof OtaPageItems;
export type ReadPage<T> = { items: T[]; total: number; limit: number; offset: number; counts?: Record<string,number>; aggregates: { population: string; by_status: Record<string,number>; target_by_status: Record<string,number>; target_count: number } };
export type OtaPageFilter = import('./adminLists').ListFilterState & { ring?: string; action?: string; phase?: string; model?: string; arch?: string; channel?: string; venue_id?: string; group_id?: string };
const counts = (v: unknown): Record<string,number> => Object.fromEntries(Object.entries(obj(v) ?? {}).filter((entry): entry is [string,number] => typeof entry[1] === 'number' && entry[1] >= 0));
export function projectOtaPage<K extends OtaPageKind>(kind: K, value: unknown): ReadPage<OtaPageItems[K]> {
  const data = obj(value) ?? bad();
  const rawItems = kind === 'firmwares' ? data.releases : kind === 'channels' ? data.rows : data.items;
  if (data.ok !== true || !Array.isArray(rawItems) || !Number.isSafeInteger(data.total) || Number(data.total)<0 ||
    !Number.isSafeInteger(data.limit) || Number(data.limit)<1 || Number(data.limit)>100 ||
    !Number.isSafeInteger(data.offset) || Number(data.offset)<0 || rawItems.length>Number(data.limit)) return bad();
  const aggregate = obj(data.aggregates) ?? {};
  const items = rawItems.map(v => {
    const r = obj(v) ?? bad();
    if (kind === 'firmwares') return projectFirmwareRelease(r);
    if (kind === 'channels') {
      if (!str(r.print_server_id) || !ring(r.channel) || !Number.isSafeInteger(r.channel_revision) || Number(r.channel_revision)<0 ||
        typeof r.online !== 'boolean' || typeof r.update_in_progress !== 'boolean') return bad();
      const deviceId = str(r.device_id), expectedHref = deviceId ? `/admin/print-servers/devices/${deviceId}` : null;
      return {print_server_id:String(r.print_server_id),device_id:deviceId,serial:str(r.serial),name:str(r.name),hostname:str(r.hostname),venue_id:str(r.venue_id),venue_name:str(r.venue_name),
        channel:ring(r.channel)!,channel_revision:Number(r.channel_revision),channel_source:str(r.channel_source)??'',channel_updated_at:str(r.channel_updated_at),status:str(r.status)??'',online:r.online,
        last_seen_at:str(r.last_seen_at),installed_version:str(r.installed_version),model:str(r.model),arch:str(r.arch),update_in_progress:r.update_in_progress,href:r.href===expectedHref?expectedHref:null};
    }
    if (typeof r.id !== 'string' && typeof r.id !== 'number') return bad();
    if (kind === 'targets') return target(v);
    if (kind === 'deployments') return {id:String(r.id),ring:ring(r.ring),group_id:str(r.group_id),group_name:str(r.group_name),edition_id:str(r.edition_id),version:str(r.version),created_at:str(r.created_at),created_by_email:str(r.created_by_email),target_count:num(r.target_count)??0,target_by_status:counts(r.target_by_status)};
    if (kind === 'audit') return {id:String(r.id),at:str(r.at),created_at:str(r.created_at),action:String(r.action??''),target_type:str(r.target_type),target_id:str(r.target_id),metadata:text(r.metadata),actor_email:str(r.actor_email)};
    // Keep original detail as text for authorized diagnostics. Never rewrite persisted events.
    return {id:String(r.id),target_id:str(r.target_id),print_server_id:str(r.print_server_id),phase:str(r.phase),status:str(r.status),progress:pct(r.progress),error_code:str(r.error_code),error_detail:str(r.error_detail),detail:text(r.detail),created_at:str(r.created_at),target_from_version:str(r.target_from_version),target_desired_version:str(r.target_desired_version),hostname:str(r.hostname)};
  }) as OtaPageItems[K][];
  return {items,total:Number(data.total),counts:counts(data.counts),limit:num(data.limit)??25,offset:num(data.offset)??0,aggregates:{population:str(aggregate.population)??'',by_status:counts(aggregate.by_status),target_by_status:counts(aggregate.target_by_status),target_count:num(aggregate.target_count)??0}};
}
export async function getOtaPage<K extends OtaPageKind>(kind: K, filters: OtaPageFilter, limit: number, offset: number, parentId: string | null, signal?: AbortSignal): Promise<ReadPage<OtaPageItems[K]>> {
  const pageLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 25));
  const pageOffset = Math.max(0, Math.trunc(offset) || 0);
  const base = { p_limit:pageLimit, p_offset:pageOffset, p_query:filters.query.trim()||null };
  if (kind === 'firmwares') return projectOtaPage(kind, await rpc('ps_firmware_page', {...base,p_status:filters.status||null,p_ring:filters.ring||null,p_model:filters.model||null,p_arch:filters.arch||null},signal));
  if (kind === 'channels') return projectOtaPage(kind, await rpc('ps_ota_channels_page', {...base,p_channel:filters.channel||null,p_status:filters.status||null,p_venue_id:filters.venue_id||null,p_group_id:parentId||filters.group_id||null},signal));
  const params: Record<string,unknown> = {...base,...utcBounds(filters.from,filters.to)};
  if(kind==='audit') params.p_action=filters.status||null;
  else params.p_status=filters.status||null;
  if(kind==='deployments') params.p_ring=filters.ring||null;
  if(kind==='targets') params.p_deployment_id=parentId;
  if(kind==='events') {params.p_target_id=parentId;params.p_phase=filters.phase||null;}
  return projectOtaPage(kind,await rpc(`ps_ota_admin_${kind}_page`,params,signal));
}
