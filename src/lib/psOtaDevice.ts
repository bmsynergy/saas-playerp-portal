// PE-474 admin-only channel and bounded installable editions projection.
// Obsolete PE-473 validation/requirements are never projected or exposed.
import { firmwareRing, type FirmwareRing } from './firmwareEligibility';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const code = (v: unknown): string | null => typeof v === 'string' && /^[a-z][a-z0-9_]{0,63}(:[a-z0-9_]{1,64})?$/.test(v) ? v : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const pct = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;

export type OtaGroupRef = { id: string; name: string };
export type OtaChannel = {
  ring: FirmwareRing; revision:number; source:string; updated_at:string|null;
  deployment_groups: (OtaGroupRef & {ring:FirmwareRing})[];
  href: '/admin/print-servers/channels'; can_change:boolean; blocked_reason:string|null;
};
export type OtaEdition = {
  edition_id: string; version: string; sha256: string | null; sha256_short: string | null; signed_at: string | null; enabled_rings: FirmwareRing[];
  lab_only: boolean; canary_confirmed_at: string | null; class_ring: FirmwareRing | null; installed: boolean;
  selectable: boolean; reason: string | null;
};
export type CanaryStatus = 'not_needed' | 'pending' | 'in_progress' | 'failed' | 'confirmed';
export type CanaryTarget = { id: string; status: string; phase: string | null; progress: number | null; error_code: string | null;
  issued_at: string | null; expires_at: string | null; updated_at: string | null };
export type CanaryValidation = {
  status: CanaryStatus; edition: { edition_id: string; version: string; sha256: string | null; signed_at: string | null } | null;
  receipt_target_id: string | null; receipt_ring: FirmwareRing | null; target: CanaryTarget | null;
  can_validate: boolean; blockers: string[]; updater_version: string | null; updater_supports_validation: boolean | null;
};
export type GeneralRequirementAction = 'change_channel' | 'install_updater' | 'validate' | 'open_firmwares';
export type GeneralRequirements = {
  edition: { edition_id: string; version: string } | null; eligible: boolean;
  items: { key: string; met: boolean; action: GeneralRequirementAction | null; href: string | null }[];
};
export type NewerBlocked = {version:string;detail:string;channel:FirmwareRing|null;model:string|null;arch:string|null;enabled_rings:FirmwareRing[]};
export type AdminOtaExtras = { editions_total:number; editions_limit:20; newer_blocked:NewerBlocked|null; channel: OtaChannel | null; editions: OtaEdition[] | null; canary: CanaryValidation | null; general: GeneralRequirements | null };

const FIRMWARES_HREF = '/admin/print-servers/firmwares';
const ACTIONS: GeneralRequirementAction[] = ['change_channel', 'install_updater', 'validate', 'open_firmwares'];
const STATUSES: CanaryStatus[] = ['not_needed', 'pending', 'in_progress', 'failed', 'confirmed'];
const SHA = /^[0-9a-f]{64}$/i;

