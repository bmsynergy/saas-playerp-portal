import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, KeyRound, ShieldCheck, Wifi } from 'lucide-react';
import { getLegacyContext, LegacyError, caEvidenceStatus, needsLegacyReconciliation, reconcileLegacy, validAdminCode, validRecoveryWifi, type LegacyContext, type LegacyKind } from '../lib/psDevice';
import { psErrorKey } from '../lib/printServerApi';
import { formatFingerprint } from '../lib/certificate';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../locales';

// PE-428 — /admin only. Platform staff confirm, separately, the Wi-Fi and the administrative code a
// legacy Print Server already uses, after checking them physically on the device. Values typed here
// go straight to the RPC, are never logged or cached, and the inputs are cleared after each submit.
type Result = { ok: boolean; text: string };


export function PrintServerLegacyReconcile({ venueId }: { venueId: string }) {
  const { t, locale } = useLocale();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['ps-legacy-context', session?.user.id, venueId] as const;
  const context = useQuery({ queryKey, queryFn: ({ signal }) => getLegacyContext(venueId, signal), gcTime: 0, retry: false, enabled: !!session?.user.id });
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const errorKey = context.isError ? context.error instanceof LegacyError ? context.error.key : psErrorKey(context.error) : null;
  // Not platform staff: the backend answers 42501; this block simply does not exist for them.
  if (errorKey === 'accessDenied' || errorKey === 'legacy.error.forbidden') return null;
  const ctx = context.data;
  if (ctx && !needsLegacyReconciliation(ctx)) return null;

  return <section id="legacy-reconcile" tabIndex={-1} className="detail-panel legacy-reconcile" aria-labelledby="legacy-reconcile-title" data-testid="legacy-reconcile">
    <div className="section-heading"><div><p className="eyebrow">{t('legacy.eyebrow')}</p><h2 id="legacy-reconcile-title" tabIndex={-1}>{t('legacy.title')}</h2></div><span className="section-icon"><ShieldCheck size={20}/></span></div>
    <p className="owner-section-lead">{t('legacy.lead')}</p>
    {context.isPending ? <div className="inline-empty">{t('dev.loading')}</div>
      : !ctx ? <div className="inline-empty" data-testid="legacy-context-error">{tr(t, errorKey ?? 'genericError')}</div>
      : <>
        <dl className="dev-facts" data-testid="legacy-identity">
          <div><dt>{t('dev.serial')}</dt><dd className="ps-mono" data-testid="legacy-serial">{ctx.serial ?? t('notProvided')}</dd></div>
          <div><dt>{t('ps.hostname')}</dt><dd className="ps-mono" data-testid="legacy-hostname">{ctx.hostname ?? t('notProvided')}</dd></div>
          <div><dt>{t('legacy.psActive')}</dt><dd data-testid="legacy-ps-status">{ctx.print_server_status === 'active' ? t('legacy.yes') : `${t('legacy.no')}${ctx.print_server_status ? ` (${ctx.print_server_status})` : ''}`}</dd></div>
          <div><dt>{t('fw.version')}</dt><dd data-testid="legacy-firmware">{ctx.software_version ?? t('notProvided')}</dd></div>
          <div><dt>{t('dev.online')}</dt><dd data-testid="legacy-online" data-online={String(ctx.ps_online)}>{t(ctx.ps_online ? 'dev.onlineYes' : 'dev.onlineNo')}{ctx.last_seen_at ? ` · ${t('dev.lastSeen').replace('{date}', date(ctx.last_seen_at))}` : ''}</dd></div>
          <div><dt>{t('legacy.legacyDevice')}</dt><dd data-testid="legacy-flag">{t(ctx.legacy ? 'legacy.yes' : 'legacy.no')}</dd></div>
          <div className="dev-wide"><dt>{t('legacy.caFingerprint')}</dt><dd className="ps-mono fw-hash" data-testid="legacy-ca-fingerprint">{ctx.ca_cert_der_sha256 ? formatFingerprint(ctx.ca_cert_der_sha256) ?? ctx.ca_cert_der_sha256 : t('notProvided')}</dd></div>
        </dl>
        {!ctx.legacy && <p className="dev-tracking-warning" role="status"><AlertTriangle size={16}/><span>{t('legacy.error.not_legacy')}</span></p>}
        <div className="legacy-forms">
          <ReconcileForm kind="wifi" ctx={ctx} date={date} onDone={() => { void queryClient.invalidateQueries({ queryKey }); void queryClient.invalidateQueries({ queryKey: ['ps-device'] }); void queryClient.invalidateQueries({ queryKey: ['ps-recovery-label'] }); }}/>
          <ReconcileForm kind="admin_code" ctx={ctx} date={date} onDone={() => { void queryClient.invalidateQueries({ queryKey }); void queryClient.invalidateQueries({ queryKey: ['ps-device'] }); }}/>
        </div>
      </>}
  </section>;
}

function tr(t: (key: string) => string, key: string) { const text = t(key); return text === key ? t('legacy.error.other') : text; }

