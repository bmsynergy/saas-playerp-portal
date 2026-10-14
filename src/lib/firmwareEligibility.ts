// Stable firmware contract uses plain major.minor.patch. Unknown versions fail closed.
export function compareFirmware(a: string | null, b: string | null): number | null {
  const parse = (v: string | null) => v && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v) ? v.split('.').map(BigInt) : null;
  const x = parse(a), y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
export type StableFirmware = { edition_id: string; version: string; model: string; arch: string };
export function firmwareBlockReason(installed: string | null, latest: StableFirmware | null, model: string | null, arch: string | null, serverAvailable: boolean, serverReason: string | null, compare = compareFirmware): string | null {
  if (serverReason && ['no_general_update', 'no_stable_release', 'device_not_active', 'update_in_progress', 'ring_not_allowed'].includes(serverReason)) return serverReason;
  if (!model || !arch || compare(installed, installed) === null) return 'metadata_missing';
  if (!latest) return serverReason === 'no_stable_release' ? 'no_stable_release' : 'metadata_missing';
  if (latest.model !== model || latest.arch !== arch) return 'incompatible';
  const cmp = compare(latest.version, installed);
  if (cmp === null) return 'metadata_missing';
  if (cmp <= 0) return 'up_to_date';
  return serverReason || (serverAvailable ? null : 'not_authorized');
}

export type FirmwareRing = 'lab' | 'canary' | 'general';
export type FirmwareCandidate = StableFirmware & {
  ring: FirmwareRing; general_eligible: boolean; eligibility_reason: string;
  admitted: boolean; admitted_ring: FirmwareRing | null; canary_confirmed_at: string | null;
  lab_only: boolean; signed_at: string | null;
};
export const firmwareRing = (value: unknown): FirmwareRing | null => value === 'lab' || value === 'canary' || value === 'general' ? value : null;
// An absent/old ADMIN contract fails closed. Never substitute the OWNER General selection.
export function projectFirmwareCandidate(value: unknown): FirmwareCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const ring = firmwareRing(v.ring);
  if (!ring || !['edition_id', 'version', 'model', 'arch', 'eligibility_reason'].every(k => typeof v[k] === 'string' && v[k] !== '')) return null;
  return {edition_id: v.edition_id as string, version: v.version as string, model: v.model as string, arch: v.arch as string,
    ring, general_eligible: v.general_eligible === true, eligibility_reason: v.eligibility_reason as string,
    admitted: v.admitted === true, admitted_ring: firmwareRing(v.admitted_ring), lab_only: v.lab_only === true,
    signed_at: typeof v.signed_at === 'string' ? v.signed_at : null,
    canary_confirmed_at: typeof v.canary_confirmed_at === 'string' ? v.canary_confirmed_at : null};
}

// ADMIN follows the existing OTA version key, which allows signed lab/prerelease builds.
// Authorization and release admission still come from the server, not the suffix.
export function compareAdminFirmware(a: string | null, b: string | null): number | null {
  const parse = (v: string | null) => {
    const match = v?.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)((?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?)$/);
    return match ? [...match.slice(1, 4).map(BigInt), match[4] ? 0n : 1n] : null;
  };
  const x = parse(a), y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
