import { useState } from 'react';
import { useLocale } from '../locales';

export type ListFilterState = { query: string; status: string; from: string; to: string };
export const EMPTY_LIST_FILTERS: ListFilterState = { query: '', status: '', from: '', to: '' };

// Date inputs are interpreted as complete UTC calendar days, including the end day.
export function matchesUtcDay(value: string | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return (!from || time >= Date.parse(`${from}T00:00:00.000Z`)) && (!to || time < Date.parse(`${to}T00:00:00.000Z`) + 86_400_000);
}

export function useAdminListFilters(onChange?: () => void) {
  const [filters, setFilters] = useState<ListFilterState>(EMPTY_LIST_FILTERS);
  const set = (key: keyof ListFilterState, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
    onChange?.();
  };
  const clear = () => { setFilters(EMPTY_LIST_FILTERS); onChange?.(); };
  return { filters, set, clear };
}

type Props = {
  id: string; filters: ListFilterState; set: (key: keyof ListFilterState, value: string) => void; clear: () => void;
  statuses?: { value: string; label: string }[]; dateLabel?: string; searchPlaceholder?: string;
};

export function AdminListFilters({ id, filters, set, clear, statuses, dateLabel, searchPlaceholder }: Props) {
  const { t } = useLocale();
  const invalid = !!filters.from && !!filters.to && filters.from > filters.to;
  return <div className="admin-list-filters" role="group" aria-label={t('list.filters')} data-testid={`${id}-filters`}>
    <label><span>{t('search')}</span><input type="search" value={filters.query} onChange={event => set('query', event.target.value)} placeholder={searchPlaceholder ?? t('searchPlaceholder')} data-testid={`${id}-search`}/></label>
    {statuses && <label><span>{t('state')}</span><select value={filters.status} onChange={event => set('status', event.target.value)} data-testid={`${id}-status`}><option value="">{t('list.allStates')}</option>{statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
    {dateLabel && <><label><span>{dateLabel}: {t('list.fromUtc')}</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={event => set('from', event.target.value)} data-testid={`${id}-from`}/></label><label><span>{dateLabel}: {t('list.toUtc')}</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={event => set('to', event.target.value)} data-testid={`${id}-to`}/></label></>}
    <button type="button" className="button button-secondary admin-list-clear" disabled={!Object.values(filters).some(Boolean)} onClick={clear}>{t('ps.filter.clear')}</button>
    {invalid && <p className="admin-list-date-error" role="alert">{t('list.dateOrder')}</p>}
  </div>;
}

export function matchesText(query: string, ...values: (string | null | undefined)[]) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || values.some(value => value?.toLocaleLowerCase().includes(needle));
}
