import { useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Printer, Wifi } from 'lucide-react';
import { AdoptError, adoptWifiSsid, type SsidAdoption, type SsidAdoptResult } from '../lib/psDevice';
import { useLocale } from '../locales';
import { PortalDialog } from './PortalDialog';

// PE-440: explicit, per-device staff action to move a PS (typically legacy) to the canonical recovery
// SSID derived from its platform serial. Only the SSID changes: WPA2 key, admin code, hostname,
// certificate and token stay. The sheet and label keep the previous name until the device confirms.
type Props = { venueId: string; printServerId?: string | null; adoption: SsidAdoption; onChanged: () => void };
type Dialog = { phase: 'loading' } | { phase: 'confirm'; preview: SsidAdoptResult } | { phase: 'sending'; preview: SsidAdoptResult }
  | { phase: 'sent'; result: SsidAdoptResult } | { phase: 'error'; key: string };

export function PrintServerSsidAdoption({ venueId, printServerId = null, adoption, onChanged }: Props) {
  const { t } = useLocale();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const errorKey = (error: unknown) => error instanceof AdoptError ? error.key : 'adopt.error.other';

  async function open() {
    setDialog({ phase: 'loading' });
    try {
      const preview = await adoptWifiSsid(venueId, false, printServerId);
      setDialog(preview.state === 'preview' ? { phase: 'confirm', preview } : { phase: 'sent', result: preview });
      if (preview.state !== 'preview') onChanged();
    } catch (error) { setDialog({ phase: 'error', key: errorKey(error) }); }
  }
  async function accept(preview: SsidAdoptResult) {
    setDialog({ phase: 'sending', preview });
    try { setDialog({ phase: 'sent', result: await adoptWifiSsid(venueId, true, printServerId) }); }
    catch (error) { setDialog({ phase: 'error', key: errorKey(error) }); }
    finally { onChanged(); }
  }

  const { state } = adoption;
  const canAdopt = state === 'available' || state === 'failed';
  const current = adoption.current_ssid ?? t('dev.credentialAbsent');
  const badge = state === 'applied' || state === 'provisioned' ? 'server-online' : state === 'failed' ? 'server-revoked' : 'server-pending';

  return <div className="dev-ssid-adoption" data-testid="dev-ssid-adoption" data-state={state}>
    <h3><Wifi size={16}/> {t('adopt.title')}</h3>
    <dl className="dev-facts">
      <div><dt>{t('adopt.current')}</dt><dd className="ps-mono" data-testid="adopt-current">{current}</dd></div>
      <div><dt>{t('adopt.canonical')}</dt><dd className="ps-mono" data-testid="adopt-canonical">{adoption.canonical_ssid}</dd></div>
      <div><dt>{t('state')}</dt><dd><span className={`server-status ${badge}`} data-testid="adopt-state"><span className="badge-dot"/>{t(`adopt.state.${state}`)}</span>
        {state === 'failed' && <small>{adoption.error_code ? ` · ${adoption.error_code}` : ''}{adoption.previous_kept ? ` · ${t('dev.rotation.previousKept')}` : ''}</small>}</dd></div>
    </dl>
    {state === 'pending' && <p className="dev-tracking-warning" role="status" data-testid="adopt-pending-note"><AlertTriangle size={16}/><span>{t('adopt.pendingNote')}</span></p>}
    {(state === 'pending' || canAdopt) && <p className="ps-cert-small" data-testid="adopt-reprint-after"><Printer size={14}/> {t('adopt.reprintAfter')}</p>}
    {state === 'applied' && adoption.reprint_label && <p className="dev-copy-notice dev-copy-ok" role="status" data-testid="adopt-reprint"><Printer size={16}/><span>{t('adopt.reprintNow')}</span></p>}
    {canAdopt && <div className="staff-actions">
      <button type="button" className="button button-secondary" data-testid="adopt-open" onClick={() => void open()}><Wifi size={15}/>{t('adopt.button')}</button>
    </div>}
    {dialog && <PortalDialog title={t('adopt.button')} titleId="adopt-dialog-title" descriptionId="adopt-dialog-description" testId="adopt-dialog"
      onClose={() => setDialog(null)} dismissible={dialog.phase !== 'sending'}
      actions={dialog.phase === 'confirm' || dialog.phase === 'sending' ? <>
        <button type="button" className="button button-secondary" disabled={dialog.phase === 'sending'} onClick={() => setDialog(null)}>{t('dev.confirm.cancel')}</button>
        <button type="button" className="button button-primary" data-testid="adopt-confirm" disabled={dialog.phase === 'sending'} onClick={() => dialog.phase === 'confirm' && void accept(dialog.preview)}><Check size={15}/>{t('adopt.confirm')}</button>
      </> : <button type="button" className="button button-secondary" data-testid="adopt-close" onClick={() => setDialog(null)}>{t('dev.confirm.close')}</button>}>
      <div id="adopt-dialog-description">
        {dialog.phase === 'loading' && <p role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</p>}
        {(dialog.phase === 'confirm' || dialog.phase === 'sending') && <>
          <p className="adopt-change ps-mono" data-testid="adopt-preview"><span>{dialog.preview.current_ssid ?? current}</span> <ArrowRight size={14}/> <strong>{dialog.preview.canonical_ssid}</strong></p>
          <p>{t('adopt.confirmText')}</p>
          <ul className="adopt-keeps"><li>{t('adopt.keeps.key')}</li><li>{t('adopt.keeps.identity')}</li><li>{t('adopt.keeps.label')}</li></ul>
          {dialog.phase === 'sending' && <p role="status"><span className="spinner" aria-hidden="true"/>{t('ps.working')}</p>}
        </>}
        {dialog.phase === 'sent' && <p role="status" data-testid="adopt-sent">{t(dialog.result.state === 'applied' ? 'adopt.state.applied' : dialog.result.already ? 'adopt.sentAlready' : 'adopt.sent')}</p>}
        {dialog.phase === 'error' && <p role="alert" data-testid="adopt-error">{t(dialog.key) === dialog.key ? t('adopt.error.other') : t(dialog.key)}</p>}
      </div>
    </PortalDialog>}
  </div>;
}
