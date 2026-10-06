import { supabase } from './supabase';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './config';
import { PortalError } from './errors';
import { PsError } from './printServerApi';

// OTA of the Print Server app (PE-385). Platform Admin only for the overview, signing and
// deployments; owners only read ps_panel_ota for their venue. Every answer is rebuilt field by
// field: unknown keys are never copied into state or the query cache.
export type Ring = 'lab' | 'canary' | 'general';
export const RINGS: Ring[] = ['lab', 'canary', 'general'];
export type OtaKey = { key_id: string; public_key_b64: string | null; active: boolean };
export type OtaRelease = {
  id: string; version: string; revision: string | null; model: string; arch: string; filename: string; sha256: string | null; size_bytes: number | null;
  created_at: string | null; edition_id: string | null; edition_status: 'preparing' | 'signed' | null; signed_at: string | null; key_id: string | null; canary_confirmed_at: string | null;
};
export type OtaGroup = { id: string; name: string; ring: Ring; members: string[] };
export type OtaTarget = {
  id: string; deployment_id: string | null; print_server_id: string; edition_id: string | null; from_version: string | null; desired_version: string | null;
  installed_version: string | null; status: string; phase: string | null; progress: number | null; error_code: string | null; error_detail: string | null;
  signed: boolean; issued_at: string | null; expires_at: string | null; offered_at: string | null; updated_at: string | null;
  venue_name: string | null; hostname: string | null;
};
export type OtaDevice = {
  print_server_id: string; venue_id: string | null; venue_name: string | null; hostname: string | null; serial: string | null;
  installed_version: string | null; last_seen_at: string | null; online: boolean; target: OtaTarget | null;
};
export type OtaDeployment = {
  id: string; ring: Ring | null; group_id: string | null; group_name: string | null; edition_id: string | null; version: string | null;
  created_at: string | null; created_by_email: string | null; targets: OtaTarget[];
};
export type OtaAudit = { at: string | null; action: string; target_type: string | null; target_id: string | null; metadata: string | null; actor_email: string | null };
export type OtaOverview = { server_time: string | null; keys: OtaKey[]; releases: OtaRelease[]; groups: OtaGroup[]; devices: OtaDevice[]; deployments: OtaDeployment[]; audit: OtaAudit[] };
export type OtaEvent = { id: string; phase: string | null; status: string | null; progress: number | null; error_code: string | null; error_detail: string | null; detail: string | null; created_at: string | null };
export type PanelOta = { print_server_id: string; hostname: string | null; installed_version: string | null; desired_version: string | null; status: string; phase: string | null; progress: number | null; updated_at: string | null };

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
    status: slug(t.status) ?? 'pending', phase: slug(t.phase), progress: pct(t.progress), error_code: str(t.error_code), error_detail: str(t.error_detail),
    signed: t.signed === true, issued_at: str(t.issued_at), expires_at: str(t.expires_at), offered_at: str(t.offered_at), updated_at: str(t.updated_at),
    venue_name: str(t.venue_name), hostname: str(t.hostname) };
}
export function projectOverview(v: unknown): OtaOverview {
  const d = obj(v) ?? bad();
  if (d.ok !== true) return bad();
  return {
    server_time: str(d.server_time),
    keys: list(d.keys).map(item => { const k = obj(item) ?? bad(); return { key_id: String(k.key_id ?? ''), public_key_b64: str(k.public_key_b64), active: k.active === true }; }),
    releases: list(d.releases).map(item => {
      const r = obj(item) ?? bad();
      if (typeof r.id !== 'string') return bad();
      return { id: r.id, version: String(r.version ?? ''), revision: str(r.revision), model: String(r.model ?? ''), arch: String(r.arch ?? ''), filename: String(r.filename ?? ''),
        sha256: str(r.sha256), size_bytes: num(r.size_bytes), created_at: str(r.created_at), edition_id: str(r.edition_id),
        edition_status: r.edition_status === 'signed' || r.edition_status === 'preparing' ? r.edition_status : null,
        signed_at: str(r.signed_at), key_id: str(r.key_id), canary_confirmed_at: str(r.canary_confirmed_at) };
    }),
    groups: list(d.groups).map(item => {
      const g = obj(item) ?? bad();
      if (typeof g.id !== 'string') return bad();
      return { id: g.id, name: String(g.name ?? ''), ring: ring(g.ring) ?? 'lab', members: list(g.members).filter((m): m is string => typeof m === 'string') };
    }),
    devices: list(d.devices).map(item => {
      const s = obj(item) ?? bad();
      if (typeof s.print_server_id !== 'string') return bad();
      return { print_server_id: s.print_server_id, venue_id: str(s.venue_id), venue_name: str(s.venue_name), hostname: str(s.hostname), serial: str(s.serial),
        installed_version: str(s.installed_version), last_seen_at: str(s.last_seen_at), online: s.online === true, target: s.target ? target(s.target) : null };
    }),
    deployments: list(d.deployments).map(item => {
      const p = obj(item) ?? bad();
      if (typeof p.id !== 'string') return bad();
      return { id: p.id, ring: ring(p.ring), group_id: str(p.group_id), group_name: str(p.group_name), edition_id: str(p.edition_id), version: str(p.version),
        created_at: str(p.created_at), created_by_email: str(p.created_by_email), targets: list(p.targets).map(target) };
    }),
    audit: list(d.audit).map(item => {
      const a = obj(item) ?? bad();
      return { at: str(a.at), action: String(a.action ?? ''), target_type: str(a.target_type), target_id: str(a.target_id), metadata: text(a.metadata), actor_email: str(a.actor_email) };
    }),
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
  canary_not_confirmed: 'ota.error.canaryNotConfirmed', ring_requires_group: 'ota.error.ringRequiresGroup', already_signed: 'ota.error.alreadySigned', forbidden: 'accessDenied',
};
async function action(name: string, params: Record<string, unknown>): Promise<Raw> {
  const data = obj(await rpc(name, params)) ?? bad();
  if (data.ok !== true) throw new PsError((typeof data.error === 'string' && groupErrors[data.error]) || 'ota.error.other');
  return data;
}

export async function getOtaOverview(signal?: AbortSignal): Promise<OtaOverview> {
  return projectOverview(await rpc('ps_ota_admin_overview', {}, signal));
}
export async function getTargetEvents(targetId: string, signal?: AbortSignal): Promise<OtaEvent[]> {
  const data = obj(await rpc('ps_ota_target_events', { p_target_id: targetId }, signal)) ?? bad();
  if (data.ok !== true) throw new PsError('ota.error.other');
  return list(data.events).map(item => {
    const e = obj(item) ?? bad();
    return { id: String(e.id ?? ''), phase: slug(e.phase), status: slug(e.status), progress: pct(e.progress), error_code: str(e.error_code), error_detail: str(e.error_detail), detail: text(e.detail), created_at: str(e.created_at) };
  });
}
export async function createGroup(name: string, r: Ring): Promise<void> {
  await action('ps_ota_group_create', { p_name: name.trim(), p_ring: r });
}
export async function setGroupMembers(groupId: string, ids: string[]): Promise<void> {
  await action('ps_ota_group_set_members', { p_group_id: groupId, p_print_server_ids: ids });
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
  if (!data || data.ok !== true) {
    const code = typeof data?.error === 'string' ? data.error : '';
    throw new PsError(fnErrors[code] ?? 'ota.error.other');
  }
  return data;
}
export async function signEdition(releaseId: string): Promise<{ version: string | null; key_id: string | null }> {
  const data = await call({ action: 'sign', release_id: releaseId });
  return { version: str(data.version), key_id: str(data.key_id) };
}
export type DeployTarget = { group_id: string } | { ring: Ring; print_server_ids: string[] };
export async function deployEdition(editionId: string, to: DeployTarget): Promise<{ targets: number }> {
  const data = await call({ action: 'deploy', edition_id: editionId, ...to });
  return { targets: Array.isArray(data.targets) ? data.targets.length : num(data.targets) ?? 0 };
}

export async function getPanelOta(venueId: string, signal?: AbortSignal): Promise<PanelOta[]> {
  const data = obj(await rpc('ps_panel_ota', { p_venue_id: venueId }, signal)) ?? bad();
  if (data.ok !== true) throw new PsError('ota.error.other');
  return list(data.print_servers).map(item => {
    const p = obj(item) ?? bad();
    return { print_server_id: String(p.print_server_id ?? ''), hostname: str(p.hostname), installed_version: str(p.installed_version), desired_version: str(p.desired_version),
      status: slug(p.status) ?? 'none', phase: slug(p.phase), progress: pct(p.progress), updated_at: str(p.updated_at) };
  });
}

// A target is "Restored" when the device rolled back to its previous version on its own.
export const ACTIVE_STATUSES = ['pending', 'in_progress'];
export function statusClass(status: string): string {
  if (status === 'committed') return 'server-online';
  if (status === 'rolled_back') return 'server-offline';
  if (status === 'rejected' || status === 'failed') return 'server-revoked';
  return 'server-pending';
}
