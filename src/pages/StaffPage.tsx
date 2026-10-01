import { useEffect, useState, type FormEvent } from 'react';
import { Check, Clock3, MailPlus, RotateCcw, ShieldCheck, UserRoundX, UsersRound, X } from 'lucide-react';
import { useLocale } from '../locales';

export type StaffRole = 'super_admin' | 'support' | 'operations';
export type StaffMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: StaffRole;
  status: 'active' | 'invited' | 'revoked';
  active: boolean;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  is_self: boolean;
};

export type StaffAction = 'set_role' | 'set_status' | 'send_recovery';
type Props = {
  members: StaffMember[];
  currentUserId: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onInvite: (email: string, role: StaffRole, locale: 'en' | 'es') => Promise<void>;
  onAction: (action: StaffAction, member: StaffMember, value?: string) => Promise<void>;
};
type Pending = { userId: string; action: StaffAction; value?: string };

export function StaffPage({ members, currentUserId, busy, error, notice, onInvite, onAction }: Props) {
  const { locale, t } = useLocale();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [inviteLocale, setInviteLocale] = useState<'en' | 'es'>(locale);
  const [pending, setPending] = useState<Pending | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';

  useEffect(() => setInviteLocale(locale), [locale]);

  function formatDate(value: string | null) {
    if (!value) return t('staff.never');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t('staff.never') : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setLocalError('invalidEmail'); return; }
    setLocalError(null);
    try {
      await onInvite(normalized, role, inviteLocale);
      setEmail('');
    } catch { /* The parent supplies the localized error message. */ }
  }

  async function confirm(member: StaffMember) {
    if (!pending || pending.userId !== member.user_id) return;
    try {
      await onAction(pending.action, member, pending.value);
      setPending(null);
    } catch { /* Leave the confirmation visible for a retry. */ }
  }

  function ask(member: StaffMember, action: StaffAction, value?: string) {
    setPending({ userId: member.user_id, action, value });
  }

  function pendingText(member: StaffMember) {
    if (!pending || pending.userId !== member.user_id) return '';
    if (pending.action === 'set_role') return t('staff.confirmRole').replace('{role}', t(`staff.role.${pending.value}`));
    if (pending.action === 'send_recovery') return t('staff.confirmRecovery');
    return t(pending.value === 'active' ? 'staff.confirmReactivate' : member.status === 'invited' ? 'staff.confirmCancelInvite' : 'staff.confirmRevoke');
  }

  return <div className="page-stack staff-page">
    <div className="page-heading"><div><p className="eyebrow">{t('staff.eyebrow')}</p><h1>{t('staff.title')}</h1><p>{t('staff.lead')}</p></div><div className="heading-accent"><UsersRound size={30}/></div></div>
    {(error || localError) && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t(localError || error || 'genericError')}</span></div>}
    {notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}
    <section className="staff-panel" aria-labelledby="staff-invite-title">
      <div className="section-heading"><div><p className="eyebrow">{t('staff.inviteEyebrow')}</p><h2 id="staff-invite-title">{t('staff.inviteTitle')}</h2></div><span className="section-icon"><MailPlus size={22}/></span></div>
      <p className="staff-panel-lead">{t('staff.inviteLead')}</p>
      <form className="staff-invite-form" onSubmit={invite} noValidate>
        <label className="field"><span>{t('emailLabel')}</span><div className="field-control"><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder={t('emailPlaceholder')} disabled={busy} required /></div></label>
        <label className="field"><span>{t('staff.roleLabel')}</span><select aria-label={t('staff.roleLabel')} value={role} onChange={event => setRole(event.target.value as StaffRole)} disabled={busy}><option value="support">{t('staff.role.support')}</option><option value="operations">{t('staff.role.operations')}</option><option value="super_admin">{t('staff.role.super_admin')}</option></select></label>
        <label className="field"><span>{t('staff.emailLanguage')}</span><select aria-label={t('staff.emailLanguage')} value={inviteLocale} onChange={event => setInviteLocale(event.target.value as 'en' | 'es')} disabled={busy}><option value="en">English</option><option value="es">Español</option></select></label>
        <button type="submit" className="button button-primary" disabled={busy}><MailPlus size={17}/>{t(busy ? 'staff.sending' : 'staff.sendInvite')}</button>
      </form>
    </section>
    <section className="staff-panel" aria-labelledby="staff-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('staff.directoryEyebrow')}</p><h2 id="staff-list-title">{t('staff.listTitle')}</h2></div><span className="count-pill">{members.length}</span></div>
      {busy && members.length === 0 ? <div className="staff-empty" role="status"><span className="spinner"/>{t('staff.loading')}</div> : members.length === 0 ? <div className="staff-empty"><UsersRound size={27}/><strong>{t('staff.emptyTitle')}</strong><span>{t('staff.emptyBody')}</span></div> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>{t('name')}</th><th>{t('staff.roleLabel')}</th><th>{t('state')}</th><th>{t('staff.lastAccess')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{members.map(member => {
        const self = member.is_self || member.user_id === currentUserId;
        return <tr key={member.user_id}>
          <td data-label={t('name')} className="staff-identity"><strong>{member.full_name?.trim() || t('notProvided')}{self && <span className="staff-self">{t('staff.you')}</span>}</strong><small>{member.email}</small></td>
          <td data-label={t('staff.roleLabel')}><span className="staff-role"><ShieldCheck size={15}/>{t(`staff.role.${member.role}`)}</span></td>
          <td data-label={t('state')}><span className={`status-badge staff-status staff-status-${member.status}`}><span className="badge-dot"/>{t(`staff.status.${member.status}`)}</span></td>
          <td data-label={t('staff.lastAccess')}><span className="staff-date"><Clock3 size={14}/>{formatDate(member.last_sign_in_at)}</span></td>
          <td data-label={t('staff.actions')} className="staff-actions-cell">
            <div className="staff-actions">
              {!self && member.status !== 'revoked' && <label className="sr-only" htmlFor={`staff-role-${member.user_id}`}>{t('staff.changeRole')} {member.email}</label>}
              {!self && member.status !== 'revoked' && <select id={`staff-role-${member.user_id}`} aria-label={`${t('staff.changeRole')}: ${member.email}`} value={member.role} onChange={event => ask(member, 'set_role', event.target.value)} disabled={busy}><option value="support">{t('staff.role.support')}</option><option value="operations">{t('staff.role.operations')}</option><option value="super_admin">{t('staff.role.super_admin')}</option></select>}
              {!self && member.status === 'active' && <button className="staff-action-link" type="button" disabled={busy} onClick={() => ask(member, 'send_recovery')}><RotateCcw size={14}/>{t('staff.recovery')}</button>}
              {!self && <button className={`staff-action-link ${member.status === 'revoked' ? '' : 'danger'}`} type="button" disabled={busy} onClick={() => ask(member, 'set_status', member.status === 'revoked' ? 'active' : 'revoked')}>{t(member.status === 'revoked' ? 'staff.reactivate' : member.status === 'invited' ? 'staff.cancelInvite' : 'staff.revoke')}</button>}
              {self && <span className="staff-self-note">{t('staff.selfProtected')}</span>}
            </div>
            {pending?.userId === member.user_id && <div className="staff-confirm" role="group" aria-label={t('staff.confirmAction')}><p>{pendingText(member)}</p><div><button className="button button-primary" type="button" disabled={busy} onClick={() => confirm(member)}><Check size={15}/>{t('staff.confirm')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}><X size={15}/>{t('staff.cancel')}</button></div></div>}
          </td>
        </tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
