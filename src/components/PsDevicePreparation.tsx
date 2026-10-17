import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, KeyRound } from 'lucide-react';
import { errorCode } from '../lib/errors';
import { prepareDevice, psLinkErrorText, setupSsid, type PsDeviceLink, type PsPrepareResult } from '../lib/psLink';
import { useLocale } from '../locales';

type Entry = { web: {url:string;required_version:string}; ssh:{command:string;required_version:string} };
type Props = { link: PsDeviceLink; canPrepare: boolean; blockedReason?: string | null; onPrepared?: (link: PsDeviceLink | null) => Promise<unknown> | void; preparationEntry?: Entry; installedVersion?: string | null };
const supports = (installed:string,required:string) => {
  const a=installed.split('.').map(Number), b=required.split('.').map(Number);
  if(a.length!==3||b.length!==3||!a.every(Number.isInteger)||!b.every(Number.isInteger))return false;
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}
  return true;
};

// PE-462: explicit onboarding of a unit that is not prepared yet. "Prepare" is the only place a
// one-time pse_ code appears; it lives only in this component's state and is shown once.
// Nothing here claims the device was activated: only its own connection prepares it.
export function PsDevicePreparation({ link, canPrepare, blockedReason, onPrepared, preparationEntry, installedVersion }: Props) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<PsPrepareResult | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const expiry=result?.expires_at ? Date.parse(result.expires_at) : NaN;
    if (!Number.isFinite(expiry) || !result?.enrollment_code) return;
    const delay=Math.max(0,expiry-Date.now());
    const timer=window.setTimeout(()=>{setResult(null);setExpired(true);setCopied(false);},Math.min(delay,2_147_483_647));
    return ()=>window.clearTimeout(timer);
  },[result]);
  useEffect(() => { if(link.prepared && result){setResult(null);setCopied(false);setConfirmRegenerate(false);} },[link.prepared,result]);
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v && Number.isFinite(Date.parse(v)) ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  if (link.prepared || (link.state !== 'pendiente_preparacion' && !result)) return null;

  async function prepare(regenerate: boolean) {
    if (!canPrepare || busy) return;
    setBusy(true); setError(''); setCopied(false); setConfirmRegenerate(false); setExpired(false);
    try {
      const out = await prepareDevice(link.device_id, regenerate);
      setResult(out);
      try { await onPrepared?.(out.link); } catch { setError(t('fw.refreshFailed')); }
    } catch (err) { setError(psLinkErrorText(err, t, t(errorCode(err)))); }
    finally { setBusy(false); }
  }
  const missing = link.onboarding.missing;
  const issued = !result?.enrollment_code && (result?.code_already_issued || link.preparation.state === 'code_issued');
  return <section className="ps-prep" id="ps469-preparation" aria-labelledby={`ps-prep-${link.device_id}`} data-testid="ps-preparation">
    <h3 id={`ps-prep-${link.device_id}`}>{t('psLink.prep.title')}</h3>
    <p className="owner-section-lead">{t('psLink.prep.lead')}</p>
    {missing.length > 0 && <><p className="ps-cert-small">{t('psLink.prep.missingTitle')}</p><ul data-testid="ps-preparation-missing">{missing.map(item => <li key={item} data-missing={item}>{t(`psLink.missing.${item}`)}</li>)}</ul></>}
    <ol className="ps-prep-steps"><li>{t('psLink.prep.step1')}</li><li>{t('ps469.prepKeepCode')}</li></ol>
    {preparationEntry && <div className="ps469-entry" data-testid="ps-preparation-entry">
      {installedVersion && !supports(installedVersion,preparationEntry.ssh.required_version) ? <p>{t('ps469.versionTooOld').replace('{version}',preparationEntry.ssh.required_version)}</p> : <>
      {(!installedVersion || supports(installedVersion,preparationEntry.web.required_version)) && <div><h4>{t('ps469.webTitle').replace('{version}',preparationEntry.web.required_version)}</h4>
        <ol><li>{t('ps469.webStep1').replace('{ssid}',setupSsid(link.serial))}</li><li>{t('ps469.webStep2').replace('{url}',preparationEntry.web.url)}</li><li>{t('ps469.webStep3')}</li><li>{t('ps469.webStep4')}</li></ol>
        <p className="ps-cert-small">{t('ps469.webErrors')}</p></div>}
      {(!installedVersion || !supports(installedVersion,preparationEntry.web.required_version)) && <div><h4>{t('ps469.sshTitle').replace('{version}',preparationEntry.ssh.required_version)}</h4>
        <p>{t('ps469.sshRequirements')}</p><code className="ps469-command">{preparationEntry.ssh.command}</code></div>}
      {!installedVersion && <p className="ps-cert-small">{t('ps469.unknownVersion')}</p>}</>}
    </div>}
    {link.preparation.state === 'code_issued' && !result && <p className="ps-cert-small" role="status">{t('psLink.prep.codeState.code_issued').replace('{time}', date(link.preparation.code_expires_at))}</p>}
    {link.preparation.state === 'code_expired' && !result && <p className="ps-cert-small" role="status">{t('psLink.prep.codeState.code_expired')}</p>}
    {expired && <p className="ps-cert-small" role="status">{t('ps469.codeExpiredMemory')}</p>}
    {result?.enrollment_code ? <div className="inv-code" data-testid="ps-preparation-code">
      <p className="owner-section-lead">{t('psLink.prep.codeOnce').replace('{time}', date(result.expires_at))}</p>
      <p className="ps-mono fw-hash inv-code-value" data-testid="ps-preparation-code-value">{result.enrollment_code}</p>
      <div className="staff-actions"><button type="button" className="button button-secondary" onClick={() => { void navigator.clipboard.writeText(result.enrollment_code!).then(() => setCopied(true)).catch(() => setError(t('dev.copyFailed'))); }}><Copy size={15}/>{t(copied ? 'inv.copied' : 'inv.copy')}</button></div>
    </div> : result?.already_prepared ? <p role="status">{t('psLink.prep.alreadyPrepared')}</p> : null}
    {issued && result && <p role="status">{t('psLink.prep.codeIssued')}</p>}
    {canPrepare ? <div className="staff-actions">
      {!issued && link.preparation.state !== 'code_expired' && !expired && !result?.enrollment_code && !result?.already_prepared && <button type="button" className="button button-primary" data-testid="ps-prepare" disabled={busy} onClick={() => void prepare(false)}><KeyRound size={15}/>{t('psLink.prep.prepare')}</button>}
      {(issued || expired || link.preparation.state === 'code_expired' || !!result?.enrollment_code) && !result?.already_prepared && (confirmRegenerate
        ? <><button type="button" className="button button-primary ps-danger-solid" data-testid="ps-prepare-regenerate-confirm" disabled={busy} onClick={() => void prepare(true)}>{t('psLink.prep.regenerate')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirmRegenerate(false)}>{t('staff.cancel')}</button></>
        : <button type="button" className="button button-secondary" data-testid="ps-prepare-regenerate" disabled={busy} onClick={() => setConfirmRegenerate(true)}>{t('psLink.prep.regenerate')}</button>)}
    </div> : blockedReason ? <p className="ps-cert-small">{blockedReason}</p> : null}
    {confirmRegenerate && <p className="ps-cert-small" role="status"><AlertTriangle size={14}/> {t('psLink.prep.regenerateWarn')}</p>}
    {busy && <p role="status">{t('ps.working')}</p>}
    {error && <p role="alert" className="form-error"><AlertTriangle size={16}/>{error}</p>}
  </section>;
}