function ReconcileForm({ kind, ctx, date, onDone }: { kind: LegacyKind; ctx: LegacyContext; date: (v: string | null) => string; onDone: () => void }) {
  const { t } = useLocale();
  const [ssid, setSsid] = useState(''); const [psk, setPsk] = useState(''); const [code, setCode] = useState('');
  const [fingerprint, setFingerprint] = useState(''); const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result | null>(null);
  const confirmed = kind === 'wifi' ? ctx.wifi_confirmed : ctx.admin_code_confirmed;
  const appliedAt = kind === 'wifi' ? ctx.wifi_applied_at : ctx.admin_code_applied_at;
  const evidenceStatus = caEvidenceStatus(fingerprint, ctx.ca_cert_der_sha256);
  const fingerprintOk = evidenceStatus === 'valid';
  const valueOk = kind === 'wifi' ? validRecoveryWifi(ssid, psk) : validAdminCode(code);
  const identityOk = !!ctx.venue_id && !!ctx.device_id && !!ctx.serial && !!ctx.print_server_id && !!ctx.ca_cert_der_sha256 && ctx.legacy && ctx.print_server_status === 'active';
  const disabled = confirmed || !identityOk;
  const id = `legacy-${kind}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || busy || !fingerprintOk || !valueOk || !checked) return;
    const values = kind === 'wifi' ? { ssid, psk } : { admin_code: code };
    setBusy(true); setResult(null);
    // Inputs are cleared right away; the value only lives in this request.
    setSsid(''); setPsk(''); setCode(''); setChecked(false); setFingerprint('');
    try {
      await reconcileLegacy(ctx, kind, values, checked, fingerprint);
      setResult({ ok: true, text: t(`legacy.${kind}.done`) });
      onDone();
    } catch (error) {
      const key = error instanceof LegacyError ? error.key : psErrorKey(error);
      setResult({ ok: false, text: tr(t, key) });
      if (key === 'legacy.error.already_confirmed') onDone();
    } finally { setBusy(false); }
  }

  return <form className="legacy-form" onSubmit={e => void submit(e)} data-testid={`${id}-form`} aria-labelledby={`${id}-title`} autoComplete="off">
    <h3 id={`${id}-title`}>{kind === 'wifi' ? <Wifi size={16}/> : <KeyRound size={16}/>}{t(`legacy.${kind}.title`)}</h3>
    {confirmed ? <p className="dev-operation-notice dev-operation-applied" data-testid={`${id}-confirmed`}><Check size={16}/><span>{t('legacy.alreadyConfirmed').replace('{date}', date(appliedAt))}</span></p>
      : <p className="ps-cert-small">{t(`legacy.${kind}.lead`)}</p>}
    {!confirmed && <fieldset disabled={disabled || busy}>
      {kind === 'wifi' ? <>
        <label className="field"><span>{t('dev.ssid')}</span><input type="text" value={ssid} onChange={e => setSsid(e.target.value)} data-testid={`${id}-ssid`} autoComplete="off" spellCheck={false} maxLength={32}/></label>
        <label className="field"><span>{t('legacy.wifi.psk')}</span><input type="password" value={psk} onChange={e => setPsk(e.target.value.trim())} data-testid={`${id}-psk`} autoComplete="new-password" inputMode="numeric" maxLength={10}/></label>
      </> : <label className="field"><span>{t('dev.adminCode')}</span><input type="password" value={code} onChange={e => setCode(e.target.value)} data-testid={`${id}-code`} autoComplete="new-password" maxLength={64}/></label>}
      <label className="field"><span>{t('legacy.fingerprintPrompt')}</span><input type="text" value={fingerprint} onChange={e => setFingerprint(e.target.value)} data-testid={`${id}-fingerprint`} className="ps-mono" autoComplete="off" spellCheck={false} maxLength={200} placeholder="ab12cd34ef56" aria-describedby={`${id}-fingerprint-help`}/></label>
      <p id={`${id}-fingerprint-help`} className="ps-cert-small">{t('legacy.fingerprintHelp')}</p>
      {fingerprint && !fingerprintOk && <p className="ps-cert-small legacy-mismatch" role="alert" data-testid={`${id}-fingerprint-${evidenceStatus}`}>{t(evidenceStatus === 'mismatch' ? 'legacy.fingerprintMismatch' : evidenceStatus === 'format' ? 'legacy.fingerprintFormat' : 'legacy.error.device_not_linked')}</p>}
      {(kind === 'wifi' ? ssid || psk : code) && !valueOk && <p className="ps-cert-small" data-testid={`${id}-invalid`}>{t(`legacy.${kind}.invalid`)}</p>}
      <label className="legacy-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} data-testid={`${id}-check`}/><span>{t(`legacy.${kind}.check`)}</span></label>
      <button type="submit" className="button button-primary" data-testid={`${id}-submit`} disabled={disabled || busy || !fingerprintOk || !valueOk || !checked}><Check size={15}/>{t(`legacy.${kind}.submit`)}</button>
    </fieldset>}
    {!confirmed && !busy && <p className="ps-cert-small">{t(!identityOk ? 'legacy.error.device_not_linked' : 'legacy.requirements')}</p>}
    {busy && <p role="status">{t('legacy.sending')}</p>}
    {result && <p className={`dev-operation-notice ${result.ok ? 'dev-operation-applied' : 'dev-operation-failed'}`} role="status" aria-live="polite" data-testid={`${id}-result`} data-ok={String(result.ok)}>{result.ok ? <Check size={16}/> : <AlertTriangle size={16}/>}<span>{result.text}</span></p>}
  </form>;
}
