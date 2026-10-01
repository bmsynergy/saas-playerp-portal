import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react';
import { useLocale } from '../locales';

type Props = { busy: boolean; error: string | null; onAccept: () => Promise<void> };

export function InvitationPage({ busy, error, onAccept }: Props) {
  const { t } = useLocale();
  const [localBusy, setLocalBusy] = useState(false);

  async function accept() {
    setLocalBusy(true);
    try { await onAccept(); }
    catch { /* The parent supplies the localized error message. */ }
    finally { setLocalBusy(false); }
  }

  const waiting = busy || localBusy;
  return <main className="invitation-card"><span className="invitation-icon"><MailCheck size={30}/></span><p className="eyebrow">{t('staff.invitationEyebrow')}</p><h1>{t('staff.invitationTitle')}</h1><p className="invitation-lead">{t('staff.invitationLead')}</p>
      {error && <div className="form-error" role="alert"><ShieldCheck size={18}/><span>{t(error)}</span></div>}
      <button className="button button-primary" type="button" disabled={waiting} onClick={accept}>{t(waiting ? 'staff.acceptingInvitation' : 'staff.acceptInvitation')}</button>
      <Link className="back-link" to="/auth/complete"><ArrowLeft size={16}/>{t('staff.backToWorkspace')}</Link>
  </main>;
}
