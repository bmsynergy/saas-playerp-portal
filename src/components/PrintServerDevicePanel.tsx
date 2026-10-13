import { useAuth } from '../hooks/useAuth';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Clock3, Copy, Eye, EyeOff, KeyRound, RefreshCw, Upload, Wifi, X } from 'lucide-react';
import { getDeviceSheet, getLegacyContext, latestRotation, pendingReason, renewCert, rotateAdminCode, rotateWifi, uploadCert, wifiQrPayload, type DeviceOp } from '../lib/psDevice';
import { PsError, psErrorKey } from '../lib/printServerApi';
import { formatFingerprint } from '../lib/certificate';
import { useLocale } from '../locales';
import { PrintServerLabel } from './PrintServerLabel';
import { PortalDialog } from './PortalDialog';
import { reconcileCredentialOperation, credentialBlocked, credentialProgress, credentialErrorKey, type CredentialKind, type CredentialOperation } from '../lib/psCredentialOperation';

import { CredentialProgress } from './CredentialProgress';
import { DeviceAdminSummary } from './DeviceAdminSummary';

// Operational facts and confirmed human credentials are kept separate by the server DTO.
type Props = { venueId: string; printServerId: string | null; adminScope?: boolean; caContent?: ReactNode };
type Result = { ok: boolean; text: string };

