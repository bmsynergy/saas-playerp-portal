import { useEffect, useState, type ReactNode } from 'react';
import { Search, UsersRound } from 'lucide-react';
import { useLocale } from '../locales';

type Props<T> = {
  venueId: string; scope: 'owner' | 'admin'; users: T[]; name: (user: T) => string;
  email: (user: T) => string; headers: string[]; row: (user: T) => ReactNode;
  toolbar: ReactNode; beforeToolbar?: ReactNode; className?: string; lead: string;
};

// Both views search only the users already returned for their current venue.
// Row actions stay with each view, because their permission contracts differ.
export function VenueUsersList<T>({ venueId, scope, users, name, email, headers, row, toolbar, beforeToolbar, className = '', lead }: Props<T>) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  useEffect(() => setSearch(''), [venueId]);
  const query = search.trim().toLocaleLowerCase();
  const shown = query ? users.filter(user => [name(user), email(user)].some(value => value.toLocaleLowerCase().includes(query))) : users;
  const isOwner = scope === 'owner';
  const titleId = isOwner ? 'owner-users-title' : 'venue-users-title';
  return <section className={`staff-panel ${className}`} aria-labelledby={titleId} data-testid={isOwner ? 'owner-users' : undefined}>
    <div className="section-heading"><div><p className="eyebrow">{t(isOwner ? 'ownerUsers.eyebrow' : 'identity.eyebrow')}</p><h2 id={titleId}>{t(isOwner ? 'ownerUsers.title' : 'identity.listTitle')}</h2></div><span className="count-pill" data-testid={isOwner ? 'owner-users-count' : 'venue-users-count'}>{users.length}</span></div>
    <p className="staff-panel-lead">{lead}</p>
    {beforeToolbar}
    <div className="venue-users-controls"><label className="field venue-users-search"><span>{t('identity.searchAtVenue')}</span><span className="field-control"><Search size={17} aria-hidden="true"/><input type="search" data-testid="venue-users-search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('identity.searchPlaceholder')}/></span></label><div className="staff-actions venue-users-toolbar">{toolbar}</div></div>
    {users.length === 0 ? <div className="staff-empty"><UsersRound size={27}/><strong>{t('identity.emptyTitle')}</strong><span>{t('identity.emptyBody')}</span></div>
      : shown.length === 0 ? <div className="staff-empty" data-testid="venue-users-no-results"><Search size={27}/><strong>{t('identity.noSearchResults')}</strong></div>
      : <div className="staff-table-wrap"><table className={`staff-table ${isOwner ? 'owner-users-table' : ''}`}><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{shown.map(row)}</tbody></table></div>}
  </section>;
}
