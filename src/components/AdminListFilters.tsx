import { useState } from 'react';
import { useLocale } from '../locales';
import { EMPTY_LIST_FILTERS, type ListFilterState } from '../lib/adminLists';
export { EMPTY_LIST_FILTERS, matchesUtcDay, matchesText } from '../lib/adminLists';
export type { ListFilterState } from '../lib/adminLists';

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
  statuses?: { value: string; label: string }[]; dateLabel?: string; searchPlaceholder?: string; statusLabel?: string;
};

export function AdminListFilters({ id, filters, set, clear, statuses, dateLabel, searchPlaceholder, statusLabel }: Props) {
  const { t } = useLocale();
  const invalid = !!filters.from && !!filters.to && filters.from > filters.to;
  return <div className="admin-list-filters" role="group" aria-label={t('list.filters')} data-testid={`${id}-filters`}>
    <label><span>{t('list.search')}</span><input type="search" value={filters.query} onChange={event => set('query', event.target.value)} placeholder={searchPlaceholder ?? t('list.searchPlaceholder')} data-testid={`${id}-search`}/></label>
    {statuses && <label><span>{statusLabel ?? t('state')}</span><select value={filters.status} onChange={event => set('status', event.target.value)} data-testid={`${id}-status`}><option value="">{t('list.allStates')}</option>{statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
    {dateLabel && <><label><span>{dateLabel}: {t('list.fromUtc')}</span><input type="date" value={filters.from} onChange={event => set('from', event.target.value)} aria-invalid={invalid} data-testid={`${id}-from`}/></label><label><span>{dateLabel}: {t('list.toUtc')}</span><input type="date" value={filters.to} onChange={event => set('to', event.target.value)} aria-invalid={invalid} data-testid={`${id}-to`}/></label></>}
    <button type="button" className="button button-secondary admin-list-clear" disabled={!Object.values(filters).some(Boolean)} onClick={clear}>{t('ps.filter.clear')}</button>
    {invalid && <p className="admin-list-date-error" role="alert">{t('list.dateOrder')}</p>}
  </div>;
}

export function AdminDateFilters({ id, label, from, to, onChange }: { id: string; label: string; from: string; to: string; onChange: (key: 'from' | 'to', value: string) => void }) {
  const { t } = useLocale();
  const invalid = !!from && !!to && from > to;
  return <div className="admin-date-filters" role="group" aria-label={label}>
    <label><span>{label}: {t('list.fromUtc')}</span><input type="date" value={from} onChange={event => onChange('from', event.target.value)} aria-invalid={invalid} data-testid={`${id}-from`}/></label>
    <label><span>{label}: {t('list.toUtc')}</span><input type="date" value={to} onChange={event => onChange('to', event.target.value)} aria-invalid={invalid} data-testid={`${id}-to`}/></label>
    {invalid && <p className="admin-list-date-error" role="alert">{t('list.dateOrder')}</p>}
  </div>;
}
