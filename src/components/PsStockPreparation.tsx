import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Mail, Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { errorCode } from '../lib/errors';
import { getFirmwares, getInstallKitDownload, listInstallKits, type FirmwareRelease, type InstallKit } from '../lib/firmware';
import { downloadStockFile, getStockLabel, getStockStatus, previewDeliveryEmail, sendDeliveryEmail, type StockLabel, type DeliveryEmailResult } from '../lib/psStock';
import { useLocale, type Locale } from '../locales';
import './PsStockPreparation.css';

type Props = { deviceId: string; onChanged: () => Promise<unknown> };

const dateText = (value: string | null | undefined, locale: Locale, fallback: string) => {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback;
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};
const versionAtLeast = (version: string): boolean => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major > 0 || minor > 3 || (minor === 3 && patch >= 27);
};

// Kit metadata must explicitly match this device. An untagged generic kit is not assumed compatible.
function matchingImage(kits: InstallKit[], releases: FirmwareRelease[], model: string, arch: string): InstallKit | null {
  const compatible = new Set(releases.filter(r => r.status === 'ready' && r.model === model && r.arch === arch && versionAtLeast(r.version)).map(r => r.id));
  return kits.filter(kit => kit.kind === 'bootable_image' && kit.profile === 'dev' && compatible.has(kit.release_id))
    .sort((a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0))[0] ?? null;
}

function printLabel(label: StockLabel, heading: string): void {
  const frame = document.createElement('iframe');
  frame.title = heading;
  frame.style.position = 'fixed'; frame.style.width = '0'; frame.style.height = '0'; frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); throw new Error('print_unavailable'); }
  const style = doc.createElement('style');
  style.textContent = '@page{size:50mm 30mm;margin:2mm}body{font:9pt Arial,sans-serif;margin:0;color:#000}h1{font-size:10pt;margin:0 0 2mm}p{margin:1mm 0;overflow-wrap:anywhere}strong{display:inline-block;min-width:10mm}';
  doc.head.appendChild(style);
  const title = doc.createElement('h1'); title.textContent = heading; doc.body.appendChild(title);
  for (const [name, value] of [['Serial', label.serial], ['SSID', label.ssid], ['Wi-Fi', label.psk], ['Local', label.local_address]]) {
    const row = doc.createElement('p'); const key = doc.createElement('strong'); key.textContent = name;
    row.appendChild(key); row.appendChild(doc.createTextNode(String(value ?? ''))); doc.body.appendChild(row);
  }
  frame.onload = () => undefined;
  window.setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(() => frame.remove(), 1500); }, 100);
}

