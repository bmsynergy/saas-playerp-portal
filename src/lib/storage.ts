import { AUXILIARY_STORAGE_PREFIX } from './config';
export function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function persist(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Memory still works without storage. */ }
}
export function clearVenueSelection() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(`${AUXILIARY_STORAGE_PREFIX}venue.`)) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}
export function recoveryPending(value?: boolean): boolean {
  try {
    if (value !== undefined) {
      if (value) sessionStorage.setItem(`${AUXILIARY_STORAGE_PREFIX}recovery`, '1');
      else sessionStorage.removeItem(`${AUXILIARY_STORAGE_PREFIX}recovery`);
    }
    return sessionStorage.getItem(`${AUXILIARY_STORAGE_PREFIX}recovery`) === '1';
  } catch { return value ?? false; }
}

export function invitationPending(value?: boolean): boolean {
  try {
    if (value !== undefined) {
      if (value) sessionStorage.setItem(`${AUXILIARY_STORAGE_PREFIX}invitation`, '1');
      else sessionStorage.removeItem(`${AUXILIARY_STORAGE_PREFIX}invitation`);
    }
    return sessionStorage.getItem(`${AUXILIARY_STORAGE_PREFIX}invitation`) === '1';
  } catch { return value ?? false; }
}
