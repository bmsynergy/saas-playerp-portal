// PE-442 final contract (Tom, backend cb94ecd). Missing/invalid metadata fails
// closed. These are server decisions; this module never classifies a release or promotes it.
export const FIRMWARE_RINGS = ['lab', 'canary', 'general'] as const;
export type FirmwareRing = typeof FIRMWARE_RINGS[number];
export type RingEligibility = { enabled: boolean; eligible: boolean; available: boolean; reason: string | null };
export type FirmwareLifecycle = {
  contract_version: 1;
  edition_id: string | null;
  edition_status: 'preparing' | 'signed' | null;
  signed_by: string | null; signed_by_email: string | null; signed_at: string | null; key_id: string | null;
  canary_confirmed_at: string | null; lab_only: boolean;
  configuration: 'explicit' | 'legacy'; revision: number; open_targets: number;
  retired_at: string | null; retired_by: string | null;
  rings: Record<FirmwareRing, RingEligibility>;
  can_sign: boolean; sign_block_reason: string | null;
  can_manage: boolean; can_retire: boolean; retire_block_reason: string | null;
};
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (v: unknown): string | null => typeof v === 'string' && v.length ? v : null;

export function projectFirmwareLifecycle(value: unknown): FirmwareLifecycle | null {
  const v = record(value), rawRings = record(v?.rings);
  if (!v || v.contract_version !== 1 || !rawRings || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 ||
    !Number.isSafeInteger(v.open_targets) || Number(v.open_targets) < 0 ||
    !['explicit', 'legacy'].includes(String(v.configuration))) return null;
  const rings = {} as Record<FirmwareRing, RingEligibility>;
  for (const ring of FIRMWARE_RINGS) {
    const r = record(rawRings[ring]);
    if (!r || typeof r.enabled !== 'boolean' || typeof r.eligible !== 'boolean' || typeof r.available !== 'boolean' || !(r.reason === null || typeof r.reason === 'string')) return null;
    rings[ring] = { enabled: r.enabled, eligible: r.eligible, available: r.available, reason: str(r.reason) };
  }
  if (![null, 'preparing', 'signed'].includes(v.edition_status as string | null) ||
    ['can_sign', 'can_manage', 'can_retire', 'lab_only'].some(key => typeof v[key] !== 'boolean') ||
    ['edition_id','signed_by','signed_by_email','signed_at','key_id','canary_confirmed_at','retired_at','retired_by','sign_block_reason','retire_block_reason'].some(key => !(v[key] === null || typeof v[key] === 'string'))) return null;
  if (v.edition_status === 'signed' && (!str(v.edition_id) || !str(v.signed_at) || !str(v.key_id))) return null;
  return {
    contract_version: 1, edition_id: str(v.edition_id), edition_status: v.edition_status as FirmwareLifecycle['edition_status'],
    signed_by: str(v.signed_by), signed_by_email: str(v.signed_by_email), signed_at: str(v.signed_at), key_id: str(v.key_id),
    canary_confirmed_at: str(v.canary_confirmed_at), lab_only: v.lab_only === true,
    configuration: v.configuration as FirmwareLifecycle['configuration'], revision: Number(v.revision), open_targets: Number(v.open_targets),
    retired_at: str(v.retired_at), retired_by: str(v.retired_by), rings,
    can_sign: v.can_sign === true, sign_block_reason: str(v.sign_block_reason),
    can_manage: v.can_manage === true, can_retire: v.can_retire === true, retire_block_reason: str(v.retire_block_reason),
  };
}

export function firmwareRingAvailable(lifecycle: FirmwareLifecycle | null | undefined, ring: FirmwareRing): boolean {
  return !!lifecycle && lifecycle.edition_status === 'signed' && !!lifecycle.edition_id && !lifecycle.retired_at &&
    lifecycle.rings[ring].available === true;
}

export function firmwareEditionLink(editionId: string | null, releaseId?: string): string {
  const base = '/admin/print-servers/firmwares';
  return editionId ? `${base}?edition=${encodeURIComponent(editionId)}` : releaseId ? `${base}?release=${encodeURIComponent(releaseId)}` : base;
}

export type FirmwareConfirmation = { sha256: string; version: string; model: string; arch: string; revision: string | null };