export function PsStockPreparation({ deviceId, onChanged }: Props) {
  const { t, locale } = useLocale();
  const { session } = useAuth();
  const errorText = (error: unknown) => t(errorCode(error));
  const status = useQuery({ queryKey: ['ps-stock-status', session?.user.id, deviceId], queryFn: () => getStockStatus(deviceId), enabled: !!session, refetchInterval: 15_000, retry: false, gcTime: 0 });
  const kits = useQuery({ queryKey: ['ps-stock-kits', session?.user.id], queryFn: listInstallKits, enabled: !!session, retry: false });
  const firmwares = useQuery({ queryKey: ['ps-stock-firmwares', session?.user.id], queryFn: () => getFirmwares(), enabled: !!session, retry: false });
  const [busy, setBusy] = useState<'file' | 'image' | 'label' | 'preview' | 'send' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replaceFile, setReplaceFile] = useState(false);
  const [sha, setSha] = useState('');
  const [label, setLabel] = useState<StockLabel | null>(null);
  const [to, setTo] = useState('');
  const [emailLocale, setEmailLocale] = useState<Locale>(locale);
  const [preview, setPreview] = useState<DeliveryEmailResult | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [serialConfirmation, setSerialConfirmation] = useState('');
  const data = status.isError ? null : status.data;
  const stock = data?.stock;
  const image = data && firmwares.data?.complete ? matchingImage(kits.data ?? [], firmwares.data.releases, data.model, data.arch) : null;
  const key = data ? `${data.device_id}|${data.serial}|${data.venue_id}|${stock?.state}|${to.trim()}|${emailLocale}` : '';
  const canFile = !!stock && !data?.legacy && ['not_prepared', 'file_issued', 'file_expired', 'file_invalid'].includes(stock.state) && !data?.venue_id;
  const canLabel = !!stock?.label_ready && ['validated_in_stock', 'validated_assigned'].includes(stock.state);
  const canEmail = stock?.state === 'validated_assigned';

  useEffect(() => { setLabel(null); setPreview(null); setPreviewKey(''); setSha(''); setReplaceFile(false); }, [deviceId]);
  useEffect(() => { setLabel(null); }, [stock?.reported.last_status_at, stock?.state, canLabel]);
  useEffect(() => { if (!canEmail || previewKey !== key) setPreview(null); }, [canEmail, key, previewKey]);

  async function refresh() { setError(''); setNotice(''); setLabel(null); setPreview(null); await status.refetch(); }
  async function issueFile() {
    if (!canFile || busy || (stock?.file && !replaceFile)) return;
    setBusy('file'); setError(''); setNotice(''); setSha('');
    try {
      const result = await downloadStockFile(deviceId);
      setSha(result.sha256); setReplaceFile(false); setNotice(t('psStock.fileDownloaded'));
      await status.refetch(); await onChanged();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function downloadImage() {
    if (!image || busy) return;
    setBusy('image'); setError('');
    try {
      const result = await getInstallKitDownload(image.id);
      const a = document.createElement('a'); a.href = result.url; a.download = result.filename || image.file_name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function loadLabel() {
    if (!canLabel || busy) return;
    setBusy('label'); setError(''); setLabel(null);
    try { setLabel(await getStockLabel(deviceId)); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function prepareEmail() {
    if (!canEmail || !to.trim() || busy) return;
    setBusy('preview'); setError(''); setPreview(null); setPreviewKey(''); setSerialConfirmation('');
    try { const result = await previewDeliveryEmail(deviceId, to.trim(), emailLocale); setPreview(result); setPreviewKey(key); }
    catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }
  async function sendEmail() {
    if (!canEmail || !preview || previewKey !== key || !preview.sendable || serialConfirmation !== data?.serial || busy) return;
    setBusy('send'); setError(''); setNotice('');
    try {
      const result = await sendDeliveryEmail(deviceId, to.trim(), emailLocale, serialConfirmation);
      setPreview(null); setPreviewKey(''); setSerialConfirmation('');
      setNotice(result.sent ? t('psStock.emailSent') : t('psStock.emailHeld').replace('{reason}', result.held_reason ?? t('notProvided')));
      await status.refetch(); await onChanged();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }

  return <section className="detail-panel ps-stock" id="ps-stock-preparation" aria-labelledby="ps-stock-title" data-testid="ps-stock">
    <div className="section-heading"><div><p className="eyebrow">{t('psStock.eyebrow')}</p><h2 id="ps-stock-title">{t('ps600.installation')}</h2></div></div>
    <p className="owner-section-lead">{t('psStock.lead')}</p>
    <div className="staff-actions"><button type="button" className="button button-secondary" onClick={() => void refresh()} disabled={!!busy || status.isFetching}><RefreshCw size={15}/>{t('psStock.refresh')}</button></div>
    {status.isLoading && <p role="status">{t('psStock.loading')}</p>}
    {status.isError && <p role="alert" className="form-error">{t('psStock.statusError').replace('{reason}', errorText(status.error))}</p>}
    {error && <p role="alert" className="form-error"><AlertTriangle size={15}/>{error}</p>}
    {notice && <p role="status" className="fw-notice">{notice}</p>}
    {data && stock && <>
      <div className="ps-stock-summary" data-testid="ps-stock-state">
        <strong>{t(`psStock.state.${stock.state}`)}</strong>
        <span>{t(`psStock.next.${stock.next_step ?? 'none'}`)}</span>
      </div>
<details className="ps600-technical ps-stock-technical" data-testid="ps-stock-technical"><summary>{t('ps600.stockTechnical')}</summary>
      <dl className="fw-release-facts ps-stock-facts">
        <div><dt>{t('psStock.serial')}</dt><dd className="ps-mono">{data.serial}</dd></div>
        <div><dt>{t('psStock.model')}</dt><dd>{data.model} · {data.arch}</dd></div>
        <div><dt>{t('psStock.venue')}</dt><dd>{data.venue_id ? t('psStock.assigned') : t('psStock.noVenue')}</dd></div>
        <div><dt>{t('psStock.fileIssued')}</dt><dd>{dateText(stock.file?.issued_at, locale, t('notProvided'))}</dd></div>
        <div><dt>{t('psStock.fileExpires')}</dt><dd>{dateText(stock.file?.expires_at, locale, t('notProvided'))}</dd></div>
        <div><dt>{t('psStock.lastStatus')}</dt><dd>{dateText(stock.reported.last_status_at, locale, t('notProvided'))}</dd></div>
        <div><dt>{t('psStock.lastSeen')}</dt><dd>{dateText(stock.reported.last_seen_at, locale, t('notProvided'))}</dd></div>
        <div><dt>{t('psStock.credential')}</dt><dd>{stock.credential?.permanent ? t('psStock.permanent') : t('psStock.pending')}</dd></div>
      </dl>
      <div className="ps-stock-checks" aria-label={t('psStock.checks')}>
        {(['enrolled', 'credentials_confirmed_by_device', 'status_reported_after_enroll', 'setup_url_reported', 'in_stock_without_venue'] as const).map(check =>
          <span key={check} className={stock.checks[check] ? 'ps-stock-check-ok' : ''}>{stock.checks[check] ? '✓' : '○'} {t(`psStock.check.${check}`)}</span>)}
      </div>
      </details>
      <div className="ps-stock-block">
        <h3>{t('psStock.imageTitle')}</h3>
        <p>{t('psStock.imageLead')}</p>
        {kits.isLoading || firmwares.isLoading ? <p role="status">{t('psStock.loadingImage')}</p> : kits.isError || firmwares.isError || !firmwares.data?.complete ? <p role="alert" className="form-error">{t('psStock.imageError')}</p> : image ? <><p className="ps-mono">{image.file_name} · SHA-256 {image.sha256}</p><button type="button" className="button button-secondary" data-testid="ps-stock-download-image" onClick={() => void downloadImage()} disabled={!!busy}><Download size={15}/>{t('psStock.downloadImage')}</button></> : <p role="status">{t('psStock.imageUnavailable')}</p>}
        <ol><li>{t('psStock.flash')}</li><li>{t('psStock.copy')}</li><li>{t('psStock.ethernet')}</li><li>{t('psStock.wait')}</li></ol>
      </div>
      <div className="ps-stock-block">
        <h3>{t('psStock.fileTitle')}</h3>
        <p>{t(data.legacy ? 'adminDevice.error.legacy_device' : 'psStock.fileLead')}</p>
        {stock.file?.sha256 && <p className="ps-mono ps-stock-hash">SHA-256 {stock.file.sha256}</p>}
        {sha && <p className="ps-mono ps-stock-hash" role="status">SHA-256 {sha}</p>}
        {canFile && <>{stock.file && <label className="ps-stock-confirm"><input type="checkbox" checked={replaceFile} onChange={e => setReplaceFile(e.target.checked)}/>{t('psStock.replaceFile')}</label>}<button type="button" className="button button-primary" data-testid="ps-stock-download-file" onClick={() => void issueFile()} disabled={!!busy || (!!stock.file && !replaceFile)}><Download size={15}/>{t('psStock.downloadFile')}</button></>}
      </div>
      <div className="ps-stock-block">
        <h3>{t('psStock.labelTitle')}</h3>
        <p>{canLabel ? t('psStock.labelReady') : t('psStock.labelPending')}</p>
        {canLabel && <button type="button" className="button button-secondary" data-testid="ps-stock-get-label" onClick={() => void loadLabel()} disabled={!!busy}><Printer size={15}/>{t('psStock.getLabel')}</button>}
        {label && canLabel && <div className="ps-stock-label" data-testid="ps-stock-label"><dl><div><dt>Serial</dt><dd>{label.serial}</dd></div><div><dt>SSID</dt><dd>{label.ssid}</dd></div><div><dt>Wi-Fi</dt><dd>{label.psk}</dd></div><div><dt>{t('psStock.localAddress')}</dt><dd>{label.local_address}</dd></div></dl><button type="button" className="button button-primary" data-testid="ps-stock-print-label" disabled={!!busy} onClick={() => { void (async () => { setBusy('label'); setLabel(null); try { const fresh = await getStockLabel(deviceId); printLabel(fresh, t('psStock.labelTitle')); } catch (e) { setError(errorText(e)); } finally { setBusy(null); } })(); }}><Printer size={15}/>{t('psStock.print')}</button></div>}
      </div>
      {canEmail && <div className="ps-stock-block" data-testid="ps-stock-email">
        <h3>{t('psStock.emailTitle')}</h3><p>{t('psStock.emailDevRule')}</p>
        <div className="ps-stock-mail-fields"><label className="field"><span>{t('psStock.recipient')}</span><input type="email" value={to} onChange={e => { setTo(e.target.value); setPreview(null); setSerialConfirmation(''); }} autoComplete="off" disabled={!!busy}/></label><label className="field"><span>{t('psStock.language')}</span><select value={emailLocale} onChange={e => { setEmailLocale(e.target.value as Locale); setPreview(null); setSerialConfirmation(''); }} disabled={!!busy}><option value="es">Español</option><option value="en">English</option></select></label></div>
        <button type="button" className="button button-secondary" data-testid="ps-stock-preview-email" onClick={() => void prepareEmail()} disabled={!!busy || !to.trim()}><Mail size={15}/>{t('psStock.preview')}</button>
        {preview && previewKey === key && <div className="ps-stock-mail-preview" data-testid="ps-stock-email-preview"><p><strong>{t('psStock.subject')}</strong> {preview.email?.subject ?? t('notProvided')}</p><pre>{preview.email?.text ?? t('notProvided')}</pre>{!preview.sendable && <p role="status">{t('psStock.emailHeld').replace('{reason}', preview.held_reason ?? t('notProvided'))}</p>}{preview.sendable && <><label className="field"><span>{t('psStock.confirmSerial').replace('{serial}', data.serial)}</span><input value={serialConfirmation} onChange={e => setSerialConfirmation(e.target.value)} autoComplete="off" disabled={!!busy}/></label><button type="button" className="button button-primary" data-testid="ps-stock-send-email" onClick={() => void sendEmail()} disabled={!!busy || serialConfirmation !== data.serial}>{t('psStock.send')}</button></>}</div>}
      </div>}
    </>}
  </section>;
}
