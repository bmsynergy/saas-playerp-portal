import { useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Printer, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getDeviceSheet, type DeviceSheet } from '../lib/psDevice';
import { generateLabelPng, labelDataFromSheet, labelFilename, labelFingerprint, printLabel } from '../lib/psLabel';
import { useLocale } from '../locales';

type Props = { venueId: string; sheet: DeviceSheet; pendingWifi?: boolean };

// A preview is deliberately opt-in: it contains the confirmed recovery password.
export function PrintServerLabel({ venueId, sheet, pendingWifi = false }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<{ url: string; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const data = labelDataFromSheet(sheet);
  const wifiPending = pendingWifi || sheet.rotations.some(operation => operation.kind === 'wifi' && operation.status === 'pending');
  const fingerprint = data ? labelFingerprint(data) : null;
  const identity = `${venueId}:${sheet.device?.id ?? ''}:${sheet.credentialAccess}`;
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const previousFingerprint = useRef<string | null>(null);
  const latestIdentity = useRef(identity);
  const latestFingerprint = useRef(fingerprint);
  latestIdentity.current = identity;
  latestFingerprint.current = fingerprint;

  useEffect(() => {
    mounted.current = true;
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    previousFingerprint.current = null;
    setPreview(previous => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
    setNotice(null);
    setBusy(false);
    return () => { mounted.current = false; generation.current++; controller.current?.abort(); controller.current = null; };
  }, [identity]);

  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    const prior = previousFingerprint.current;
    if (fingerprint) previousFingerprint.current = fingerprint;
    if (prior && fingerprint && prior !== fingerprint) {
      setPreview(null);
      setNotice(t('dev.label.reprint'));
    }
    if (!fingerprint) setPreview(null);
  }, [fingerprint, t]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function act(kind: 'preview' | 'download' | 'print') {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const run = ++generation.current;
    const currentRun = () => mounted.current && generation.current === run && !abort.signal.aborted && latestIdentity.current === identity && latestFingerprint.current === fingerprint;
    setBusy(true);
    setNotice(null);
    try {
      // Always re-read the server before making a label. A pending value is never accepted.
      const fresh = await getDeviceSheet(venueId, abort.signal);
      if (!currentRun()) return;
      const current = labelDataFromSheet(fresh);
      if (!current || fresh.device?.id !== sheet.device?.id) throw new Error('unavailable');
      if (!fingerprint || labelFingerprint(current) !== fingerprint) {
        setPreview(null);
        setNotice(t('dev.label.reprint'));
        await queryClient.invalidateQueries({ queryKey: ['ps-device'] });
        return;
      }
      const blob = await generateLabelPng(current);
      if (!currentRun()) return;
      if (kind === 'print') {
        await printLabel(blob, abort.signal);
      } else if (kind === 'download') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = labelFilename(current);
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } else {
        const url = URL.createObjectURL(blob);
        setPreview(previous => { if (previous) URL.revokeObjectURL(previous.url); return { url, fingerprint }; });
      }
    } catch {
      if (!currentRun()) return;
      setPreview(null);
      setNotice(t('dev.label.unavailable'));
      await queryClient.invalidateQueries({ queryKey: ['ps-device'] });
    } finally { if (currentRun()) setBusy(false); if (controller.current === abort) controller.current = null; }
  }

  return <section className="dev-label" aria-labelledby="dev-label-title" data-testid="dev-label">
    <h3 id="dev-label-title">{t('dev.label.title')}</h3>
    <p className="ps-cert-small">{t('dev.label.lead')}</p>
    <p className="ps-cert-small">{t('dev.label.reprintHint')} {t('dev.label.printHint')}</p>
    {wifiPending && <p className="dev-label-pending" role="status" data-testid="dev-label-pending"><RefreshCw size={16}/><span>{t('dev.label.pending')}</span></p>}
    <p className="ps-cert-small"><a className="text-link" href="/examples/PS-XXXXXXXX-50x30mm.png" download="PS-XXXXXXXX-50x30mm.png">{t('dev.label.sample')}</a></p>
    {data ? <>
      <div className="staff-actions dev-label-actions">
        <button type="button" className="button button-secondary" data-testid="dev-label-preview-action" disabled={busy} onClick={() => void act('preview')}><Eye size={15}/>{t('dev.label.preview')}</button>
        <button type="button" className="button button-secondary" data-testid="dev-label-download" disabled={busy} onClick={() => void act('download')}><Download size={15}/>{t('dev.label.download')}</button>
        <button type="button" className="button button-secondary" data-testid="dev-label-print" disabled={busy} onClick={() => void act('print')}><Printer size={15}/>{t('dev.label.print')}</button>
      </div>
      {preview && preview.fingerprint === fingerprint && <figure className="dev-label-preview"><img src={preview.url} data-testid="dev-label-preview-image" alt={t('dev.label.previewAlt')} width={590} height={354}/><figcaption>{wifiPending ? `${t('dev.label.pending')} ` : ''}{t('dev.label.printHint')}</figcaption><button type="button" className="button button-secondary" data-testid="dev-label-hide" onClick={() => setPreview(null)}><EyeOff size={15}/>{t('dev.label.hide')}</button></figure>}
    </> : <p className="inline-empty" data-testid="dev-label-disabled">{t('dev.label.unavailable')} <a href="#ps-recovery-help" onClick={() => { const help = document.getElementById('ps-recovery-help') as HTMLDetailsElement | null; if (help) help.open = true; }}>{t('dev.help.link')}</a></p>}
    {notice && <p className="dev-label-notice" role="status"><RefreshCw size={16}/>{notice}</p>}
  </section>;
}
