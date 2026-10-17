// PE-474 v2: project server decisions, never infer promotion eligibility locally.
export const FIRMWARE_RINGS = ['lab', 'canary', 'general'] as const;
export type FirmwareRing = typeof FIRMWARE_RINGS[number];
export type RingEligibility = { enabled: boolean; eligible: boolean; available: boolean; reason: string | null; can_enable: boolean; enable_block_reason: string | null };
export type FirmwareLifecycle = {
  contract_version: 2;
  edition_id: string | null; edition_status: 'preparing' | 'signed' | null;
  signed_by: string | null; signed_by_email: string | null; signed_at: string | null; key_id: string | null;
  canary_confirmed_at: string | null; lab_only: boolean;
  configuration: 'auto_lab' | 'explicit' | 'legacy'; revision: number; open_targets: number;
  retired_at: string | null; retired_by: string | null;
  enabled_rings: FirmwareRing[]; next_promotion: FirmwareRing | null;
  technical_class: { ring: 'general' | 'lab'; general_eligible: boolean; eligibility_reason: string } | null;
  canary_evidence: { confirmed_at: string | null; committed_canary_targets: number; blocking: false };
  rings: Record<FirmwareRing, RingEligibility>;
  can_sign: boolean; sign_block_reason: string | null;
  can_manage: boolean; can_retire: boolean; retire_block_reason: string | null;
};
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (v: unknown): string | null => typeof v === 'string' && v.length ? v : null;
const nullableString = (v: unknown) => v === null || typeof v === 'string';
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const isRing = (v: unknown): v is FirmwareRing => FIRMWARE_RINGS.includes(v as FirmwareRing);

export function projectFirmwareLifecycle(value: unknown): FirmwareLifecycle | null {
  const v = record(value), rawRings = record(v?.rings), evidence = record(v?.canary_evidence), technical = record(v?.technical_class);
  if (!v || v.contract_version !== 2 || !rawRings || !integer(v.revision) || !integer(v.open_targets) ||
    !['auto_lab', 'explicit', 'legacy'].includes(String(v.configuration)) ||
    !Array.isArray(v.enabled_rings) || !v.enabled_rings.every(isRing) || new Set(v.enabled_rings).size !== v.enabled_rings.length ||
    !(v.next_promotion === null || isRing(v.next_promotion)) || !evidence || evidence.blocking !== false ||
    !integer(evidence.committed_canary_targets) || !nullableString(evidence.confirmed_at)) return null;
  // auto_lab is the immutable initial availability snapshot; promotions become explicit.
  if (v.configuration === 'auto_lab' && (v.edition_status !== 'signed' || v.revision !== 0 || v.enabled_rings.length !== 1 || v.enabled_rings[0] !== 'lab')) return null;
  const rings = {} as Record<FirmwareRing, RingEligibility>;
  for (const ring of FIRMWARE_RINGS) {
    const r = record(rawRings[ring]);
    if (!r || ['enabled','eligible','available','can_enable'].some(k => typeof r[k] !== 'boolean') ||
      !nullableString(r.reason) || !nullableString(r.enable_block_reason) || r.enabled !== v.enabled_rings.includes(ring) ||
      (r.available && (!r.enabled || !r.eligible || v.retired_at !== null)) ||
      (r.can_enable && (r.enabled || !r.eligible || r.enable_block_reason !== null || v.can_manage !== true || v.retired_at !== null))) return null;
    rings[ring] = { enabled: r.enabled as boolean, eligible: r.eligible as boolean, available: r.available as boolean,
      reason: str(r.reason), can_enable: r.can_enable as boolean, enable_block_reason: str(r.enable_block_reason) };
  }
  if (![null, 'preparing', 'signed'].includes(v.edition_status as string | null) ||
    ['can_sign', 'can_manage', 'can_retire', 'lab_only'].some(key => typeof v[key] !== 'boolean') ||
    ['edition_id','signed_by','signed_by_email','signed_at','key_id','canary_confirmed_at','retired_at','retired_by','sign_block_reason','retire_block_reason'].some(key => !nullableString(v[key]))) return null;
  if (v.edition_status === 'signed' && (!str(v.edition_id) || !str(v.signed_at) || !str(v.key_id) || !technical)) return null;
  if (technical && (!['general','lab'].includes(String(technical.ring)) || typeof technical.general_eligible !== 'boolean' || !str(technical.eligibility_reason))) return null;
  if (v.technical_class !== null && !technical) return null;
  if ((rings.canary.can_enable && !rings.lab.enabled) || (rings.general.can_enable && !rings.canary.enabled)) return null;
  // Legacy/explicit pre-existing non-cumulative rows are readable per contract §7;
  // only the server may authorize filling their missing preceding ring.
  if (v.next_promotion !== (FIRMWARE_RINGS.find(r => rings[r].can_enable) ?? null)) return null;
  if (v.edition_status !== 'signed' && (v.can_manage || v.can_retire || v.enabled_rings.length || FIRMWARE_RINGS.some(r => rings[r].can_enable || rings[r].available))) return null;
  if (v.can_sign && (v.edition_status === 'signed' || v.sign_block_reason !== null)) return null;
  if (v.can_retire && (!v.can_manage || v.retired_at !== null || v.open_targets > 0 || v.retire_block_reason !== null)) return null;
  return {
    contract_version: 2, edition_id: str(v.edition_id), edition_status: v.edition_status as FirmwareLifecycle['edition_status'],
    signed_by: str(v.signed_by), signed_by_email: str(v.signed_by_email), signed_at: str(v.signed_at), key_id: str(v.key_id),
    canary_confirmed_at: str(v.canary_confirmed_at), lab_only: v.lab_only === true,
    configuration: v.configuration as FirmwareLifecycle['configuration'], revision: v.revision, open_targets: v.open_targets,
    retired_at: str(v.retired_at), retired_by: str(v.retired_by), rings,
    enabled_rings: [...v.enabled_rings], next_promotion: v.next_promotion as FirmwareRing | null,
    technical_class: technical ? { ring: technical.ring as 'general' | 'lab', general_eligible: technical.general_eligible === true, eligibility_reason: technical.eligibility_reason as string } : null,
    canary_evidence: { confirmed_at: str(evidence.confirmed_at), committed_canary_targets: evidence.committed_canary_targets, blocking: false },
    can_sign: v.can_sign === true, sign_block_reason: str(v.sign_block_reason),
    can_manage: v.can_manage === true, can_retire: v.can_retire === true, retire_block_reason: str(v.retire_block_reason),
  };
}
export function firmwareRingAvailable(lifecycle: FirmwareLifecycle | null | undefined, ring: FirmwareRing): boolean {
  return !!lifecycle && lifecycle.edition_status === 'signed' && !!lifecycle.edition_id && !lifecycle.retired_at && lifecycle.rings[ring].available === true;
}
export function firmwareEditionLink(editionId: string | null, releaseId?: string): string {
  const base = '/admin/print-servers/firmwares';
  return editionId ? `${base}?edition=${encodeURIComponent(editionId)}` : releaseId ? `${base}?release=${encodeURIComponent(releaseId)}` : base;
}
export type FirmwareConfirmation = { sha256: string; version: string; model: string; arch: string; revision: string | null; lab_only?: boolean };