export function PrintServerDevicePanel({ venueId, printServerId, adminScope = false, caContent }: Props) {
  const { t, locale } = useLocale();
  const {session} = useAuth();
  const localPending = useRef(false);
  const inFlight = useRef<string | null>(null);
  const sheet = useQuery({ queryKey: ['ps-device', session?.user.id, venueId], queryFn: ({ signal }) => getDeviceSheet(venueId, signal),
    gcTime: 0, refetchOnMount: 'always', retry: false,
    refetchInterval: query => localPending.current || query.state.status === 'error' || query.state.data?.rotations.some(o => o.status === 'pending') ? 10_000 : 30_000 });
  // Reuse the existing read-only PE-428 context; a link is only offered when authorized and available.
  const legacy = useQuery({ queryKey: ['ps-legacy-context', session?.user.id, venueId], queryFn: ({ signal }) => getLegacyContext(venueId, signal),
    enabled: adminScope && sheet.data?.is_platform_admin === true && sheet.data?.device?.legacy === true, retry: false });
  const [visibility, setVisibility] = useState({ scope: '', ssid: false, psk: false, code: false });
  const [qr, setQr] = useState<{ url: string; ssid: string; psk: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [confirm, setConfirm] = useState<'renew' | null>(null);
  const [credentialDialog, setCredentialDialog] = useState<{ scope: string; kind: CredentialKind; phase: 'confirm' | 'progress' } | null>(null);
  const [credentialOperations, setCredentialOperations] = useState<Partial<Record<CredentialKind, CredentialOperation & { scope: string; credentialSnapshot?: string }>>>({});
  const [copyNotice, setCopyNotice] = useState<{ scope: string; ok: boolean; text: string } | null>(null);
  const [certPem, setCertPem] = useState(''); const [chainPem, setChainPem] = useState('');
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v && Number.isFinite(Date.parse(v)) ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const data = sheet.data;
  const accessError = sheet.isError ? psErrorKey(sheet.error) : null;
  const accessLost = accessError === 'accessDenied' || accessError === 'sessionExpired';
  const trackingUnavailable = sheet.isError && !accessLost;
  const operationScope = JSON.stringify([session?.user.id, venueId, printServerId, data?.device?.id, data?.credentialAccess, data?.can_manage_credentials, accessLost]);
  const scopeRef = useRef(operationScope);
  scopeRef.current = operationScope;
  const operationFor = (kind: CredentialKind) => {
    const entry = credentialOperations[kind];
    if (entry?.scope !== operationScope) return null;
    if (entry.phase === 'rejected' && entry.credentialSnapshot && entry.credentialSnapshot !== JSON.stringify([data?.appliedWifi, data?.appliedAdminCode])) return null;
    const latest = data && latestRotation(data.rotations, kind);
    if (['applied', 'failed'].includes(entry.phase) && latest && latest.command_id !== entry.commandId) return null;
    return data ? reconcileCredentialOperation(entry, data.rotations) : entry;
  };
  const activeDialog = credentialDialog?.scope === operationScope ? credentialDialog : null;
  useEffect(() => {
    setCredentialDialog(null);
    setCredentialOperations({});
    setCopyNotice(null);
  }, [operationScope]);
  localPending.current = (['wifi', 'admin_code'] as const).some(kind => credentialBlocked(operationFor(kind)));
  const uncertain = !sheet.isFetchedAfterMount || sheet.isError;
  const reconcileHref = adminScope && data?.is_platform_admin === true && !legacy.isError && legacy.data?.legacy
    && (!legacy.data.wifi_confirmed || !legacy.data.admin_code_confirmed) ? '#legacy-reconcile-title' : undefined;
  const focusReconciliation = () => requestAnimationFrame(() => {
    const target = document.getElementById('legacy-reconcile-title');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  });
  const absence = (kind: CredentialKind) => {
    if (!data?.credentialAccess) return null;
    if ((['wifi', 'admin_code'] as const).some(k => operationFor(k)?.errorKey === 'dev.error.no_device_credentials')) return 'dev.error.no_device_credentials';
    const local = operationFor(kind);
    if (local?.phase === 'rejected' && ['dev.error.no_device_credentials', 'dev.error.wifi_not_confirmed', 'dev.error.admin_code_not_confirmed'].includes(local.errorKey ?? '')) return local.errorKey;
    return !(kind === 'wifi' ? data.appliedWifi : data.appliedAdminCode) ? `dev.error.${kind === 'wifi' ? 'wifi' : 'admin_code'}_not_confirmed` : null;
  };
  const blocked = (kind: CredentialKind) => busy || uncertain || !!absence(kind) || credentialBlocked(operationFor(kind)) || !!data?.rotations.some(o => o.kind === kind && o.status === 'pending');
  const progressFor = (kind: CredentialKind) => credentialProgress(kind, data?.rotations ?? [], operationFor(kind), data?.ps_online ?? null, trackingUnavailable);
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
        if (updated.phase !== entry.phase || updated.errorKey !== entry.errorKey || updated.commandId !== entry.commandId || updated.requestedAt !== entry.requestedAt) { next[kind] = { ...updated, scope: operationScope }; changed = true; }
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
    if (!data?.can_manage_credentials || !data.device || blocked(kind) || inFlight.current === scope || scopeRef.current !== scope) return;
    inFlight.current = scope;
    const previousIds = data.rotations.filter(o => o.kind === kind).map(o => o.command_id);
    setCredentialDialog({ scope, kind, phase: 'progress' });
    setCredentialOperations(previous => ({ ...previous, [kind]: { scope, kind, commandId: null, phase: 'sending', previousIds } }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // A timeout only stops waiting; it must never retry the write.
      const response = await Promise.race([
        kind === 'wifi' ? rotateWifi(venueId) : rotateAdminCode(venueId),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('response_uncertain')), 20_000); }),
      ]);
      if (scopeRef.current !== scope) return;
      const commandId = response.ok === true && typeof response.command_id === 'string' && response.command_id.trim() ? response.command_id : null;
      setCredentialOperations(previous => ({ ...previous, [kind]: { scope, kind, commandId, phase: commandId ? 'pending' : 'uncertain', already: response.already === true, previousIds } }));
      localPending.current = true;
      void sheet.refetch();
    } catch (error) {
      if (scopeRef.current !== scope) return;
      const key = psErrorKey(error);
      // A backend ok:false is a rejection; transport/malformed responses leave acceptance unknown.
      const rejected = error instanceof PsError || key === 'accessDenied' || key === 'sessionExpired';
      setCredentialOperations(previous => ({ ...previous, [kind]: { scope, kind, commandId: null, phase: rejected ? 'rejected' : 'uncertain', errorKey: rejected ? key : 'dev.progress.trackingLost', previousIds, credentialSnapshot: JSON.stringify([data.appliedWifi, data.appliedAdminCode]) } }));
      if (!rejected) { localPending.current = true; void sheet.refetch(); }
    } finally {
      clearTimeout(timer);
      if (inFlight.current === scope) inFlight.current = null;
    }
  }

  async function run(fn: () => Promise<unknown>, okKey: string) {
    setBusy(true); setResult(null);
    try { await fn(); setResult({ ok: true, text: t(okKey) }); await sheet.refetch(); }
    catch (error) { const key = psErrorKey(error); setResult({ ok: false, text: t(key) === key ? t('dev.error.other') : t(key) }); }
    finally { setBusy(false); setConfirm(null); }
  }

  const help = <details className="dev-help" id="ps-recovery-help"><summary>{t('dev.help.title')}</summary><ol><li>{t('dev.help.identify')}</li><li>{t('dev.help.connect')}</li><li>{t('dev.help.recover')}</li><li>{t('dev.help.install')}</li><li>{t('dev.help.enroll')}</li><li>{t('dev.help.rotate')}</li><li>{t('dev.help.confirm')}</li></ol></details>;
  const label = <PrintServerLabel key={`${session?.user.id}:${venueId}`} userId={session?.user.id} venueId={venueId} sheet={data} accessLost={accessLost} pendingWifi={uncertain || credentialBlocked(operationFor('wifi')) || !!data?.rotations.some(o => o.kind === 'wifi' && o.status === 'pending')}/>;
  if (accessLost || (sheet.isError && !data)) return <><section className="detail-panel" data-testid="ps-device-panel"><div className="inline-empty">{t(accessLost ? accessError! : 'genericError')}</div>{label}{help}</section><section className="detail-panel ps-cert-panel" data-testid="ps-https-panel">{caContent}<p role="alert" className="ps-cert-small">{t(accessLost ? accessError! : 'genericError')}</p></section></>;
  if (!data) return <><section className="detail-panel" data-testid="ps-device-panel"><div className="inline-empty" role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</div>{label}{help}</section><section className="detail-panel ps-cert-panel" data-testid="ps-https-panel">{caContent}<p role="status" className="ps-cert-small">{t('dev.loading')}</p></section></>;
  const opLabel = (o: DeviceOp) => `${t(`dev.op.${o.kind}`)} · ${t(`dev.status.${o.status}`)}`;
  const errorText = (code: string | null) => { const key = credentialErrorKey(code); return t(key) === key ? t('dev.progress.rotationErrorUnknown') : t(key); };
  const rotationStatus = (kind: CredentialKind) => {
    const operation = progressFor(kind);
    return operation ? <CredentialProgress key={kind} operation={operation} onRetry={() => void sheet.refetch()} reconcileHref={reconcileHref} onReconcile={focusReconciliation}/> : null;
  };
  // PE-438: a PS enrolled with 0.3.21+ confirms by itself; conciliation is only for legacy units.
  const newEnroll = !!data.enroll && !data.device?.legacy && ['pending', 'applied', 'failed'].includes(data.enroll.state);
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
          {data.enroll && !data.device.legacy && data.enroll.state !== 'not_expected' && <div><dt>{t('dev.enroll.title')}</dt><dd data-testid="dev-enroll" data-state={data.enroll.state}><span className={`server-status ${data.enroll.state === 'applied' ? 'server-online' : data.enroll.state === 'failed' ? 'server-revoked' : 'server-pending'}`}><span className="badge-dot"/>{t(`dev.enroll.state.${data.enroll.state}`)}</span>{data.enroll.state === 'failed' && <small className="dev-enroll-parts">{(['wifi', 'admin_code'] as const).map(k => `${t(`dev.op.${k}`)}: ${t(`dev.enroll.part.${data.enroll![k]}`)}${data.enroll![k] === 'failed' && data.enroll![`${k}_error`] ? ` (${data.enroll![`${k}_error`]})` : ''}`).join(' · ')}</small>}</dd></div>}
          <div><dt>{t('dev.online')}</dt><dd data-testid="dev-online" data-online={String(data.ps_online)}>{t(data.ps_online === null ? 'notProvided' : data.ps_online ? 'dev.onlineYes' : 'dev.onlineNo')}{data.last_seen_at ? ` · ${t('dev.lastSeen').replace('{date}', date(data.last_seen_at))}` : ''}</dd></div>
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
              <button type="button" className="button button-secondary" data-testid="dev-rotate-wifi" disabled={blocked('wifi')} onClick={() => setCredentialDialog({ scope: operationScope, kind: 'wifi', phase: 'confirm' })}><RefreshCw size={15}/>{t('dev.rotateWifi')}</button>
              <button type="button" className="button button-secondary" data-testid="dev-rotate-code" disabled={blocked('admin_code')} onClick={() => setCredentialDialog({ scope: operationScope, kind: 'admin_code', phase: 'confirm' })}><KeyRound size={15}/>{t('dev.rotateCode')}</button>
            </div>}
            {(['wifi', 'admin_code'] as const).map(kind => absence(kind) && !progressFor(kind) && <p key={kind} className="dev-tracking-warning" data-testid={`dev-credentials-missing-${kind}`}><AlertTriangle size={16}/><span>{t(`dev.op.${kind}`)}: {newEnroll ? t(`dev.enroll.part.${data.enroll![kind]}`) : t(absence(kind)!)}. {newEnroll ? t(`dev.enroll.next.${data.enroll!.state}`) : <>{t('dev.progress.credentialsStep')} {reconcileHref && <a href={reconcileHref} onClick={focusReconciliation}>{t('dev.progress.reconcileLink')}</a>}</>}</span></p>)}
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

    {adminScope && data.is_platform_admin && data.device && <DeviceAdminSummary deviceId={data.device.id}/>}

    <section className="detail-panel ps-cert-panel" aria-labelledby="ps-cert-title" data-testid="ps-https-panel">
      {caContent}
      <div className="ps-cert-server"><h3 id="ps-https-title" className="ps-cert-subtitle">{t('dev.https.title')}</h3>
      <p className="owner-section-lead">{t('dev.https.lead')}</p>
      {data.cert.status === 'none' ? <div className="inline-empty" data-testid="https-none">{t('dev.https.none')}</div> : <dl className="dev-facts">
        <div><dt>{t('ps.hostname')}</dt><dd data-testid="https-hostname">{data.cert.hostname ?? t('notProvided')}</dd></div>
        <div><dt>{t('dev.https.validity')}</dt><dd data-testid="https-validity">{date(data.cert.not_before)} → {date(data.cert.not_after)} <span className={`server-status ${data.cert.status === 'valid' ? 'server-online' : 'server-revoked'}`}><span className="badge-dot"/>{t(`dev.https.${data.cert.status}`)}</span></dd></div>
        <div className="dev-wide"><dt>{t('dev.https.fingerprint')}</dt><dd className="ps-mono fw-hash" data-testid="https-fingerprint">{fp ?? t('notProvided')}</dd></div>
      </dl>}
      {data.cert_operations.length > 0 && <div className="dev-ops"><h3>{t('dev.https.operations')}</h3><ul data-testid="https-operations">{data.cert_operations.map(o => <li key={o.command_id} data-status={o.status} data-kind={o.kind}><span className={`server-status ${o.status === 'applied' ? 'server-online' : o.status === 'failed' ? 'server-revoked' : 'server-pending'}`}><span className="badge-dot"/>{opLabel(o)}</span><small>{date(o.requested_at)}{o.completed_at ? ` → ${date(o.completed_at)}` : ` · ${t('dev.waitingPs')}`}{o.error_code ? ` · ${errorText(o.error_code)}` : ''}</small></li>)}</ul></div>}
      {data.is_platform_admin && printServerId && <div className="dev-cert-admin">
        <button type="button" className="button button-secondary" data-testid="https-renew" disabled={busy || data.cert_operations.some(o => o.status === 'pending')} onClick={() => setConfirm('renew')}><RefreshCw size={15}/>{t('dev.https.renew')}</button>
        {(busy || data.cert_operations.some(o => o.status === 'pending')) && <p className="ps-cert-small" role="status">{t(busy ? 'ps.working' : 'dev.waitingPs')}</p>}
        <details className="dev-upload"><summary>{t('dev.https.uploadTitle')}</summary>
          <p className="ps-cert-small">{t('dev.https.uploadHint')}</p>
          <label className="field"><span>{t('dev.https.certPem')}</span><textarea rows={5} value={certPem} data-testid="https-cert-pem" onChange={e => setCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----"/></label>
          <label className="field"><span>{t('dev.https.chainPem')}</span><textarea rows={4} value={chainPem} data-testid="https-chain-pem" onChange={e => setChainPem(e.target.value)}/></label>
          <button type="button" className="button button-primary" data-testid="https-upload" disabled={busy || !certPem.trim()} onClick={() => void run(async () => { await uploadCert(printServerId, certPem, chainPem); setCertPem(''); setChainPem(''); }, 'dev.https.uploaded')}><Upload size={15}/>{t('dev.https.upload')}</button>
          {!certPem.trim() && <p className="ps-cert-small">{t('dev.https.certRequired')}</p>}
        </details>
      </div>}
      </div>
    </section>

    <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="dev-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>
    {busy && <p className="ps-action-progress" role="status"><span className="spinner" aria-hidden="true"/>{t('ps.working')}</p>}

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
        <button type="button" className="button button-primary" data-testid="dev-confirm-accept" disabled={blocked(activeDialog.kind)} onClick={() => void requestCredential(activeDialog.kind)}><Check size={15}/>{t('dev.confirm.accept')}</button>
      </> : <button type="button" className="button button-secondary" data-testid="dev-dialog-close" onClick={() => setCredentialDialog(null)}>{t('dev.confirm.close')}</button>}>
      {activeDialog.phase === 'confirm' ? <div id="dev-credential-dialog-description"><p>{t(`dev.confirm.${activeDialog.kind === 'wifi' ? 'wifi' : 'code'}`)}</p>{trackingUnavailable && <p className="dev-tracking-warning" role="status"><AlertTriangle size={16}/>{t('dev.trackingUnavailable')}</p>}</div>
        : <div id="dev-credential-dialog-description">{progressFor(activeDialog.kind) && <CredentialProgress compact operation={progressFor(activeDialog.kind)!} onRetry={() => void sheet.refetch()} reconcileHref={reconcileHref} onReconcile={focusReconciliation}/>}</div>}

    </PortalDialog>}
  </>;
}
