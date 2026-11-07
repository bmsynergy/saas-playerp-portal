// PE-600: presentation only. Counts and the presence of a blocked edition are not a verdict.
export type FirmwareStatus = 'load_failed' | 'update_available' | 'channel_restricted' | 'gated' | 'incompatible_newer' | 'up_to_date' | 'none_offered' | 'unknown';
type Input = { reason: string | null; update_available?: boolean; newest_signed?: unknown; newer_blocked?: {detail: string} | null };
export function firmwareStatus(update: Input | null | undefined, loadFailed = false): FirmwareStatus {
  if (loadFailed || !update) return 'load_failed';
  switch (update.reason) {
    case null: return update.update_available === true ? 'update_available' : 'unknown';
    case 'newer_not_enabled': return update.newer_blocked?.detail === 'ring_disabled' ? 'channel_restricted' : 'gated';
    case 'newer_incompatible': return 'incompatible_newer';
    case 'up_to_date': return update.newest_signed ? 'up_to_date' : 'none_offered';
    default: return 'unknown';
  }
}
export function capabilityReason(reason: string | null | undefined, t: (key:string)=>string): string {
  if (!reason) return t('ps600.reason.unavailable');
  const key = `ps600.reason.${reason}`, translated = t(key);
  return translated === key ? `${t('ps600.reason.unavailable')} (${reason})` : translated;
}
