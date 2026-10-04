import { useEffect, useState, type FormEvent } from 'react';
import { Check, KeyRound, MailPlus, ShieldCheck, UserRoundX, X } from 'lucide-react';
import type { OwnerOperation, OwnerUser, OwnerUserAction, OwnerUserInvite, OwnerUsers } from '../lib/ownerUsers';
import { slugLabel, venueRoleLabel } from '../lib/venueUsers';
import { useLocale } from '../locales';
import { PortalDialog } from '../components/PortalDialog';
import { VenueUsersList } from './VenueUsersList';

type Props = {
  data: OwnerUsers; busy: boolean; error: string | null; notice: string | null;
  onInvite: (invite: OwnerUserInvite) => Promise<void>;
  onAction: (action: OwnerUserAction, person: OwnerUser, value: string | boolean) => Promise<void>;
  onOwnerChange: (operation: OwnerOperation, person: OwnerUser, role?: string) => Promise<void>;
};
type Pending = { userId: string; action: OwnerUserAction; value: string | boolean } | { userId: string; action: OwnerOperation; value?: string };

// Members of the owner's selected venue. Every change applies to this venue only.
export function OwnerUsersSection({ data, busy, error, notice, onInvite, onAction, onOwnerChange }: Props) {
  const { locale, t } = useLocale();
  const { venue, users, roles, invite_roles } = data;
  const [inviting, setInviting] = useState(false);
  const [confirmInviteOwner, setConfirmInviteOwner] = useState(false);
  const [ownerInviteDraft, setOwnerInviteDraft] = useState<OwnerUserInvite | null>(null);
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

  const chosenRole = invite_roles.includes(inviteRole) ? inviteRole : roles.find(role => invite_roles.includes(role) && role === 'front_desk') ?? roles.find(role => invite_roles.includes(role)) ?? invite_roles[0] ?? '';
  const target = pending ? users.find(person => person.user_id === pending.userId) : undefined;
  const fill = (key: string, values: Record<string, string>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
  const displayName = (person: OwnerUser) => person.full_name?.trim() || person.email;

  function closeInvite() { setInviting(false); setConfirmInviteOwner(false); setOwnerInviteDraft(null); setLocalError(null); setFailed(false); }
  function openInvite() { setLocalError(null); setFailed(false); setConfirmInviteOwner(false); setOwnerInviteDraft(null); setInviting(true); }
  function ask(person: OwnerUser, action: Pending['action'], value?: string | boolean) {
    setFailed(false);
    setPending({ userId: person.user_id, action, value } as Pending);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmInviteOwner) return;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setLocalError('invalidEmail'); return; }
    if (!firstName.trim() || !lastName.trim()) { setLocalError('requiredFields'); return; }
    if (!chosenRole) { setLocalError('identity.error.invalidRole'); return; }
    setLocalError(null); setFailed(false);
    const draft: OwnerUserInvite = { email: normalized, first_name: firstName.trim(), last_name: lastName.trim(), role: chosenRole, locale: inviteLocale };
    if (chosenRole === 'owner') { setOwnerInviteDraft(draft); setConfirmInviteOwner(true); return; }
    await sendInvite(draft);
  }
  async function sendInvite(draft: OwnerUserInvite, confirmed = false) {
    try {
      await onInvite({ ...draft, ...(confirmed ? { confirm: true as const } : {}) });
      setEmail(''); setFirstName(''); setLastName(''); closeInvite();
    } catch { setFailed(true); /* The parent supplies the localized error message. */ }
  }
  async function confirm() {
    if (!pending || !target) return;
    try {
      if (pending.action === 'appoint' || pending.action === 'demote' || pending.action === 'remove') await onOwnerChange(pending.action, target, pending.value);
      else if (pending.value !== undefined) await onAction(pending.action, target, pending.value);
      setPending(null);
    }
    catch { setFailed(true); /* Leave the confirmation visible for a retry. */ }
  }
  function pendingText(person: OwnerUser) {
    const values = { name: displayName(person), venue: venue.name };
    if (pending?.action === 'appoint') return fill('ownerUsers.confirmAppoint', values);
    if (pending?.action === 'demote') return fill('ownerUsers.confirmDemote', { ...values, role: venueRoleLabel(t, String(pending.value)) });
    if (pending?.action === 'remove') return fill('ownerUsers.confirmRemoveOwner', values);
    if (pending?.action === 'set_role') return fill('ownerUsers.confirmRole', { ...values, role: venueRoleLabel(t, String(pending.value)) });
    return fill(pending?.value === true ? 'ownerUsers.confirmGrantPortal' : 'ownerUsers.confirmRemovePortal', values);
  }
  const lockedNote = (person: OwnerUser) => t(person.locked === 'self' ? 'ownerUsers.lockedSelf' : person.locked === 'owner' ? 'ownerUsers.lockedOwner' : 'identity.protectedNote');

  return <div className="owner-users-wrapper">
    <VenueUsersList venueId={venue.id} scope="owner" users={users} name={displayName} email={person => person.email} lead={fill('ownerUsers.lead', { venue: venue.name })} headers={[t('name'), t('email'), t('identity.roleHere'), t('ownerUsers.portalAccess'), t('staff.actions')]} className="owner-users"
      beforeToolbar={<>{(error || (localError && !inviting)) && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t((!inviting && localError) || error || 'genericError')}</span></div>}{notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}</>}
      toolbar={<button type="button" className="button button-primary" data-testid="owner-users-invite" disabled={busy || !invite_roles.length} onClick={openInvite}><MailPlus size={17}/>{t('identity.invite')}</button>}
      row={person => <tr key={person.user_id} data-testid="owner-user-row">
      <td data-label={t('name')} className="staff-identity"><strong>{person.full_name?.trim() || t('notProvided')}{person.is_self && <span className="staff-self">{t('staff.you')}</span>}</strong><small>{slugLabel(t, 'identity.status', person.status)}</small></td>
      <td data-label={t('email')}><span className="venue-user-email">{person.email}</span></td>
      <td data-label={t('identity.roleHere')}><span className="staff-role"><ShieldCheck size={15}/>{venueRoleLabel(t, person.role)}</span></td>
      <td data-label={t('ownerUsers.portalAccess')}><span className={`status-badge staff-status staff-status-${person.role === 'owner' || person.portal_access ? 'active' : 'revoked'}`} data-testid="owner-user-portal"><span className="badge-dot"/>{t(person.role === 'owner' ? 'ownerUsers.portalAlways' : person.portal_access ? 'ownerUsers.portalYes' : 'ownerUsers.portalNo')}</span></td>
      <td data-label={t('staff.actions')} className="staff-actions-cell">
        {person.locked === 'self' || person.locked === 'super_admin' || (person.locked === 'owner' && !person.owner_actions.length) ? <span className="staff-self-note">{lockedNote(person)}</span> : <div className="staff-actions">
          {(person.role !== 'owner' || person.owner_actions.includes('demote')) && <select aria-label={`${t('identity.changeRole')}: ${person.email}`} value={person.role} onChange={event => {
            const role = event.target.value;
            if (role === 'owner') ask(person, 'appoint');
            else ask(person, person.role === 'owner' ? 'demote' : 'set_role', role);
          }} disabled={busy}>
            {!roles.includes(person.role) && person.role !== 'owner' && <option value={person.role} disabled>{venueRoleLabel(t, person.role)}</option>}
            {person.role === 'owner' && <option value="owner">{venueRoleLabel(t, 'owner')}</option>}
            {roles.map(item => <option key={item} value={item}>{venueRoleLabel(t, item)}</option>)}
            {person.role !== 'owner' && person.owner_actions.includes('appoint') && <option value="owner">{venueRoleLabel(t, 'owner')}</option>}
          </select>}
          {person.role === 'owner' ? person.owner_actions.includes('remove') && <button className="staff-action-link danger" type="button" data-testid="owner-user-remove" disabled={busy} onClick={() => ask(person, 'remove')}><UserRoundX size={14}/>{t('ownerUsers.removeOwner')}</button> : <button className={`staff-action-link ${person.portal_access ? 'danger' : ''}`} type="button" data-testid="owner-user-portal-toggle" disabled={busy} onClick={() => ask(person, 'set_portal_access', !person.portal_access)}><KeyRound size={14}/>{t(person.portal_access ? 'ownerUsers.removePortal' : 'ownerUsers.grantPortal')}</button>}
        </div>}
      </td>
    </tr>}/>
    {inviting && <PortalDialog title={t(confirmInviteOwner ? 'ownerUsers.confirmInviteTitle' : 'identity.inviteTitle')} titleId="owner-invite-title" descriptionId="owner-invite-lead" testId="owner-invite-dialog" onClose={closeInvite} dismissible={!busy} alert={confirmInviteOwner} actions={confirmInviteOwner ? <><button className="button button-primary" type="button" disabled={busy || !ownerInviteDraft} onClick={() => ownerInviteDraft && void sendInvite(ownerInviteDraft, true)}><Check size={15}/>{t(busy ? 'staff.sending' : 'ownerUsers.confirmInviteButton')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => { setConfirmInviteOwner(false); setOwnerInviteDraft(null); }}><X size={15}/>{t('staff.cancel')}</button></> : <><button className="button button-primary" type="submit" form="owner-invite-form" disabled={busy}><MailPlus size={15}/>{t(busy ? 'staff.sending' : 'staff.sendInvite')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={closeInvite}><X size={15}/>{t('staff.cancel')}</button></>}>
      <p id="owner-invite-lead" className="ps-dialog-sub">{confirmInviteOwner && ownerInviteDraft ? fill('ownerUsers.confirmInviteOwner', { name: `${ownerInviteDraft.first_name} ${ownerInviteDraft.last_name}`, email: ownerInviteDraft.email, venue: venue.name }) : fill(chosenRole === 'owner' ? 'ownerUsers.inviteOwnerLead' : 'ownerUsers.inviteLead', { venue: venue.name })}</p>
      {(localError || (failed && error)) && <div className="form-error" role="alert">{t(localError || error || 'genericError')}</div>}
      {!confirmInviteOwner && <form id="owner-invite-form" className="staff-invite-form venue-invite-form" onSubmit={invite} noValidate>
        <label className="field"><span>{t('emailLabel')}</span><div className="field-control"><input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.firstName')}</span><div className="field-control"><input type="text" autoComplete="off" value={firstName} onChange={event => setFirstName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.lastName')}</span><div className="field-control"><input type="text" autoComplete="off" value={lastName} onChange={event => setLastName(event.target.value)} disabled={busy} required /></div></label>
        <label className="field"><span>{t('identity.roleHere')}</span><select value={chosenRole} onChange={event => setInviteRole(event.target.value)} disabled={busy}>{invite_roles.map(item => <option key={item} value={item}>{venueRoleLabel(t, item)}</option>)}</select></label>
        <label className="field"><span>{t('staff.emailLanguage')}</span><select value={inviteLocale} onChange={event => setInviteLocale(event.target.value as 'en' | 'es')} disabled={busy}><option value="en">English</option><option value="es">Español</option></select></label>
      </form>}
    </PortalDialog>}
    {pending && target && <PortalDialog title={t('identity.confirmTitle')} titleId="owner-user-confirm-title" descriptionId="owner-user-confirm-body" testId="owner-user-confirm" onClose={() => setPending(null)} dismissible={!busy} alert actions={<><button className={`button button-primary ${(pending.action === 'remove' || pending.action === 'demote' || pending.action === 'set_portal_access' && pending.value === false) ? 'ps-danger-solid' : ''}`} type="button" disabled={busy} onClick={() => void confirm()}><Check size={15}/>{t('staff.confirm')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}><X size={15}/>{t('staff.cancel')}</button></>}><p id="owner-user-confirm-body">{pendingText(target)}</p>{failed && error && <div className="form-error" role="alert">{t(error)}</div>}</PortalDialog>}
  </div>;
}