function projectChannel(v: unknown): OtaChannel | null {
  const c=obj(v), ring=firmwareRing(c?.ring);
  if (!c || !ring || !Number.isSafeInteger(c.revision) || Number(c.revision)<0 || typeof c.can_change!=='boolean' ||
    !['default','groups_init','admin'].includes(String(c.source)) || !(c.blocked_reason===null || code(c.blocked_reason)) || !Array.isArray(c.deployment_groups)) return null;
  const deployment_groups=c.deployment_groups.flatMap(g=>{const r=obj(g),ring=firmwareRing(r?.ring);return r&&str(r.id)&&str(r.name)&&ring?[{id:str(r.id)!,name:str(r.name)!,ring}]:[];});
  return {ring,revision:Number(c.revision),source:String(c.source),updated_at:str(c.updated_at),deployment_groups,
    href:'/admin/print-servers/channels',can_change:c.can_change===true&&!c.blocked_reason,blocked_reason:code(c.blocked_reason)};
}
function projectEditions(v: unknown): OtaEdition[] | null {
  if (!Array.isArray(v) || v.length>20) return null;
  const result:OtaEdition[]=[];
  for (const item of v) {
    const e=obj(item), sha=str(e?.sha256_short);
    if (!e || !str(e.edition_id) || !str(e.version) || !str(e.signed_at) || !sha || !/^[0-9a-f]{12}$/i.test(sha) ||
      typeof e.selectable!=='boolean' || !(e.reason===null || e.reason==='update_in_progress') ||
      !Array.isArray(e.enabled_rings) || !e.enabled_rings.every(r=>firmwareRing(r)!==null)) return null;
    result.push({edition_id:str(e.edition_id)!,version:str(e.version)!,signed_at:str(e.signed_at),sha256:sha,sha256_short:sha,
      enabled_rings:e.enabled_rings as FirmwareRing[],canary_confirmed_at:str(e.canary_confirmed_at),
      lab_only:false,class_ring:null,installed:false,selectable:e.selectable===true&&e.reason===null,reason:code(e.reason)});
  }
  return result;
}
function projectCanary(v: unknown): CanaryValidation | null {
  const c = obj(v); const status = STATUSES.find(s => s === c?.status);
  if (!c || !status) return null;
  const e = obj(c.edition), t = obj(c.target);
  const sha = str(e?.sha256);
  const edition = e && str(e.edition_id) && str(e.version)
    ? { edition_id: str(e.edition_id)!, version: str(e.version)!, sha256: sha && SHA.test(sha) ? sha.toLowerCase() : null, signed_at: str(e.signed_at) } : null;
  const target = t && str(t.id) && code(t.status) ? { id: str(t.id)!, status: code(t.status)!, phase: code(t.phase), progress: pct(t.progress),
    error_code: str(t.error_code), issued_at: str(t.issued_at), expires_at: str(t.expires_at), updated_at: str(t.updated_at) } : null;
  const blockers = list(c.blockers).map(code).filter((b): b is string => !!b);
  const supports = c.updater_supports_validation === true ? true : c.updater_supports_validation === false ? false : null;
  return { status, edition, receipt_target_id: str(c.receipt_target_id), receipt_ring: firmwareRing(c.receipt_ring), target,
    can_validate: c.can_validate === true && !blockers.length && !!edition?.sha256 && (status === 'pending' || status === 'failed'),
    blockers, updater_version: str(c.updater_version), updater_supports_validation: supports };
}

function projectGeneral(v: unknown): GeneralRequirements | null {
  const g = obj(v); if (!g || !Array.isArray(g.items)) return null;
  const e = obj(g.edition);
  const items = g.items.flatMap(item => {
    const i = obj(item); const key = code(i?.key); if (!i || !key) return [];
    const action = ACTIONS.find(a => a === i.action) ?? null;
    // Only the known internal Firmwares route is linked; never an arbitrary URL.
    return [{ key, met: i.met === true, action, href: action === 'open_firmwares' ? FIRMWARES_HREF : null }];
  });
  return { edition: e && str(e.edition_id) && str(e.version) ? { edition_id: str(e.edition_id)!, version: str(e.version)! } : null,
    eligible: g.eligible === true && items.every(i => i.met), items };
}

export function projectAdminOtaExtras(update: unknown): AdminOtaExtras {
  const u=obj(update), n=obj(u?.newer_blocked);
  let editions=projectEditions(u?.editions);
  if (!Number.isSafeInteger(u?.editions_total) || Number(u?.editions_total)<(editions?.length??0) || u?.editions_limit!==20) editions=null;
  return {channel:projectChannel(u?.channel),editions,editions_total:Number.isSafeInteger(u?.editions_total)?Number(u?.editions_total):0,editions_limit:20,
    newer_blocked:n&&str(n.version)&&code(n.detail)?{version:str(n.version)!,detail:code(n.detail)!,channel:firmwareRing(n.channel),model:str(n.model),arch:str(n.arch),enabled_rings:list(n.enabled_rings).filter((r):r is FirmwareRing=>firmwareRing(r)!==null)}:null,
    canary:null,general:null};
}

