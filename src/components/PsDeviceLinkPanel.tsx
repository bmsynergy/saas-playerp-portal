import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Link2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { errorCode } from '../lib/errors';
import { getAdminDeviceManage } from '../lib/psAdminDevice';
import { psLinkErrorText, setDeviceLabel, validatePsLabel, type PsDeviceLink } from '../lib/psLink';
import { useLocale } from '../locales';
import { PsLinkFacts } from './PsLinkStateBadge';
import { PsDevicePreparation } from './PsDevicePreparation';

type Props = { link: PsDeviceLink; isStaff: boolean; canEdit: boolean; onChanged: () => Promise<unknown>; compact?: boolean; preparationEntry?: { web: {url:string;required_version:string}; ssh:{command:string;required_version:string} }; installedVersion?: string | null };

// PE-462: link/identity block of the device sheet (admin and owner). The friendly name is the
// only editable field; serial and hostname are read-only.
export function PsDeviceLinkPanel({ link, isStaff, canEdit, onChanged, compact = false, preparationEntry, installedVersion }: Props) {
  const { t } = useLocale();
  const { session } = useAuth();
  const [name, setName] = useState(link.label ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Stays mounted after "Prepare" so a refresh never hides the one-time code before it is read.
  const [prepOpen] = useState(link.state === 'pendiente_preparacion');
  const showPrep = prepOpen || link.state === 'pendiente_preparacion';
  useEffect(() => { setName(link.label ?? ''); }, [link.device_id, link.label]);
  // "Prepare" is staff-only and offered only when the backend allows it for this unit.
  const manage = useQuery({ queryKey: ['ps-admin-device-manage', session?.user.id, link.device_id], queryFn: ({ signal }) => getAdminDeviceManage(link.device_id, signal),
    enabled: isStaff && showPrep, retry: false });
  const check = validatePsLabel(name);
  const unchanged = (check.ok ? check.value : name) === (link.label ?? null);
  const editable = canEdit && link.state !== 'retirado';

  async function save() {
    if (!editable || busy || !check.ok || unchanged) return;
    setBusy(true); setResult(null);
    try { const out = await setDeviceLabel(link.device_id, check.value); setResult({ ok: true, text: t(out.changed ? 'psLink.nameSaved' : 'psLink.nameUnchanged') }); try { await onChanged(); } catch { setResult({ ok: false, text: `${t('psLink.nameSaved')} ${t('fw.refreshFailed')}` }); } }
    catch (error) { setResult({ ok: false, text: psLinkErrorText(error, t, t(errorCode(error))) }); }
    finally { setBusy(false); }
  }
  return <section className={`detail-panel ps-link-panel${showPrep?' ps-link-panel-preparing':''}`} aria-labelledby={`ps-link-${link.device_id}`} data-testid="ps-link-panel">
    <div className="section-heading"><div><p className="eyebrow">{t('psm.sheetEyebrow')}</p><h2 id={`ps-link-${link.device_id}`}>{compact ? t('ps469.summary') : t('psLink.panelTitle')}</h2></div><span className="section-icon"><Link2 size={20}/></span></div>
    {!compact && <PsLinkFacts link={link}/>}
    {compact && <p className="ps-cert-small">{t('ps469.nameHelp')}</p>}
    {link.state === 'asignado_pendiente_sync' && !compact && <p className="ps-cert-small">{t('psLink.savedExplain')}</p>}
    {editable && <div className="ps-link-name">
      <label className="field"><span>{t('psLink.nameLabel')}</span><input data-testid="ps-link-name" autoComplete="off" maxLength={200} value={name} disabled={busy} onChange={event => { setName(event.target.value); setResult(null); }}/></label>
      <button type="button" className="button button-primary" data-testid="ps-link-name-save" disabled={busy || !check.ok || unchanged} onClick={() => void save()}>{t('psLink.nameSave')}</button>
      <p className="ps-cert-small">{check.ok ? t('psLink.nameHint') : <span role="alert">{t(`psLink.nameInvalid.${check.reason}`)}</span>}</p>
    </div>}
    {result && <p className={`ps-result ${result.ok ? 'ps-result-ok' : 'ps-result-error'}`} role="status" data-testid="ps-link-name-result">{result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>}<span>{result.text}</span></p>}
    {showPrep && <PsDevicePreparation link={link} preparationEntry={preparationEntry} installedVersion={installedVersion} canPrepare={isStaff && !!manage.data?.actions.prepare.allowed}
      blockedReason={!isStaff ? t('psLink.prep.staffOnly') : manage.isPending ? t('dev.loading') : t('psLink.prep.notAllowed')} onPrepared={() => onChanged()}/>}
  </section>;
}
