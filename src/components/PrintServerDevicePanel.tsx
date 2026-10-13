import { useAuth } from '../hooks/useAuth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Clock3, Copy, Eye, EyeOff, FileKey2, KeyRound, RefreshCw, Upload, Wifi, X } from 'lucide-react';
import { getDeviceSheet, latestRotation, pendingReason, renewCert, rotateAdminCode, rotateWifi, uploadCert, wifiQrPayload, type DeviceOp } from '../lib/psDevice';
import { relativeTime } from '../lib/printFleet';
import { psErrorKey } from '../lib/printServerApi';
import { formatFingerprint } from '../lib/certificate';
import { useLocale } from '../locales';
import { PrintServerLabel } from './PrintServerLabel';
import { PortalDialog } from './PortalDialog';
import { reconcileCredentialOperation, type CredentialKind, type CredentialOperation } from '../lib/psCredentialOperation';

// Operational facts and confirmed human credentials are kept separate by the server DTO.
type Props = { venueId: string; printServerId: string | null };
type Result = { ok: boolean; text: string };

export function PrintServerDevicePanel({ venueId, printServerId }: Props) {
  const { t, locale } = useLocale();
  const {session} = useAuth();
  // PE-428: poll every ~10 s only while a rotation is pending (server-side or just requested here).
  const localPending = useRef(false);
  const sheet = useQuery({ queryKey: ['ps-device', session?.user.id, venueId], queryFn: ({ signal }) => getDeviceSheet(venueId, signal),
    refetchInterval: query => localPending.current || query.state.data?.rotations.some(o => o.status === 'pending') ? 10_000 : false });
  const [now, setNow] = useState(() => Date.now());
  const [visibility, setVisibility] = useState({ scope: '', ssid: false, psk: false, code: false });
  const [qr, setQr] = useState<{ url: string; ssid: string; psk: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [confirm, setConfirm] = useState<'renew' | null>(null);
  const [credentialDialog, setCredentialDialog] = useState<{ scope: string; kind: CredentialKind; phase: 'confirm' | 'progress' } | null>(null);
  const [credentialOperations, setCredentialOperations] = useState<Partial<Record<CredentialKind, CredentialOperation & { scope: string }>>>({});
  const [copyNotice, setCopyNotice] = useState<{ scope: string; ok: boolean; text: string } | null>(null);
  const [certPem, setCertPem] = useState(''); const [chainPem, setChainPem] = useState('');
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const data = sheet.data;
  const accessError = sheet.isError ? psErrorKey(sheet.error) : null;
  const accessLost = accessError === 'accessDenied' || accessError === 'sessionExpired';
  const trackingUnavailable = sheet.isError && !accessLost;
  const operationScope = JSON.stringify([session?.user.id, venueId, printServerId, data?.device?.id, data?.credentialAccess, data?.can_manage_credentials, accessLost]);
  const scopeRef = useRef(operationScope);
  scopeRef.current = operationScope;
  const operationFor = (kind: CredentialKind) => {
    const entry = credentialOperations[kind];
    return entry?.scope === operationScope ? data ? reconcileCredentialOperation(entry, data.rotations) : entry : null;
  };
  const activeDialog = credentialDialog?.scope === operationScope ? credentialDialog : null;
  const dialogOperation = activeDialog ? operationFor(activeDialog.kind) : null;
  useEffect(() => {
    setCredentialDialog(null);
    setCredentialOperations({});
    setCopyNotice(null);
  }, [operationScope]);
  localPending.current = (['wifi', 'admin_code'] as const).some(kind => ['sending', 'pending'].includes(operationFor(kind)?.phase ?? ''));
  const anyPending = localPending.current || !!data?.rotations.some(o => o.status === 'pending');
  useEffect(() => {
    setNow(Date.now());
    if (!anyPending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [anyPending, sheet.dataUpdatedAt]);
  const wifi = data?.credentialAccess ? data.appliedWifi : null;
  const adminCode = data?.credentialAccess ? data.appliedAdminCode : null;
  // Revealed values belong to this exact identity and confirmed snapshot. A new snapshot
  // is masked during render itself, before effects run (no one-frame disclosure).
  const revealScope = JSON.stringify([session?.user.id, venueId, data?.device?.id, data?.credentialAccess, wifi?.ssid, wifi?.psk, adminCode?.code]);
  const hidden = { ssid: false, psk: false, code: false };
  const show = visibility.scope === revealScope ? visibility : hidden;
  function setShow(next: typeof hidden | ((previous: typeof hidden) => typeof hidden)) {
    setVisibility(previous => ({ ...(typeof next === 'function' ? next(previous.scope === revealScope ? previous : hidden) : next), scope: revealScope }));
  }


  useEffect(() => { setShow({ ssid: false, psk: false, code: false }); setQr(null); }, [session?.user.id, venueId, data?.credentialAccess]);
  useEffect(() => { setShow({ ssid: false, psk: false, code: false }); setQr(null); }, [wifi?.ssid, wifi?.psk, adminCode?.code]);

  useEffect(() => {
    if (!data) return;
    setCredentialOperations(previous => {
      let changed = false;
      const next = { ...previous };
      for (const kind of ['wifi', 'admin_code'] as const) {
        const entry = previous[kind];
        if (!entry || entry.scope !== operationScope) continue;
        const updated = reconcileCredentialOperation(entry, data.rotations);
        if (updated.phase !== entry.phase || updated.errorKey !== entry.errorKey) { next[kind] = { ...updated, scope: operationScope }; changed = true; }
      }
      return changed ? next : previous;
    });
  }, [data?.rotations, operationScope]);

  useEffect(() => {
    if (!wifi || !show.psk) { setQr(null); return; }
    let live = true;
    void QRCode.toDataURL(wifiQrPayload(wifi.ssid, wifi.psk), { margin: 1, width: 220 }).then(url => { if (live) setQr({ url, ssid: wifi.ssid, psk: wifi.psk }); });
    return () => { live = false; };
  }, [wifi?.ssid, wifi?.psk, show.psk]);

  async function copy(value: string) {
    const scope = operationScope;
    try { await navigator.clipboard.writeText(value); if (scopeRef.current === scope) setCopyNotice({ scope, ok: true, text: t('dev.copied') }); }
    catch { if (scopeRef.current === scope) setCopyNotice({ scope, ok: false, text: t('dev.copyFailed') }); }
  }

  async function requestCredential(kind: CredentialKind) {
    const scope = operationScope;
    if (!data?.can_manage_credentials || !data.device || sheet.isError || scopeRef.current !== scope) return;
    setCredentialDialog({ scope, kind, phase: 'progress' });
    setCredentialOperations(previous => ({ ...previous, [kind]: { scope, kind, commandId: null, phase: 'sending' } }));
    try {
      const response = kind === 'wifi' ? await rotateWifi(venueId) : await rotateAdminCode(venueId);
      if (scopeRef.current !== scope) return;
      const commandId = typeof response.command_id === 'string' && response.command_id.trim() ? response.command_id : null;
      setCredentialOperations(previous => ({ ...previous, [kind]: { scope, kind, commandId, phase: commandId ? 'pending' : 'failed', errorKey: commandId ? undefined : 'dev.rotationTrackingFailed' } }));
      if (commandId) { localPending.current = true; void sheet.refetch(); }
    } catch (error) {
      if (scopeRef.current !== scope) return;
      const key = psErrorKey(error);
      setCredentialOperations(previous => ({ ...previous, [kind]: { scope, kind, commandId: null, phase: 'failed', errorKey: t(key) === key ? 'dev.error.other' : key } }));
    }
  }

  async function run(fn: () => Promise<unknown>, okKey: string) {
    setBusy(true); setResult(null);
    try { await fn(); setResult({ ok: true, text: t(okKey) }); await sheet.refetch(); }
    catch (error) { const key = psErrorKey(error); setResult({ ok: false, text: t(key) === key ? t('dev.error.other') : t(key) }); }
    finally { setBusy(false); setConfirm(null); }
  }

  const help = <details className="dev-help" id="ps-recovery-help"><summary>{t('dev.help.title')}</summary><ol><li>{t('dev.help.identify')}</li><li>{t('dev.help.connect')}</li><li>{t('dev.help.recover')}</li><li>{t('dev.help.install')}</li><li>{t('dev.help.rotate')}</li><li>{t('dev.help.confirm')}</li></ol></details>;
  const label = <PrintServerLabel key={`${session?.user.id}:${venueId}`} userId={session?.user.id} venueId={venueId} sheet={data} accessLost={accessLost} pendingWifi={['sending', 'pending'].includes(operationFor('wifi')?.phase ?? '')}/>;
  if (accessLost || (sheet.isError && !data)) return <section className="detail-panel" data-testid="ps-device-panel"><div className="inline-empty">{t(accessLost ? accessError! : 'genericError')}</div>{label}{help}</section>;
  if (!data) return <section className="detail-panel" data-testid="ps-device-panel"><div className="inline-empty">{t('dev.loading')}</div>{label}{help}</section>;
  const opLabel = (o: DeviceOp) => `${t(`dev.op.${o.kind}`)} · ${t(`dev.status.${o.status}`)}`;
  const pendingRotation = (kind: string) => data.rotations.some(o => o.kind === kind && o.status === 'pending');
  const errorText = (code: string | null) => { const key = `dev.error.${code ?? 'other'}`; return t(key) === key ? (code ?? t('dev.error.other')) : t(key); };
  // Status of the latest rotation per kind. The confirmed value above always comes from the
  // `wifi` object (last value the device confirmed); a requested value is never shown as applied.
  const rotationStatus = (kind: 'wifi' | 'admin_code') => {
    const item = latestRotation(data.rotations, kind);
    if (!item) return null;
    const reason = item.status === 'pending' ? pendingReason(item, data.ps_online) : null;
    const ago = relativeTime(item.requested_at, now, locale);
    return <div key={kind} className={`dev-operation-notice dev-operation-${item.status}`} role="status" aria-live="polite" data-testid={`dev-rotation-status-${kind}`} data-status={item.status} data-wait-reason={reason ?? undefined}>
      {item.status === 'applied' ? <Check size={16}/> : item.status === 'failed' ? <AlertTriangle size={16}/> : <Clock3 size={16}/>}
      <span><strong>{t(`dev.op.${kind}`)}: {t(`dev.rotationState.${item.status}`)}</strong>
        {item.status === 'pending' && <>{ago ? ` · ${t('dev.rotation.requestedAgo').replace('{ago}', ago)}` : ''}<br/>{t(`dev.waitReason.${reason}`)}{item.received_at ? <><br/>{t('dev.rotation.receivedAt').replace('{date}', date(item.received_at))}</> : null}</>}
        {item.status === 'applied' && ` · ${date(item.completed_at)}${kind === 'wifi' ? ` ${t('dev.label.reprint')}` : ''}`}
        {item.status === 'failed' && <>{item.completed_at ? ` · ${date(item.completed_at)}` : ''}<br/>{errorText(item.error_code)}{item.error_detail ? ` (${item.error_detail})` : ''}{item.previous_kept ? <><br/>{t('dev.rotation.previousKept')}</> : null}</>}
      </span>
    </div>;
  };
  const fp = data.cert.der_sha256 ? formatFingerprint(data.cert.der_sha256) ?? data.cert.der_sha256 : null;

  return <>
    <section className="detail-panel ps-device-panel" aria-labelledby="ps-device-title" data-testid="ps-device-panel">
      <div className="section-heading"><div><p className="eyebrow">{t('dev.eyebrow')}</p><h2 id="ps-device-title">{t('dev.title')}</h2></div><span className="section-icon"><Wifi size={20}/></span></div>
      {trackingUnavailable && <p className="dev-tracking-warning" role="status" data-testid="dev-tracking-warning"><AlertTriangle size={16}/><span>{t('dev.trackingUnavailable')}</span></p>}
      {!data.device ? <div className="inline-empty" data-testid="ps-device-none">{t('dev.noDevice')}</div> : <>
        <dl className="dev-facts">
          <div><dt>{t('dev.serial')}</dt><dd data-testid="dev-serial">{data.device.serial}</dd></div>
          <div><dt>{t('ps.hostname')}</dt><dd data-testid="dev-hostname">{data.device.hostname}</dd></div>
          <div><dt>{t('fw.model')}</dt><dd>{data.device.model === 'rpi4-2gb' ? 'Raspberry Pi 4 2GB' : data.device.model}</dd></div>
          <div><dt>{t('state')}</dt><dd>{t(`dev.deviceStatus.${data.device.status}`)}{data.device.legacy ? ` · ${t('dev.legacy')}` : ''}</dd></div>
          <div><dt>{t('dev.online')}</dt><dd data-testid="dev-online" data-online={String(data.ps_online)}>{t(data.ps_online ? 'dev.onlineYes' : 'dev.onlineNo')}{data.last_seen_at ? ` · ${t('dev.lastSeen').replace('{date}', date(data.last_seen_at))}` : ''}</dd></div>
        </dl>
        {data.credentialAccess ? <div className="dev-wifi">
          <div className="dev-wifi-values">
            <dl className="dev-facts">
              <div><dt>{t('dev.ssid')}</dt><dd className="dev-secret" data-testid="dev-ssid">{wifi ? <><span className="ps-mono">{show.ssid ? wifi.ssid : '••••••••••'}</span><button type="button" className="icon-button" aria-label={t(show.ssid ? 'dev.hideSsid' : 'dev.showSsid')} onClick={() => setShow(s => ({ ...s, ssid: !s.ssid }))}>{show.ssid ? <EyeOff size={16}/> : <Eye size={16}/>}</button><button type="button" className="icon-button" aria-label={t('dev.copySsid')} onClick={() => void copy(wifi.ssid)}><Copy size={16}/></button></> : <>{t('dev.credentialAbsent')} <a href="#ps-recovery-help" onClick={() => { const help = document.getElementById('ps-recovery-help') as HTMLDetailsElement | null; if (help) help.open = true; }}>{t('dev.help.link')}</a></>}</dd></div>
              <div><dt>{t('dev.psk')}</dt><dd className="dev-secret" data-testid="dev-psk">{wifi ? <><span className="ps-mono">{show.psk ? wifi.psk : '••••••••••'}</span><button type="button" className="icon-button" aria-label={t(show.psk ? 'dev.hidePsk' : 'dev.showPsk')} onClick={() => setShow(s => ({ ...s, psk: !s.psk }))}>{show.psk ? <EyeOff size={16}/> : <Eye size={16}/>}</button><button type="button" className="icon-button" aria-label={t('dev.copyPsk')} onClick={() => void copy(wifi.psk)}><Copy size={16}/></button></> : t('dev.credentialAbsent')}</dd></div>
              <div><dt>{t('dev.adminCode')}</dt><dd className="dev-secret" data-testid="dev-admin-code">{adminCode ? <><span className="ps-mono">{show.code ? adminCode.code : '••••••••••'}</span><button type="button" className="icon-button" aria-label={t(show.code ? 'dev.hideCode' : 'dev.showCode')} onClick={() => setShow(s => ({ ...s, code: !s.code }))}>{show.code ? <EyeOff size={16}/> : <Eye size={16}/>}</button><button type="button" className="icon-button" aria-label={t('dev.copyCode')} onClick={() => void copy(adminCode.code)}><Copy size={16}/></button></> : <>{t('dev.credentialAbsent')} <a href="#ps-recovery-help" onClick={() => { const help = document.getElementById('ps-recovery-help') as HTMLDetailsElement | null; if (help) help.open = true; }}>{t('dev.help.link')}</a></>}</dd></div>
              <div><dt>{t('dev.applied')}</dt><dd data-testid="dev-applied-at">{t('dev.psk')}: {wifi ? date(wifi.applied_at) : t('dev.credentialAbsent')}{wifi && data.wifiMethod ? ` · ${t(`dev.method.${data.wifiMethod}`) === `dev.method.${data.wifiMethod}` ? data.wifiMethod : t(`dev.method.${data.wifiMethod}`)}` : ''}<br/>{t('dev.adminCode')}: {adminCode ? date(adminCode.applied_at) : t('dev.credentialAbsent')}{adminCode && data.adminCodeMethod ? ` · ${t(`dev.method.${data.adminCodeMethod}`) === `dev.method.${data.adminCodeMethod}` ? data.adminCodeMethod : t(`dev.method.${data.adminCodeMethod}`)}` : ''}</dd></div>
            </dl>
            {copyNotice?.scope === operationScope && <p className={`dev-copy-notice ${copyNotice.ok ? 'dev-copy-ok' : 'dev-copy-error'}`} role="status" aria-live="polite" data-testid="dev-copy-result">{copyNotice.ok ? <Check size={16}/> : <AlertTriangle size={16}/>}<span>{copyNotice.text}</span></p>}
            {data.can_manage_credentials && <div className="staff-actions">
              <button type="button" className="button button-secondary" data-testid="dev-rotate-wifi" disabled={busy || sheet.isError || pendingRotation('wifi') || ['sending', 'pending'].includes(operationFor('wifi')?.phase ?? '')} onClick={() => setCredentialDialog({ scope: operationScope, kind: 'wifi', phase: 'confirm' })}><RefreshCw size={15}/>{t('dev.rotateWifi')}</button>
              <button type="button" className="button button-secondary" data-testid="dev-rotate-code" disabled={busy || sheet.isError || pendingRotation('admin_code') || ['sending', 'pending'].includes(operationFor('admin_code')?.phase ?? '')} onClick={() => setCredentialDialog({ scope: operationScope, kind: 'admin_code', phase: 'confirm' })}><KeyRound size={15}/>{t('dev.rotateCode')}</button>
            </div>}
            {(['wifi', 'admin_code'] as const).map(kind => {
              const current = operationFor(kind);
              // Once the device has the request, the per-kind status below (from ps_panel_device) is authoritative.
              const shown = current && (current.phase === 'sending' || (current.phase === 'failed' && !current.commandId) || (current.phase === 'pending' && !data.rotations.some(o => o.command_id === current.commandId)));
              return shown && <p key={kind} className={`dev-operation-notice dev-operation-${current.phase}`} role="status" aria-live="polite" data-testid={`dev-operation-${kind}`} data-phase={current.phase}>
                {current.phase === 'applied' ? <Check size={16}/> : current.phase === 'failed' ? <AlertTriangle size={16}/> : <Clock3 size={16}/>}
                <span><strong>{t(`dev.op.${kind}`)}:</strong> {t(`dev.rotationPhase.${current.phase}`)}{current.phase === 'failed' && current.errorKey ? ` ${t(current.errorKey) === current.errorKey ? t('dev.error.other') : t(current.errorKey)}` : ''}{kind === 'wifi' && current.phase === 'applied' ? ` ${t('dev.label.reprint')}` : ''}</span>
              </p>;
            })}
            <div className="dev-rotation-status" data-testid="dev-rotation-status">{(['wifi', 'admin_code'] as const).map(rotationStatus)}</div>
          </div>
          {show.psk && qr && wifi && qr.ssid === wifi.ssid && qr.psk === wifi.psk && <figure className="dev-qr" data-testid="dev-qr"><img src={qr.url} alt={t('dev.qrAlt').replace('{ssid}', wifi.ssid)} width={180} height={180}/><figcaption>{t('dev.qrCaption')}</figcaption></figure>}
        </div> : <p className="owner-section-lead">{t('dev.credentialsRestricted')} <a href="#ps-recovery-help" onClick={() => { const help = document.getElementById('ps-recovery-help') as HTMLDetailsElement | null; if (help) help.open = true; }}>{t('dev.help.link')}</a></p>}
        {!data.credentialAccess && <div className="dev-rotation-status" data-testid="dev-rotation-status">{(['wifi', 'admin_code'] as const).map(rotationStatus)}</div>}
        {data.rotations.length > 0 && <div className="dev-ops"><h3>{t('dev.rotations')}</h3><ul data-testid="dev-rotations">{data.rotations.map(o => <li key={o.command_id} data-status={o.status} data-kind={o.kind}><span className={`server-status ${o.status === 'applied' ? 'server-online' : o.status === 'failed' ? 'server-revoked' : 'server-pending'}`}><span className="badge-dot"/>{opLabel(o)}</span><small>{date(o.requested_at)}{o.completed_at ? ` → ${date(o.completed_at)}` : ` · ${t(`dev.waitReason.${pendingReason(o, data.ps_online)}`)}`}{o.error_code ? ` · ${errorText(o.error_code)}` : ''}{o.status === 'failed' && o.previous_kept ? ` · ${t('dev.rotation.previousKept')}` : ''}</small></li>)}</ul></div>}
      </>}
      {label}
      {help}
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
      <p id="dev-confirm-title"><Clock3 size={16}/>{t('dev.confirm.renew')}</p>
      <div className="staff-actions">
        <button type="button" className="button button-primary" data-testid="dev-confirm-accept" disabled={busy} onClick={() => void run(() => renewCert(printServerId!), 'dev.https.renewRequested')}><Check size={15}/>{t('dev.confirm.accept')}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}><X size={15}/>{t('dev.confirm.cancel')}</button>
      </div>
    </div>}
    {activeDialog && <PortalDialog
      title={t(`dev.rotationTitle.${activeDialog.kind}`)} titleId="dev-credential-dialog-title" descriptionId="dev-credential-dialog-description"
      testId="dev-confirm" onClose={() => setCredentialDialog(null)}
      actions={activeDialog.phase === 'confirm' ? <>
        <button type="button" className="button button-secondary" onClick={() => setCredentialDialog(null)}>{t('dev.confirm.cancel')}</button>
        <button type="button" className="button button-primary" data-testid="dev-confirm-accept" disabled={sheet.isError} onClick={() => void requestCredential(activeDialog.kind)}><Check size={15}/>{t('dev.confirm.accept')}</button>
      </> : <button type="button" className="button button-secondary" data-testid="dev-dialog-close" onClick={() => setCredentialDialog(null)}>{t('dev.confirm.close')}</button>}>
      {activeDialog.phase === 'confirm' ? <div id="dev-credential-dialog-description"><p>{t(`dev.confirm.${activeDialog.kind === 'wifi' ? 'wifi' : 'code'}`)}</p>{trackingUnavailable && <p className="dev-tracking-warning" role="status"><AlertTriangle size={16}/>{t('dev.trackingUnavailable')}</p>}</div>
        : <div id="dev-credential-dialog-description" className={`dev-dialog-status dev-dialog-${dialogOperation?.phase ?? 'sending'}`} role="status" aria-live="polite" data-testid="dev-credential-status" data-phase={dialogOperation?.phase ?? 'sending'}>
          {dialogOperation?.phase === 'applied' ? <Check size={20}/> : dialogOperation?.phase === 'failed' ? <AlertTriangle size={20}/> : <Clock3 size={20}/>}
          <p>{t(`dev.rotationPhase.${dialogOperation?.phase ?? 'sending'}`)}{dialogOperation?.phase === 'failed' && dialogOperation.errorKey ? ` ${t(dialogOperation.errorKey) === dialogOperation.errorKey ? t('dev.error.other') : t(dialogOperation.errorKey)}` : ''}</p>
          {activeDialog.kind === 'wifi' && dialogOperation?.phase === 'applied' && <p>{t('dev.label.reprint')}</p>}
          {trackingUnavailable && <p>{t('dev.trackingUnavailable')}</p>}
        </div>}
    </PortalDialog>}
  </>;
}
