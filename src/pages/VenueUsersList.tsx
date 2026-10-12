import { useEffect, useState, type ReactNode } from 'react';
import { Search, UsersRound } from 'lucide-react';
import { useLocale } from '../locales';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { matchesText, matchesUtcDay } from '../lib/adminLists';

type Props<T> = {
  venueId: string; scope: 'owner' | 'admin'; users: T[]; name: (user: T) => string;
  email: (user: T) => string; headers: string[]; row: (user: T) => ReactNode;
  toolbar: ReactNode; beforeToolbar?: ReactNode; className?: string; lead: string;
  status?: (user: T) => string; memberSince?: (user: T) => string | null;
};

// Both views search only the users already returned for their current venue.
// Row actions stay with each view, because their permission contracts differ.
export function VenueUsersList<T>({ venueId, scope, users, name, email, headers, row, toolbar, beforeToolbar, className = '', lead, status, memberSince }: Props<T>) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const { filters, set, clear } = useAdminListFilters();
  const shown = scope === 'admin' ? users.filter(user => matchesText(filters.query, name(user), email(user)) && (!filters.status || status?.(user) === filters.status) && matchesUtcDay(memberSince?.(user), filters.from, filters.to)) : users.filter(user => matchesText(search, name(user), email(user)));
  const pagination = usePrintListPagination(shown.length);
  useEffect(() => { setSearch(''); clear(); pagination.reset(); }, [venueId]);
  const statuses = scope === 'admin' && status ? [...new Set(users.map(status))].sort().map(value => ({ value, label: t(`identity.status.${value}`) })) : undefined;
  const isOwner = scope === 'owner';
  const titleId = isOwner ? 'owner-users-title' : 'venue-users-title';
  return <section className={`staff-panel ${className}`} aria-labelledby={titleId} data-testid={isOwner ? 'owner-users' : undefined}>
    <div className="section-heading"><div><p className="eyebrow">{t(isOwner ? 'ownerUsers.eyebrow' : 'identity.eyebrow')}</p><h2 id={titleId}>{t(isOwner ? 'ownerUsers.title' : 'identity.listTitle')}</h2></div><span className="count-pill" data-testid={isOwner ? 'owner-users-count' : 'venue-users-count'}>{isOwner ? users.length : `${shown.length} / ${users.length}`}</span></div>
    <p className="staff-panel-lead">{lead}</p>
    {beforeToolbar}
    <div className="venue-users-controls">{isOwner ? <label className="field venue-users-search"><span>{t('identity.searchAtVenue')}</span><span className="field-control"><Search size={17} aria-hidden="true"/><input type="search" data-testid="venue-users-search" value={search} onChange={event => { setSearch(event.target.value); pagination.reset(); }} placeholder={t('identity.searchPlaceholder')}/></span></label> : <AdminListFilters id="venue-users" filters={filters} set={(key, value) => { set(key, value); pagination.reset(); }} clear={() => { clear(); pagination.reset(); }} statuses={statuses} dateLabel={memberSince ? t('list.memberSince') : undefined} searchPlaceholder={t('identity.searchPlaceholder')}/>}<div className="staff-actions venue-users-toolbar">{toolbar}</div></div>
    {users.length === 0 ? <div className="staff-empty"><UsersRound size={27}/><strong>{t('identity.emptyTitle')}</strong><span>{t('identity.emptyBody')}</span></div>
      : shown.length === 0 ? <div className="staff-empty" data-testid="venue-users-no-results"><Search size={27}/><strong>{t('identity.noSearchResults')}</strong></div>
      : <div className="staff-table-wrap"><table className={`staff-table ${isOwner ? 'owner-users-table' : ''}`}><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{(isOwner ? shown : shown.slice(pagination.start, pagination.end)).map(row)}</tbody></table></div>}
    {!isOwner && <PrintListPagination pagination={pagination} id="venue-users"/>}
  </section>;
}
