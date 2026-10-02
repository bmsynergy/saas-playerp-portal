import { useEffect, useState, type FormEvent } from 'react';
import { Check, KeyRound, MailPlus, ShieldCheck, UserRoundX, X } from 'lucide-react';
import type { OwnerUser, OwnerUserAction, OwnerUserInvite, OwnerUsers } from '../lib/ownerUsers';
import { slugLabel, venueRoleLabel } from '../lib/venueUsers';
import { useLocale } from '../locales';
import { PortalDialog } from '../components/PortalDialog';
import { VenueUsersList } from './VenueUsersList';

type Props = {
  data: OwnerUsers; busy: boolean; error: string | null; notice: string | null;
  onInvite: (invite: OwnerUserInvite) => Promise<void>;
  onAction: (action: OwnerUserAction, person: OwnerUser, value: string | boolean) => Promise<void>;
};
type Pending = { userId: string; action: OwnerUserAction; value: string | boolean };

// Members of the owner's selected venue. Every change applies to this venue only.
export function OwnerUsersSection({ data, busy, error, notice, onInvite, onAction }: Props) {
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

  const chosenRole = roles.includes(inviteRole) ? inviteRole : roles.includes('front_desk') ? 'front_desk' : roles[0] ?? '';
  const target = pending ? users.find(person => person.user_id === pending.userId) : undefined;
  const fill = (key: string, values: Record<string, string>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
  const displayName = (person: OwnerUser) => person.full_name?.trim() || person.email;

  function openInvite() { setLocalError(null); setFailed(false); setInviting(true); }
  function ask(person: OwnerUser, action: OwnerUserAction, value: string | boolean) { setFailed(false); setPending({ userId: person.user_id, action, value }); }

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
  function pendingText(person: OwnerUser) {
    const values = { name: displayName(person), venue: venue.name };
    if (pending?.action === 'set_role') return fill('ownerUsers.confirmRole', { ...values, role: venueRoleLabel(t, String(pending.value)) });
    return fill(pending?.value === true ? 'ownerUsers.confirmGrantPortal' : 'ownerUsers.confirmRemovePortal', values);
  }
  const lockedNote = (person: OwnerUser) => t(person.locked === 'self' ? 'ownerUsers.lockedSelf' : person.locked === 'owner' ? 'ownerUsers.lockedOwner' : 'identity.protectedNote');

  return <div className="owner-users-wrapper">
    <VenueUsersList venueId={venue.id} scope="owner" users={users} name={displayName} email={person => person.email} lead={fill('ownerUsers.lead', { venue: venue.name })} headers={[t('name'), t('email'), t('identity.roleHere'), t('ownerUsers.portalAccess'), t('staff.actions')]} className="owner-users"
      beforeToolbar={<>{(error || (localError && !inviting)) && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t((!inviting && localError) || error || 'genericError')}</span></div>}{notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}</>}
      toolbar={<button type="button" className="button button-primary" data-testid="owner-users-invite" disabled={busy || !roles.length} onClick={openInvite}><MailPlus size={17}/>{t('identity.invite')}</button>}
      row={person => <tr key={person.user_id} data-testid="owner-user-row">
      <td data-label={t('name')} className="staff-identity"><strong>{person.full_name?.trim() || t('notProvided')}{person.is_self && <span className="staff-self">{t('staff.you')}</span>}</strong><small>{slugLabel(t, 'identity.status', person.status)}</small></td>
      <td data-label={t('email')}><span className="venue-user-email">{person.email}</span></td>
      <td data-label={t('identity.roleHere')}><span className="staff-role"><ShieldCheck size={15}/>{venueRoleLabel(t, person.role)}</span></td>
      <td data-label={t('ownerUsers.portalAccess')}><span className={`status-badge staff-status staff-status-${person.portal_access ? 'active' : 'revoked'}`} data-testid="owner-user-portal"><span className="badge-dot"/>{t(person.role === 'owner' ? 'ownerUsers.portalAlways' : person.portal_access ? 'ownerUsers.portalYes' : 'ownerUsers.portalNo')}</span></td>
      <td data-label={t('staff.actions')} className="staff-actions-cell">
        {person.locked ? <span className="staff-self-note">{lockedNote(person)}</span> : <div className="staff-actions">
          <select aria-label={`${t('identity.changeRole')}: ${person.email}`} value={roles.includes(person.role) ? person.role : ''} onChange={event => ask(person, 'set_role', event.target.value)} disabled={busy}>{!roles.includes(person.role) && <option value="" disabled>{venueRoleLabel(t, person.role)}</option>}{roles.map(item => <option key={item} value={item}>{venueRoleLabel(t, item)}</option>)}</select>
          <button className={`staff-action-link ${person.portal_access ? 'danger' : ''}`} type="button" data-testid="owner-user-portal-toggle" disabled={busy} onClick={() => ask(person, 'set_portal_access', !person.portal_access)}><KeyRound size={14}/>{t(person.portal_access ? 'ownerUsers.removePortal' : 'ownerUsers.grantPortal')}</button>
        </div>}
      </td>
    </tr>}/>
    {inviting && <PortalDialog title={t('identity.inviteTitle')} titleId="owner-invite-title" descriptionId="owner-invite-lead" testId="owner-invite-dialog" onClose={() => setInviting(false)} dismissible={!busy} actions={<><button className="button button-primary" type="submit" form="owner-invite-form" disabled={busy}><MailPlus size={15}/>{t(busy ? 'staff.sending' : 'staff.sendInvite')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setInviting(false)}><X size={15}/>{t('staff.cancel')}</button></>}>
      <p id="owner-invite-lead" className="ps-dialog-sub">{fill('ownerUsers.inviteLead', { venue: venue.name })}</p>
      {(localError || (failed && error)) && <div className="form-error" role="alert">{t(localError || error || 'genericError')}</div>}
      <form id="owner-invite-form" className="staff-invite-form venue-invite-form" onSubmit={invite} noValidate>
        <label className="field"><span>{t('emailLabel')}</span><div className="field-control"><input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.firstName')}</span><div className="field-control"><input type="text" autoComplete="off" value={firstName} onChange={event => setFirstName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.lastName')}</span><div className="field-control"><input type="text" autoComplete="off" value={lastName} onChange={event => setLastName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.roleHere')}</span><select value={chosenRole} onChange={event => setInviteRole(event.target.value)} disabled={busy}>{roles.map(item => <option key={item} value={item}>{venueRoleLabel(t, item)}</option>)}</select></label>
        <label className="field"><span>{t('staff.emailLanguage')}</span><select value={inviteLocale} onChange={event => setInviteLocale(event.target.value as 'en' | 'es')} disabled={busy}><option value="en">English</option><option value="es">Español</option></select></label>
      </form>
    </PortalDialog>}
    {pending && target && <PortalDialog title={t('identity.confirmTitle')} titleId="owner-user-confirm-title" descriptionId="owner-user-confirm-body" testId="owner-user-confirm" onClose={() => setPending(null)} dismissible={!busy} alert actions={<><button className={`button button-primary ${pending.action === 'set_portal_access' && pending.value === false ? 'ps-danger-solid' : ''}`} type="button" disabled={busy} onClick={() => void confirm()}><Check size={15}/>{t('staff.confirm')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}><X size={15}/>{t('staff.cancel')}</button></>}><p id="owner-user-confirm-body">{pendingText(target)}</p>{failed && error && <div className="form-error" role="alert">{t(error)}</div>}</PortalDialog>}
  </div>;
}
