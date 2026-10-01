import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, MailPlus, Search, ShieldCheck, UserRoundCog, UserRoundX, UsersRound, X } from 'lucide-react';
import { matchesIdentity, slugLabel, venueRoleLabel, venuesLabel, type IdentityDirectory } from '../lib/identity';
import { useLocale } from '../locales';

export type IdentityInvite = { email: string; first_name: string; last_name: string; role: string; venue_ids: string[]; locale: 'en' | 'es' };
type Props = { directory: IdentityDirectory; busy: boolean; error: string | null; notice: string | null; onInvite: (invite: IdentityInvite) => Promise<void> };
const statuses = ['active', 'invited', 'revoked'] as const;

export function UsersPage({ directory, busy, error, notice, onInvite }: Props) {
  const { locale, t } = useLocale();
  const { users, venues, roles } = directory;
  const [query, setQuery] = useState('');
  const [venue, setVenue] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [inviteRole, setInviteRole] = useState(roles.includes('front_desk') ? 'front_desk' : roles[0] ?? '');
  const [inviteVenues, setInviteVenues] = useState<string[]>([]);
  const [inviteLocale, setInviteLocale] = useState<'en' | 'es'>(locale);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => setInviteLocale(locale), [locale]);

  const filtered = useMemo(() => users.filter(person => matchesIdentity(person, { query, venue, role, status })), [users, query, venue, role, status]);
  const presentRoles = useMemo(() => [...new Set(users.map(person => person.role).filter((value): value is string => !!value))].sort(), [users]);
  // Assignable roles only; the current choice survives a refetch when still offered.
  const chosenRole = roles.includes(inviteRole) ? inviteRole : roles.includes('front_desk') ? 'front_desk' : roles[0] ?? '';

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    const venueIds = inviteVenues.filter(id => venues.some(item => item.id === id));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setLocalError('invalidEmail'); return; }
    if (!firstName.trim() || !lastName.trim()) { setLocalError('requiredFields'); return; }
    if (!chosenRole) { setLocalError('identity.error.invalidRole'); return; }
    if (venues.length > 0 && venueIds.length === 0) { setLocalError('identity.error.invalidVenues'); return; }
    setLocalError(null);
    try {
      await onInvite({ email: normalized, first_name: firstName.trim(), last_name: lastName.trim(), role: chosenRole, venue_ids: venueIds, locale: inviteLocale });
      setEmail(''); setFirstName(''); setLastName(''); setInviteVenues([]);
    } catch { /* The parent supplies the localized error message. */ }
  }

  return <div className="page-stack staff-page">
    <div className="page-heading"><div><p className="eyebrow">{t('identity.eyebrow')}</p><h1>{t('identity.title')}</h1><p>{t('identity.lead')}</p></div><div className="heading-accent" aria-hidden="true"><UserRoundCog size={30}/></div></div>
    {(error || localError) && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t(localError || error || 'genericError')}</span></div>}
    {notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}
    <section className="staff-panel" aria-labelledby="identity-invite-title">
      <div className="section-heading"><div><p className="eyebrow">{t('identity.inviteEyebrow')}</p><h2 id="identity-invite-title">{t('identity.inviteTitle')}</h2></div><span className="section-icon"><MailPlus size={22}/></span></div>
      <p className="staff-panel-lead">{t('identity.inviteLead')}</p>
      <form className="staff-invite-form" onSubmit={invite} noValidate>
        <label className="field"><span>{t('emailLabel')}</span><div className="field-control"><input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} placeholder={t('emailPlaceholder')} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.firstName')}</span><div className="field-control"><input type="text" autoComplete="off" value={firstName} onChange={event => setFirstName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.lastName')}</span><div className="field-control"><input type="text" autoComplete="off" value={lastName} onChange={event => setLastName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.venueRole')}</span><select aria-label={t('identity.venueRole')} value={chosenRole} onChange={event => setInviteRole(event.target.value)} disabled={busy}>{roles.map(item => <option key={item} value={item}>{slugLabel(t, 'identity.role', item)}</option>)}</select></label>
        <div className="field identity-wide" role="group" aria-labelledby="identity-invite-venues"><span id="identity-invite-venues">{t('identity.assignedVenues')}</span>
          {venues.length ? <div className="staff-actions">{venues.map(item => <label className="staff-role" key={item.id}><input type="checkbox" checked={inviteVenues.includes(item.id)} disabled={busy} onChange={event => setInviteVenues(event.target.checked ? [...inviteVenues, item.id] : inviteVenues.filter(id => id !== item.id))}/>{item.name}</label>)}</div> : <span className="staff-self-note">{t('emptyDirectory')}</span>}
        </div>
        <label className="field"><span>{t('staff.emailLanguage')}</span><select aria-label={t('staff.emailLanguage')} value={inviteLocale} onChange={event => setInviteLocale(event.target.value as 'en' | 'es')} disabled={busy}><option value="en">English</option><option value="es">Español</option></select></label>
        <button type="submit" className="button button-primary" disabled={busy}><MailPlus size={17}/>{t(busy ? 'staff.sending' : 'staff.sendInvite')}</button>
      </form>
    </section>
    <section className="staff-panel" aria-labelledby="identity-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('staff.directoryEyebrow')}</p><h2 id="identity-list-title">{t('identity.listTitle')}</h2></div><span className="count-pill">{users.length}</span></div>
      <div className="directory-toolbar">
        <label className="search-field"><span className="sr-only">{t('identity.search')}</span><Search size={19}/><input type="search" data-testid="identity-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('identity.searchPlaceholder')}/>{query && <button type="button" aria-label={t('clearSearch')} onClick={() => setQuery('')}><X size={17}/></button>}</label>
        <div className="staff-actions">
          <select data-testid="identity-filter-venue" aria-label={t('identity.filterVenue')} value={venue} onChange={event => setVenue(event.target.value)}><option value="">{t('identity.allVenues')}</option>{venues.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select data-testid="identity-filter-role" aria-label={t('identity.filterRole')} value={role} onChange={event => setRole(event.target.value)}><option value="">{t('identity.allRoles')}</option>{presentRoles.map(item => <option key={item} value={item}>{slugLabel(t, 'identity.role', item)}</option>)}</select>
          <select data-testid="identity-filter-status" aria-label={t('identity.filterStatus')} value={status} onChange={event => setStatus(event.target.value)}><option value="">{t('identity.allStatuses')}</option>{statuses.map(item => <option key={item} value={item}>{t(`staff.status.${item}`)}</option>)}</select>
        </div>
        <span className="directory-count" data-testid="identity-count">{filtered.length} / {users.length}</span>
      </div>
      {filtered.length === 0 ? <div className="staff-empty"><UsersRound size={27}/><strong>{t(users.length ? 'identity.noMatches' : 'identity.emptyTitle')}</strong></div> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>{t('name')}</th><th>{t('identity.venueRole')}</th><th>{t('state')}</th><th>{t('venues')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{filtered.map(person => <tr key={person.user_id} data-testid="identity-row">
        <td data-label={t('name')} className="staff-identity"><strong>{person.full_name?.trim() || t('notProvided')}{person.is_self && <span className="staff-self">{t('staff.you')}</span>}</strong><small>{person.email}</small></td>
        <td data-label={t('identity.venueRole')}><div className="staff-identity"><span className="staff-role"><ShieldCheck size={15}/>{venueRoleLabel(t, person.role)}</span>{person.platform_role && <small>{t('identity.platformTag')}: {slugLabel(t, 'staff.role', person.platform_role)}</small>}</div></td>
        <td data-label={t('state')}><span className={`status-badge staff-status staff-status-${person.status}`}><span className="badge-dot"/>{t(`staff.status.${person.status}`)}</span></td>
        <td data-label={t('venues')}>{venuesLabel(t, person)}</td>
        <td data-label={t('staff.actions')}><Link className="staff-action-link" to={`/admin/users/${encodeURIComponent(person.user_id)}`}>{t('identity.view')}<span className="sr-only"> {person.email}</span><ArrowRight size={14}/></Link></td>
      </tr>)}</tbody></table></div>}
    </section>
  </div>;
}
