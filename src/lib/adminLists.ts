// PE-409: complete UTC calendar days. Backend upper bound is exclusive.
export type ListFilterState = { query: string; status: string; from: string; to: string };
export const EMPTY_LIST_FILTERS: ListFilterState = { query: '', status: '', from: '', to: '' };
export function validDateRange(from: string, to: string) { return !from || !to || from <= to; }
export function utcBounds(from: string, to: string) {
  if (!validDateRange(from, to)) throw new Error('invalid_range');
  return { p_from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : null,
    p_to: to ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString() : null };
}
export function matchesUtcDay(value: string | null | undefined, from: string, to: string) {
  if (!validDateRange(from, to)) return false;
  if (!from && !to) return true;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) && (!from || time >= Date.parse(`${from}T00:00:00.000Z`)) && (!to || time < Date.parse(`${to}T00:00:00.000Z`) + 86_400_000);
}
export function matchesText(query: string, ...values: (string | null | undefined)[]) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || values.some(value => value?.toLocaleLowerCase().includes(needle));
}
