// Stable firmware contract uses plain major.minor.patch. Unknown versions fail closed.
export function compareFirmware(a: string | null, b: string | null): number | null {
  const parse = (v: string | null) => v && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v) ? v.split('.').map(BigInt) : null;
  const x = parse(a), y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
export type StableFirmware = { edition_id: string; version: string; model: string; arch: string };
export function firmwareBlockReason(installed: string | null, latest: StableFirmware | null, model: string | null, arch: string | null, serverAvailable: boolean, serverReason: string | null): string | null {
  if (!model || !arch || compareFirmware(installed, installed) === null) return 'metadata_missing';
  if (!latest) return serverReason === 'no_stable_release' ? 'no_stable_release' : 'metadata_missing';
  if (latest.model !== model || latest.arch !== arch) return 'incompatible';
  const cmp = compareFirmware(latest.version, installed);
  if (cmp === null) return 'metadata_missing';
  if (cmp <= 0) return 'up_to_date';
  return serverReason || (serverAvailable ? null : 'not_authorized');
}
