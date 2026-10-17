// PE-473: admin-only OTA contract for one Print Server sheet — channel, selectable
// editions, in-place Canary validation and the requirements for General.
// Every block is optional: an older backend without these keys hides the block
// instead of breaking the sheet. Owner views never import this module.
import { firmwareRing, type FirmwareRing } from './firmwareEligibility';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Raw : null;
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const code = (v: unknown): string | null => typeof v === 'string' && /^[a-z][a-z0-9_]{0,63}(:[a-z0-9_]{1,64})?$/.test(v) ? v : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const pct = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;

export type OtaGroupRef = { id: string; name: string };
export type OtaChannel = {
  ring: FirmwareRing; groups: (OtaGroupRef & { ring: FirmwareRing })[];
  options: { ring: FirmwareRing; groups: OtaGroupRef[] }[];
  can_change: boolean; blocked_reason: string | null;
};
export type OtaEdition = {
  edition_id: string; version: string; sha256: string | null; signed_at: string | null; enabled_rings: FirmwareRing[];
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
export type AdminOtaExtras = { channel: OtaChannel | null; editions: OtaEdition[] | null; canary: CanaryValidation | null; general: GeneralRequirements | null };

const FIRMWARES_HREF = '/admin/print-servers/firmwares';
const ACTIONS: GeneralRequirementAction[] = ['change_channel', 'install_updater', 'validate', 'open_firmwares'];
const STATUSES: CanaryStatus[] = ['not_needed', 'pending', 'in_progress', 'failed', 'confirmed'];
const SHA = /^[0-9a-f]{64}$/i;

function projectChannel(v: unknown): OtaChannel | null {
  const c = obj(v); const ring = firmwareRing(c?.ring);
  if (!c || !ring || typeof c.can_change !== 'boolean') return null;
  const group = (g: unknown): OtaGroupRef | null => { const o = obj(g); const id = str(o?.id), name = str(o?.name); return id && name ? { id, name } : null; };
  const groups = list(c.groups).flatMap(g => { const ref = group(g), r = firmwareRing(obj(g)?.ring); return ref && r ? [{ ...ref, ring: r }] : []; });
  const options = list(c.options).flatMap(o => { const r = firmwareRing(obj(o)?.ring); return r ? [{ ring: r, groups: list(obj(o)?.groups).map(group).filter((g): g is OtaGroupRef => !!g) }] : []; });
  return { ring, groups, options, can_change: c.can_change && !code(c.blocked_reason), blocked_reason: code(c.blocked_reason) };
}

function projectEditions(v: unknown): OtaEdition[] | null {
  if (!Array.isArray(v)) return null;
  return v.flatMap(item => {
    const e = obj(item); const edition_id = str(e?.edition_id), version = str(e?.version), raw = str(e?.sha256);
    if (!e || !edition_id || !version) return [];
    const sha256 = raw && SHA.test(raw) ? raw.toLowerCase() : null;
    const reason = code(e.reason);
    return [{ edition_id, version, sha256, signed_at: str(e.signed_at),
      enabled_rings: list(e.enabled_rings).map(firmwareRing).filter((r): r is FirmwareRing => !!r),
      lab_only: e.lab_only === true, canary_confirmed_at: str(e.canary_confirmed_at), class_ring: firmwareRing(e.class_ring),
      installed: e.installed === true, selectable: e.selectable === true && !reason, reason }];
  });
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
  const u = obj(update);
  return { channel: projectChannel(u?.channel), editions: projectEditions(u?.editions), canary: projectCanary(u?.canary_validation), general: projectGeneral(u?.general_requirements) };
}

export const shortId = (id: string) => id.slice(0, 8);
export const shortSha = (sha: string | null) => !sha ? '—' : sha.length > 12 ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : sha;

// The headline must never collapse "installed but not validated in Canary" into "up to date".
export type FirmwareHeadline = { key: string; version: string | null };
export function firmwareHeadline(current: string | null, canary: CanaryValidation | null, reason: string | null): FirmwareHeadline | null {
  if (canary?.edition && current && canary.edition.version === current) {
    const key = { pending: 'otaDevice.headline.pending', in_progress: 'otaDevice.headline.in_progress', failed: 'otaDevice.headline.failed', confirmed: 'otaDevice.headline.confirmed', not_needed: null }[canary.status];
    if (key) return { key, version: current };
  }
  if (reason === 'up_to_date' && current) return { key: 'otaDevice.headline.up_to_date', version: current };
  return null;
}
// Replaces the "up to date" update reason while the installed edition is not Canary-validated.
export function updateReasonKey(reason: string | null, canary: CanaryValidation | null): string | null {
  if (!reason) return null;
  if (reason === 'up_to_date' && canary && ['pending', 'in_progress', 'failed'].includes(canary.status)) return 'otaDevice.reason.up_to_date_unvalidated';
  return `adminDevice.reason.${reason}`;
}
export const showValidateButton = (canary: CanaryValidation | null) => !!canary && (canary.status === 'pending' || canary.status === 'failed');

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
  return { main: editions.filter(e => e.selectable || e.installed), other: editions.filter(e => !e.selectable && !e.installed) };
}
// Default choice: the newest selectable edition (the list arrives newest first).
export function defaultEditionId(editions: OtaEdition[] | null): string | null {
  return editions?.find(e => e.selectable)?.edition_id ?? null;
}
export function channelSelectionValid(channel: OtaChannel, ring: FirmwareRing, groupId: string | null): boolean {
  const option = channel.options.find(o => o.ring === ring);
  if (!option) return false;
  if (ring === 'general') return channel.ring !== 'general';
  if (!groupId || !option.groups.some(g => g.id === groupId)) return false;
  return !(channel.ring === ring && channel.groups.some(g => g.id === groupId));
}
