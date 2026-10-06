import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Clock3, Eye, EyeOff, FileKey2, KeyRound, RefreshCw, Upload, Wifi, X } from 'lucide-react';
import { getDeviceSheet, renewCert, rotateAdminCode, rotateWifi, uploadCert, wifiQrPayload, type DeviceOp } from '../lib/psDevice';
import { psErrorKey } from '../lib/printServerApi';
import { formatFingerprint } from '../lib/certificate';
import { useLocale } from '../locales';

// PE-384 device sheet: inventory identity, Wi-Fi label (QR = Wi-Fi only), administrative code,
// rotations confirmed by the Print Server and its own HTTPS certificate. Owners see and rotate
// the operational values of their venue; certificate operations are platform Admin only. The
// backend validates every call again.
type Props = { venueId: string; printServerId: string | null };
type Result = { ok: boolean; text: string };

export function PrintServerDevicePanel({ venueId, printServerId }: Props) {
  const { t, locale } = useLocale();
  const sheet = useQuery({ queryKey: ['ps-device', venueId], queryFn: ({ signal }) => getDeviceSheet(venueId, signal), refetchInterval: 10_000 });
  const [show, setShow] = useState({ psk: false, code: false });
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [confirm, setConfirm] = useState<'wifi' | 'code' | 'renew' | null>(null);
  const [certPem, setCertPem] = useState(''); const [chainPem, setChainPem] = useState('');
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const data = sheet.data;
  const wifi = data?.wifi ?? null;

  useEffect(() => {
    if (!wifi) { setQr(null); return; }
    let live = true;
    void QRCode.toDataURL(wifiQrPayload(wifi.ssid, wifi.psk), { margin: 1, width: 220 }).then(url => { if (live) setQr(url); });
    return () => { live = false; };
  }, [wifi?.ssid, wifi?.psk]);

  async function run(fn: () => Promise<unknown>, okKey: string) {
    setBusy(true); setResult(null);
    try { await fn(); setResult({ ok: true, text: t(okKey) }); await sheet.refetch(); }
    catch (error) { const key = psErrorKey(error); setResult({ ok: false, text: t(key) === key ? t('dev.error.other') : t(key) }); }
    finally { setBusy(false); setConfirm(null); }
  }

  if (sheet.isError) return <section className="detail-panel" data-testid="ps-device-panel"><div className="inline-empty">{t(psErrorKey(sheet.error) === 'accessDenied' ? 'accessDenied' : 'genericError')}</div></section>;
  if (!data) return <section className="detail-panel" data-testid="ps-device-panel"><div className="inline-empty">{t('dev.loading')}</div></section>;
  const opLabel = (o: DeviceOp) => `${t(`dev.op.${o.kind}`)} · ${t(`dev.status.${o.status}`)}`;
  const pendingRotation = (kind: string) => data.rotations.some(o => o.kind === kind && o.status === 'pending');
  const fp = data.cert.der_sha256 ? formatFingerprint(data.cert.der_sha256) ?? data.cert.der_sha256 : null;

  return <>
    <section className="detail-panel ps-device-panel" aria-labelledby="ps-device-title" data-testid="ps-device-panel">
      <div className="section-heading"><div><p className="eyebrow">{t('dev.eyebrow')}</p><h2 id="ps-device-title">{t('dev.title')}</h2></div><span className="section-icon"><Wifi size={20}/></span></div>
      {!data.device ? <div className="inline-empty" data-testid="ps-device-none">{t('dev.noDevice')}</div> : <>
        <dl className="dev-facts">
          <div><dt>{t('dev.serial')}</dt><dd data-testid="dev-serial">{data.device.serial}</dd></div>
          <div><dt>{t('ps.hostname')}</dt><dd data-testid="dev-hostname">{data.device.hostname}</dd></div>
          <div><dt>{t('fw.model')}</dt><dd>{data.device.model === 'rpi4-2gb' ? 'Raspberry Pi 4 2GB' : data.device.model}</dd></div>
          <div><dt>{t('state')}</dt><dd>{t(`dev.deviceStatus.${data.device.status}`)}{data.device.legacy ? ` · ${t('dev.legacy')}` : ''}</dd></div>
        </dl>
        {wifi ? <div className="dev-wifi">
          <div className="dev-wifi-values">
            <dl className="dev-facts">
              <div><dt>{t('dev.ssid')}</dt><dd data-testid="dev-ssid">{wifi.ssid}</dd></div>
              <div><dt>{t('dev.psk')}</dt><dd className="dev-secret"><span className="ps-mono" data-testid="dev-psk">{show.psk ? wifi.psk : '••••••••••'}</span><button type="button" className="icon-button" aria-label={t(show.psk ? 'dev.hide' : 'dev.show')} onClick={() => setShow(s => ({ ...s, psk: !s.psk }))}>{show.psk ? <EyeOff size={16}/> : <Eye size={16}/>}</button></dd></div>
              <div><dt>{t('dev.adminCode')}</dt><dd className="dev-secret"><span className="ps-mono" data-testid="dev-admin-code">{show.code ? wifi.admin_code : '••••••••••'}</span><button type="button" className="icon-button" aria-label={t(show.code ? 'dev.hide' : 'dev.show')} onClick={() => setShow(s => ({ ...s, code: !s.code }))}>{show.code ? <EyeOff size={16}/> : <Eye size={16}/>}</button></dd></div>
              <div><dt>{t('dev.applied')}</dt><dd>{t('dev.psk')}: {date(wifi.wifi_applied_at)}<br/>{t('dev.adminCode')}: {date(wifi.admin_code_applied_at)}</dd></div>
            </dl>
            {data.can_manage && <div className="staff-actions">
              <button type="button" className="button button-secondary" data-testid="dev-rotate-wifi" disabled={busy || pendingRotation('wifi')} onClick={() => setConfirm('wifi')}><RefreshCw size={15}/>{t('dev.rotateWifi')}</button>
              <button type="button" className="button button-secondary" data-testid="dev-rotate-code" disabled={busy || pendingRotation('admin_code')} onClick={() => setConfirm('code')}><KeyRound size={15}/>{t('dev.rotateCode')}</button>
            </div>}
          </div>
          {qr && <figure className="dev-qr" data-testid="dev-qr"><img src={qr} alt={t('dev.qrAlt').replace('{ssid}', wifi.ssid)} width={180} height={180}/><figcaption>{t('dev.qrCaption')}</figcaption></figure>}
        </div> : <p className="owner-section-lead">{t('dev.noWifi')}</p>}
        {data.rotations.length > 0 && <div className="dev-ops"><h3>{t('dev.rotations')}</h3><ul data-testid="dev-rotations">{data.rotations.map(o => <li key={o.command_id} data-status={o.status} data-kind={o.kind}><span className={`server-status ${o.status === 'applied' ? 'server-online' : o.status === 'failed' ? 'server-revoked' : 'server-pending'}`}><span className="badge-dot"/>{opLabel(o)}</span><small>{date(o.requested_at)}{o.completed_at ? ` → ${date(o.completed_at)}` : ` · ${t('dev.waitingPs')}`}{o.error_code ? ` · ${o.error_code}` : ''}</small></li>)}</ul></div>}
      </>}
      <p className="ps-cert-small">{t('dev.tokensNote')}</p>
    </section>

    <section className="detail-panel" aria-labelledby="ps-https-title" data-testid="ps-https-panel">
      <div className="section-heading"><div><p className="eyebrow">{t('dev.https.eyebrow')}</p><h2 id="ps-https-title">{t('dev.https.title')}</h2></div><span className="section-icon"><FileKey2 size={20}/></span></div>
      <p className="owner-section-lead">{t('dev.https.lead')}</p>
      {data.cert.status === 'none' ? <div className="inline-empty" data-testid="https-none">{t('dev.https.none')}</div> : <dl className="dev-facts">
        <div><dt>{t('ps.hostname')}</dt><dd data-testid="https-hostname">{data.cert.hostname ?? t('notProvided')}</dd></div>
        <div><dt>{t('dev.https.validity')}</dt><dd data-testid="https-validity">{date(data.cert.not_before)} → {date(data.cert.not_after)} <span className={`server-status ${data.cert.status === 'valid' ? 'server-online' : 'server-revoked'}`}><span className="badge-dot"/>{t(`dev.https.${data.cert.status}`)}</span></dd></div>
        <div className="dev-wide"><dt>{t('ps.cert.fingerprintDer')}</dt><dd className="ps-mono fw-hash" data-testid="https-fingerprint">{fp ?? t('notProvided')}</dd></div>
      </dl>}
      {data.cert_operations.length > 0 && <div className="dev-ops"><h3>{t('dev.https.operations')}</h3><ul data-testid="https-operations">{data.cert_operations.map(o => <li key={o.command_id} data-status={o.status} data-kind={o.kind}><span className={`server-status ${o.status === 'applied' ? 'server-online' : o.status === 'failed' ? 'server-revoked' : 'server-pending'}`}><span className="badge-dot"/>{opLabel(o)}</span><small>{date(o.requested_at)}{o.completed_at ? ` → ${date(o.completed_at)}` : ` · ${t('dev.waitingPs')}`}{o.error_code ? ` · ${t(`dev.error.${o.error_code}`) === `dev.error.${o.error_code}` ? o.error_code : t(`dev.error.${o.error_code}`)}` : ''}</small></li>)}</ul></div>}
      {data.is_platform_admin && printServerId && <div className="dev-cert-admin">
        <button type="button" className="button button-secondary" data-testid="https-renew" disabled={busy || data.cert_operations.some(o => o.status === 'pending')} onClick={() => setConfirm('renew')}><RefreshCw size={15}/>{t('dev.https.renew')}</button>
        <details className="dev-upload"><summary>{t('dev.https.uploadTitle')}</summary>
          <p className="ps-cert-small">{t('dev.https.uploadHint')}</p>
          <label className="field"><span>{t('dev.https.certPem')}</span><textarea rows={5} value={certPem} data-testid="https-cert-pem" onChange={e => setCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----"/></label>
          <label className="field"><span>{t('dev.https.chainPem')}</span><textarea rows={4} value={chainPem} data-testid="https-chain-pem" onChange={e => setChainPem(e.target.value)}/></label>
          <button type="button" className="button button-primary" data-testid="https-upload" disabled={busy || !certPem.trim()} onClick={() => void run(async () => { await uploadCert(printServerId, certPem, chainPem); setCertPem(''); setChainPem(''); }, 'dev.https.uploaded')}><Upload size={15}/>{t('dev.https.upload')}</button>
        </details>
      </div>}
    </section>

    <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="dev-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>

    {confirm && <div className="dev-confirm" role="alertdialog" aria-labelledby="dev-confirm-title" data-testid="dev-confirm">
      <p id="dev-confirm-title"><Clock3 size={16}/>{t(`dev.confirm.${confirm}`)}</p>
      <div className="staff-actions">
        <button type="button" className="button button-primary" data-testid="dev-confirm-accept" disabled={busy} onClick={() => void run(
          confirm === 'wifi' ? () => rotateWifi(venueId) : confirm === 'code' ? () => rotateAdminCode(venueId) : () => renewCert(printServerId!),
          confirm === 'renew' ? 'dev.https.renewRequested' : 'dev.rotationRequested')}><Check size={15}/>{t('dev.confirm.accept')}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}><X size={15}/>{t('dev.confirm.cancel')}</button>
      </div>
    </div>}
  </>;
}
