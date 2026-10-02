import { useEffect, useState, type FormEvent } from 'react';
import { Check, MailPlus, RotateCcw, ShieldCheck, UserRoundX, UsersRound, X } from 'lucide-react';
import { otherVenuesLabel, slugLabel, venueRoleLabel, type VenueUser, type VenueUserAction, type VenueUserInvite, type VenueUsers } from '../lib/venueUsers';
import { useLocale } from '../locales';
import { PortalDialog } from '../components/PortalDialog';

type Props = {
  data: VenueUsers; busy: boolean; error: string | null; notice: string | null;
  onInvite: (invite: VenueUserInvite) => Promise<void>;
  onAction: (action: VenueUserAction, person: VenueUser, value?: string) => Promise<void>;
};
type Pending = { userId: string; action: VenueUserAction; value?: string };

// Users of ONE venue. Role changes and revocations never reach another venue.
export function VenueUsersTab({ data, busy, error, notice, onInvite, onAction }: Props) {
  const { locale, t } = useLocale();
  const { venue, users, roles } = data;
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteLocale, setInviteLocale] = useState<'en' | 'es'>(locale);
  const [pending, setPending] = useState<Pending | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // A dialog only repeats the error of its own failed request, never a stale one.
  const [failed, setFailed] = useState(false);

  useEffect(() => setInviteLocale(locale), [locale]);

  // Assignable roles only; the current choice survives a refetch when still offered.
  const chosenRole = roles.includes(inviteRole) ? inviteRole : roles.includes('front_desk') ? 'front_desk' : roles[0] ?? '';
  const target = pending ? users.find(person => person.user_id === pending.userId) : undefined;
  const fill = (key: string, values: Record<string, string>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
  const displayName = (person: VenueUser) => person.full_name?.trim() || person.email;

  function openInvite() { setLocalError(null); setFailed(false); setInviting(true); }
  function ask(person: VenueUser, action: VenueUserAction, value?: string) { setFailed(false); setPending({ userId: person.user_id, action, value }); }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setLocalError('invalidEmail'); return; }
    if (!firstName.trim() || !lastName.trim()) { setLocalError('requiredFields'); return; }
    if (!chosenRole) { setLocalError('identity.error.invalidRole'); return; }
    setLocalError(null); setFailed(false);
    try {
      await onInvite({ email: normalized, first_name: firstName.trim(), last_name: lastName.trim(), role: chosenRole, locale: inviteLocale });
      setEmail(''); setFirstName(''); setLastName(''); setInviting(false);
    } catch { setFailed(true); /* The parent supplies the localized error message. */ }
  }
  async function confirm() {
    if (!pending || !target) return;
    try { await onAction(pending.action, target, pending.value); setPending(null); }
    catch { setFailed(true); /* Leave the confirmation visible for a retry. */ }
  }
  function pendingText(person: VenueUser) {
    const values = { name: displayName(person), venue: venue.name };
    if (pending?.action === 'set_role') return fill('identity.confirmRole', { ...values, role: venueRoleLabel(t, pending.value ?? '') });
    return fill(pending?.action === 'revoke' ? 'identity.confirmRevoke' : 'identity.confirmRecovery', values);
  }

  return <div className="page-stack staff-page" data-testid="venue-users">
    {(error || (localError && !inviting)) && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t((!inviting && localError) || error || 'genericError')}</span></div>}
    {notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}
    <section className="staff-panel" aria-labelledby="venue-users-title">
      <div className="section-heading"><div><p className="eyebrow">{t('identity.eyebrow')}</p><h2 id="venue-users-title">{t('identity.listTitle')}</h2></div><span className="count-pill" data-testid="venue-users-count">{users.length}</span></div>
      <p className="staff-panel-lead">{fill('identity.lead', { venue: venue.name })}</p>
      <div className="staff-actions venue-users-toolbar"><button type="button" className="button button-primary" data-testid="venue-users-invite" disabled={busy || !roles.length} onClick={openInvite}><MailPlus size={17}/>{t('identity.invite')}</button></div>
      {users.length === 0 ? <div className="staff-empty"><UsersRound size={27}/><strong>{t('identity.emptyTitle')}</strong><span>{t('identity.emptyBody')}</span></div> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('identity.roleHere')}</th><th>{t('state')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{users.map(person => {
        const others = otherVenuesLabel(t, person.other_venue_count);
        return <tr key={person.user_id} data-testid="venue-user-row">
          <td data-label={t('name')} className="staff-identity"><strong>{person.full_name?.trim() || t('notProvided')}{person.is_self && <span className="staff-self">{t('staff.you')}</span>}</strong>{others && <small title={t('identity.otherVenuesHint')}>{others}</small>}</td>
          <td data-label={t('email')}><span className="venue-user-email">{person.email}</span></td>
          <td data-label={t('identity.roleHere')}><span className="staff-role"><ShieldCheck size={15}/>{venueRoleLabel(t, person.role)}</span></td>
          <td data-label={t('state')}><span className={`status-badge staff-status staff-status-${person.status === 'inactive' ? 'revoked' : person.status}`}><span className="badge-dot"/>{slugLabel(t, 'identity.status', person.status)}</span></td>
          <td data-label={t('staff.actions')} className="staff-actions-cell">
            {person.protected ? <span className="staff-self-note">{t('identity.protectedNote')}</span> : person.is_self ? <span className="staff-self-note">{t('staff.selfProtected')}</span> : <div className="staff-actions">
              <select aria-label={`${t('identity.changeRole')}: ${person.email}`} value={roles.includes(person.role) ? person.role : ''} onChange={event => ask(person, 'set_role', event.target.value)} disabled={busy}>{!roles.includes(person.role) && <option value="" disabled>{venueRoleLabel(t, person.role)}</option>}{roles.map(item => <option key={item} value={item}>{venueRoleLabel(t, item)}</option>)}</select>
              {person.status !== 'inactive' && <button className="staff-action-link" type="button" disabled={busy} onClick={() => ask(person, 'send_recovery')}><RotateCcw size={14}/>{t('identity.recovery')}</button>}
              <button className="staff-action-link danger" type="button" disabled={busy} onClick={() => ask(person, 'revoke')}>{t('identity.revoke')}</button>
            </div>}
          </td>
        </tr>;
      })}</tbody></table></div>}
    </section>
    {inviting && <PortalDialog title={t('identity.inviteTitle')} titleId="venue-invite-title" descriptionId="venue-invite-lead" testId="venue-invite-dialog" onClose={() => setInviting(false)} dismissible={!busy} actions={<><button className="button button-primary" type="submit" form="venue-invite-form" disabled={busy}><MailPlus size={15}/>{t(busy ? 'staff.sending' : 'staff.sendInvite')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setInviting(false)}><X size={15}/>{t('staff.cancel')}</button></>}>
      <p id="venue-invite-lead" className="ps-dialog-sub">{fill('identity.inviteLead', { venue: venue.name })}</p>
      {(localError || (failed && error)) && <div className="form-error" role="alert">{t(localError || error || 'genericError')}</div>}
      <form id="venue-invite-form" className="staff-invite-form venue-invite-form" onSubmit={invite} noValidate>
        <label className="field"><span>{t('emailLabel')}</span><div className="field-control"><input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.firstName')}</span><div className="field-control"><input type="text" autoComplete="off" value={firstName} onChange={event => setFirstName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.lastName')}</span><div className="field-control"><input type="text" autoComplete="off" value={lastName} onChange={event => setLastName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.roleHere')}</span><select value={chosenRole} onChange={event => setInviteRole(event.target.value)} disabled={busy}>{roles.map(item => <option key={item} value={item}>{venueRoleLabel(t, item)}</option>)}</select></label>
        <label className="field"><span>{t('staff.emailLanguage')}</span><select value={inviteLocale} onChange={event => setInviteLocale(event.target.value as 'en' | 'es')} disabled={busy}><option value="en">English</option><option value="es">Español</option></select></label>
      </form>
    </PortalDialog>}
    {pending && target && <PortalDialog title={t('identity.confirmTitle')} titleId="venue-user-confirm-title" descriptionId="venue-user-confirm-body" testId="venue-user-confirm" onClose={() => setPending(null)} dismissible={!busy} alert actions={<><button className={`button button-primary ${pending.action === 'revoke' ? 'ps-danger-solid' : ''}`} type="button" disabled={busy} onClick={() => void confirm()}><Check size={15}/>{t('staff.confirm')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}><X size={15}/>{t('staff.cancel')}</button></>}><p id="venue-user-confirm-body">{pendingText(target)}</p>{failed && error && <div className="form-error" role="alert">{t(error)}</div>}</PortalDialog>}
  </div>;
}
