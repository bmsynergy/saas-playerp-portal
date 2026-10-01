import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Building2, CalendarDays, Check, Clock3, History, Mail, RotateCcw, ShieldCheck, UserRoundCog, UserRoundX, UsersRound, X } from 'lucide-react';
import { slugLabel, venueRoleLabel, venuesLabel, type IdentityAction, type IdentityDetail, type IdentityDirectory } from '../lib/identity';
import { useLocale } from '../locales';
import { DetailItem } from './OwnerPage';

type Props = {
  detail: IdentityDetail; venues: IdentityDirectory['venues']; roles: string[];
  busy: boolean; error: string | null; notice: string | null;
  onAction: (action: IdentityAction, value?: string | string[]) => Promise<void>;
};
type Pending = { action: IdentityAction; value?: string | string[] };

export function UserDetailPage({ detail, venues, roles, busy, error, notice, onAction }: Props) {
  const { locale, t } = useLocale();
  const { user: person, audit } = detail;
  const assigned = person.venues.map(item => item.id).sort().join(',');
  const [role, setRole] = useState(person.role ?? '');
  const [selected, setSelected] = useState<string[]>(() => person.venues.map(item => item.id));
  const [pending, setPending] = useState<Pending | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  // Role and venue changes only apply to a live, unprotected identity that is not the signed-in Admin.
  const editable = !person.is_self && !person.protected && person.status !== 'revoked';
  const sameVenues = [...selected].sort().join(',') === assigned;

  // Mirror the server after every refetch so the controls never show a stale selection.
  useEffect(() => setRole(person.role ?? ''), [person.role]);
  useEffect(() => setSelected(assigned ? assigned.split(',') : []), [assigned]);

  function formatDate(value: string | null, empty: string) {
    if (!value) return empty;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? empty : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  function ask(action: IdentityAction, value?: string | string[]) {
    if (action === 'set_assignments' && (value as string[]).length === 0) { setLocalError('identity.error.invalidVenues'); return; }
    setLocalError(null); setPending({ action, value });
  }
  async function confirm() {
    if (!pending) return;
    try { await onAction(pending.action, pending.value); setPending(null); }
    catch { /* Leave the confirmation visible for a retry. */ }
  }
  function pendingText() {
    if (pending?.action === 'set_role') return t('identity.confirmRole').replace('{role}', venueRoleLabel(t, pending.value as string));
    return t(pending?.action === 'set_assignments' ? 'identity.confirmVenues' : pending?.action === 'revoke' ? 'identity.confirmRevoke' : 'identity.confirmRecovery');
  }
  const confirmBox = (...actions: IdentityAction[]) => pending && actions.includes(pending.action) && <div className="staff-confirm" role="group" aria-label={t('staff.confirmAction')}><p>{pendingText()}</p><div><button className="button button-primary" type="button" disabled={busy} onClick={confirm}><Check size={15}/>{t('staff.confirm')}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => setPending(null)}><X size={15}/>{t('staff.cancel')}</button></div></div>;

  return <div className="page-stack staff-page" data-testid="identity-detail">
    <Link className="back-link" to="/admin/users"><ArrowLeft size={17}/>{t('identity.back')}</Link>
    <div className="page-heading detail-heading"><div><p className="eyebrow">{t('identity.detailEyebrow')}</p><h1>{person.full_name?.trim() || person.email}</h1><p>{person.email}</p></div><span className={`status-badge staff-status staff-status-${person.status}`}><span className="badge-dot"/>{t(`staff.status.${person.status}`)}</span></div>
    {(error || localError) && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t(localError || error || 'genericError')}</span></div>}
    {notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}
    <section className="detail-panel" aria-labelledby="identity-profile-title"><div className="section-heading"><div><p className="eyebrow">{t('identity.eyebrow')}</p><h2 id="identity-profile-title">{t('identity.profileTitle')}</h2></div><span className="section-icon"><UserRoundCog size={20}/></span></div>
      <div className="detail-grid">
        <DetailItem icon={<Mail size={19}/>} label={t('email')} value={person.email} isEmail/>
        <DetailItem icon={<ShieldCheck size={19}/>} label={t('identity.venueRole')} value={venueRoleLabel(t, person.role)}/>
        <DetailItem icon={<BadgeCheck size={19}/>} label={t('state')} value={t(`staff.status.${person.status}`)}/>
        <DetailItem icon={<Building2 size={19}/>} label={t('venues')} value={venuesLabel(t, person)}/>
        {person.platform_role && <DetailItem icon={<UsersRound size={19}/>} label={t('staff.roleLabel')} value={slugLabel(t, 'staff.role', person.platform_role)}/>}
        <DetailItem icon={<Clock3 size={19}/>} label={t('staff.lastAccess')} value={formatDate(person.last_sign_in_at, t('staff.never'))}/>
        <DetailItem icon={<CalendarDays size={19}/>} label={t('identity.created')} value={formatDate(person.created_at, t('notProvided'))}/>
      </div>
    </section>
    <section className="staff-panel" aria-labelledby="identity-actions-title"><div className="section-heading"><div><p className="eyebrow">{t('staff.actions')}</p><h2 id="identity-actions-title">{t('identity.actionsTitle')}</h2></div><span className="section-icon"><ShieldCheck size={20}/></span></div>
      {person.is_self ? <div className="staff-self-note">{t('staff.selfProtected')}</div> : <div className="identity-stack">
        {person.protected ? <div className="staff-self-note">{t('identity.protectedNote')}</div> : person.status === 'revoked' && <div className="staff-self-note">{t('identity.revokedNote')}</div>}
        {editable && <div className="field"><label htmlFor="identity-role">{t('identity.changeRole')}</label>
          <div className="staff-actions"><select id="identity-role" value={roles.includes(role) ? role : ''} onChange={event => { setRole(event.target.value); setPending(null); }} disabled={busy}>{!roles.includes(role) && <option value="" disabled>{venueRoleLabel(t, person.role)}</option>}{roles.map(item => <option key={item} value={item}>{slugLabel(t, 'identity.role', item)}</option>)}</select><button className="staff-action-link" type="button" disabled={busy || !roles.includes(role) || role === person.role} onClick={() => ask('set_role', role)}>{t('identity.applyRole')}</button></div>
          {confirmBox('set_role')}
        </div>}
        {editable && <div className="field" role="group" aria-labelledby="identity-venues"><span id="identity-venues">{t('identity.assignedVenues')}</span>
          <div className="staff-actions">{venues.map(item => <label className="staff-role" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={event => { setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id)); setPending(null); }}/>{item.name}</label>)}<button className="staff-action-link" type="button" disabled={busy || sameVenues} onClick={() => ask('set_assignments', selected)}>{t('identity.saveVenues')}</button></div>
          {confirmBox('set_assignments')}
        </div>}
        {person.status !== 'revoked' && <div className="field" role="group" aria-labelledby="identity-account"><span id="identity-account">{t('identity.accountActions')}</span>
          <div className="staff-actions"><button className="staff-action-link" type="button" disabled={busy} onClick={() => ask('send_recovery')}><RotateCcw size={14}/>{t('identity.recovery')}</button>{editable && <button className="staff-action-link danger" type="button" disabled={busy} onClick={() => ask('revoke')}>{t('staff.revoke')}</button>}</div>
          {confirmBox('send_recovery', 'revoke')}
        </div>}
      </div>}
    </section>
    <section className="staff-panel" aria-labelledby="identity-activity-title"><div className="section-heading"><div><p className="eyebrow">{t('identity.activityEyebrow')}</p><h2 id="identity-activity-title">{t('identity.activityTitle')}</h2></div><span className="section-icon"><History size={20}/></span></div>
      {audit.length === 0 ? <div className="staff-empty"><History size={27}/><span>{t('identity.activityEmpty')}</span></div> : <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>{t('identity.date')}</th><th>{t('identity.action')}</th><th>{t('identity.actor')}</th></tr></thead><tbody>{audit.map(entry => <tr key={entry.id}>
        <td data-label={t('identity.date')}><span className="staff-date"><Clock3 size={14}/>{formatDate(entry.created_at, t('notProvided'))}</span></td>
        <td data-label={t('identity.action')}>{slugLabel(t, 'identity.audit', entry.action)}</td>
        <td data-label={t('identity.actor')}>{entry.actor_email || t('notProvided')}</td>
      </tr>)}</tbody></table></div>}
    </section>
  </div>;
}
