export function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function persist(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Memory still works without storage. */ }
}
export function clearVenueSelection() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('playerp.portal.venue.')) localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}
export function recoveryPending(value?: boolean): boolean {
  try {
    if (value !== undefined) {
      if (value) sessionStorage.setItem('playerp.portal.recovery', '1');
      else sessionStorage.removeItem('playerp.portal.recovery');
    }
    return sessionStorage.getItem('playerp.portal.recovery') === '1';
  } catch { return value ?? false; }
}