export const shortId = (id: string) => id.slice(0, 8);
export const shortSha = (sha: string | null) => !sha ? '—' : sha.length > 12 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha;

// The headline must never collapse "installed but not validated in Canary" into "up to date".
export type FirmwareHeadline = { key: string; version: string | null };
export function firmwareHeadline(current: string | null, _canary: CanaryValidation | null, reason: string | null): FirmwareHeadline | null {
  return reason==='up_to_date'&&current?{key:'otaDevice.headline.up_to_date',version:current}:null;
}
export function updateReasonKey(reason:string|null,_canary:CanaryValidation|null):string|null {return reason?`adminDevice.reason.${reason}`:null;}
export const showValidateButton = (_canary:CanaryValidation|null) => false;

const KNOWN_EDITION_REASONS = ['not_newer', 'ring_disabled', 'edition_lab_only', 'lab_build', 'canary_not_confirmed', 'edition_not_signed', 'update_in_progress', 'device_not_active'];
export function editionReasonKey(reason: string | null): { key: string; code: string | null } {
  if (!reason) return { key: 'otaDevice.edition.reason.unknown', code: null };
  return KNOWN_EDITION_REASONS.includes(reason) ? { key: `otaDevice.edition.reason.${reason}`, code: null } : { key: 'otaDevice.edition.reason.unknown', code: reason };
}
const KNOWN_BLOCKERS = ['channel_not_canary', 'canary_ring_disabled', 'edition_lab_only', 'lab_build', 'update_in_progress', 'no_install_receipt', 'device_not_active'];
export function blockerKey(blocker: string): { key: string; code: string | null } {
  return KNOWN_BLOCKERS.includes(blocker) ? { key: `otaDevice.blocker.${blocker}`, code: null } : { key: 'otaDevice.blocker.unknown', code: blocker };
}
const KNOWN_VALIDATION_ERRORS = ['updater_unsupported', 'no_install_receipt', 'artifact_mismatch', 'not_active_version', 'queue_busy', 'validation_evidence_mismatch',
  'expired', 'signature_invalid', 'ps_mismatch', 'model_mismatch', 'arch_mismatch', 'replay', 'schema_unknown', 'manifest_mismatch', 'superseded'];
const KNOWN_HEALTH = ['local_api_down'];
// health_failed:<code> keeps the health() code; unknown codes are shown verbatim, never hidden.
export function validationErrorKey(errorCode: string | null): { key: string; code: string | null } {
  if (!errorCode) return { key: 'otaDevice.validationError.none', code: null };
  if (errorCode === 'health_failed' || errorCode.startsWith('health_failed:')) {
    const health = errorCode.split(':')[1] ?? null;
    if (!health) return { key: 'otaDevice.validationError.health_failed', code: null };
    return KNOWN_HEALTH.includes(health) ? { key: `otaDevice.validationError.health.${health}`, code: null } : { key: 'otaDevice.validationError.health_failed', code: health };
  }
  if (KNOWN_HEALTH.includes(errorCode)) return { key: `otaDevice.validationError.health.${errorCode}`, code: null };
  return KNOWN_VALIDATION_ERRORS.includes(errorCode) ? { key: `otaDevice.validationError.${errorCode}`, code: null } : { key: 'otaDevice.validationError.unknown', code: errorCode };
}

// The picker shows selectable editions and the installed one; the rest stay folded with their reason.
export function splitEditions(editions: OtaEdition[]): { main: OtaEdition[]; other: OtaEdition[] } {
  return { main: editions.filter(e => e.selectable), other: [] };
}
// Default choice: the newest selectable edition (the list arrives newest first).
export function defaultEditionId(editions: OtaEdition[] | null): string | null {
  return editions?.find(e => e.selectable)?.edition_id ?? null;
}
export function channelSelectionValid(channel:OtaChannel,ring:FirmwareRing):boolean {
  return channel.can_change && ['lab','canary','general'].includes(ring) && ring!==channel.ring;
}
