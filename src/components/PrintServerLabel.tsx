import { useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Printer, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { latestRotation, type DeviceSheet } from '../lib/psDevice';
import { getRecoveryLabel, type RecoveryLabelMissing } from '../lib/psRecoveryLabel';
import { generateLabelPng, labelFilename, labelFingerprint, printLabel } from '../lib/psLabel';
import { useLocale } from '../locales';

type Props = { venueId: string; userId?: string; sheet?: DeviceSheet; pendingWifi?: boolean; accessLost?: boolean; sheetUnavailable?: boolean };
type Action = 'preview' | 'download' | 'print';

// A preview is opt-in because its image contains the confirmed recovery password.
export function PrintServerLabel({ venueId, userId, sheet, pendingWifi = false, accessLost = false, sheetUnavailable = false }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const queryKey = ['ps-recovery-label', userId, venueId] as const;
  const labelQuery = useQuery({ queryKey, queryFn: ({ signal }) => getRecoveryLabel(venueId, signal), refetchInterval: query => pendingWifi || query.state.data?.wifiRotationPending || sheet?.enroll?.state === 'pending' ? 5_000 : false, gcTime: 0, enabled: !!userId && !!venueId });
  const [preview, setPreview] = useState<{ url: string; fingerprint: string; scope: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stale, setStale] = useState<{ fingerprint: string; updatedAt: number } | null>(null);
  const state = labelQuery.data;
  const wifiPending = pendingWifi || !!state?.wifiRotationPending;
  const data = state?.ready && state.label ? state.label : null;
  const fingerprint = data ? labelFingerprint(data) : null;
  // A sheet update or rotation hides a preview during render, before effects run.
  const scope = JSON.stringify([userId, venueId, sheet?.device?.id, sheet?.credentialAccess, sheet?.appliedWifi?.ssid, sheet?.appliedWifi?.psk, sheet?.appliedWifi?.applied_at, pendingWifi, accessLost, sheetUnavailable]);
  const sheetAllows = !!sheet?.credentialAccess && !!sheet.device && sheet.device.id === data?.deviceId
    && sheet.appliedWifi?.ssid === data?.ssid && sheet.appliedWifi?.psk === data?.password && sheet.appliedWifi?.applied_at === data?.appliedAt;
  const ready = !!data && !accessLost && !sheetUnavailable && sheetAllows && !wifiPending && !labelQuery.isError && !labelQuery.isPending && !stale;
  const latestWifi = sheet ? latestRotation(sheet.rotations, 'wifi') : null;
  const replacementReady = ready && latestWifi?.status === 'applied' && !!sheet?.appliedWifi
    && !!latestWifi.requested_at && Date.parse(sheet.appliedWifi.applied_at) >= Date.parse(latestWifi.requested_at);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const latest = useRef({ scope, fingerprint, ready });
  latest.current = { scope, fingerprint, ready };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; controller.current?.abort(); };
  }, []);

  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setPreview(null);
    setNotice(null);
    setStale(null);
    if (userId && venueId) void labelQuery.refetch();
  }, [userId, venueId, scope]);

  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setPreview(previous => previous?.fingerprint === fingerprint && !wifiPending && !labelQuery.isError && state?.ready ? previous : null);
  }, [fingerprint, wifiPending, labelQuery.isError, state?.ready]);

  useEffect(() => {
    setStale(previous => previous && labelQuery.dataUpdatedAt > previous.updatedAt ? null : previous);
  }, [labelQuery.dataUpdatedAt]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function act(kind: Action) {
    if (!ready || !data || !fingerprint) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const run = ++generation.current;
    const currentRun = () => mounted.current && generation.current === run && !abort.signal.aborted && latest.current.scope === scope && latest.current.fingerprint === fingerprint && latest.current.ready;
    setBusy(true);
    setNotice(null);
    try {
      // Read again for every action; an older preview is never an export source.
      const fresh = await getRecoveryLabel(venueId, abort.signal);
      if (!currentRun()) return;
      const current = fresh.ready && !fresh.wifiRotationPending ? fresh.label : null;
      if (!current || labelFingerprint(current) !== fingerprint) {
        setPreview(null);
        setStale({ fingerprint, updatedAt: labelQuery.dataUpdatedAt });
        setNotice(t('dev.label.reprint'));
        await queryClient.invalidateQueries({ queryKey });
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
        setPreview({ url, fingerprint, scope });
      }
    } catch {
      if (!currentRun()) return;
      setPreview(null);
      setStale({ fingerprint, updatedAt: labelQuery.dataUpdatedAt });
      setNotice(t('dev.label.unavailable'));
      await queryClient.invalidateQueries({ queryKey });
    } finally { if (mounted.current && generation.current === run) setBusy(false); if (controller.current === abort) controller.current = null; }
  }

  const reasons: string[] = [];
  if (labelQuery.isPending) reasons.push(t('dev.label.loading'));
  else if (labelQuery.isError) reasons.push(t('dev.label.readError'));
  else if (state) {
    const seen = new Set<RecoveryLabelMissing>(state.missing);
    if (!state.ready && !seen.size) seen.add('invalid_label');
    for (const missing of seen) reasons.push(t(`dev.label.missing.${missing}`));
  }
  if (accessLost) reasons.push(t('dev.label.missing.credentials_permission'));
  else if (sheetUnavailable) reasons.push(t('dev.label.readError'));
  if (wifiPending) reasons.push(t('dev.label.pending'));
  if (state?.ready && !sheetAllows) reasons.push(t(!sheet ? 'dev.label.loading' : sheet.credentialAccess === false ? 'dev.label.missing.credentials_permission' : 'dev.label.missing.device_not_assigned'));
  if (stale) reasons.push(t('dev.label.refreshing'));
  const visiblePreview = ready && preview?.fingerprint === fingerprint && preview.scope === scope ? preview : null;

  return <section className="dev-label" aria-labelledby="dev-label-title" data-testid="dev-label">
    <h3 id="dev-label-title">{t('dev.label.title')}</h3>
    <p className="ps-cert-small">{t('dev.label.lead')}</p>
    <p className="ps-cert-small">{t('dev.label.reprintHint')} {t('dev.label.printHint')}</p>
    {replacementReady && <div className="dev-label-replacement" role="status" data-testid="dev-label-replacement-ready">
      <p>{t('dev.label.replaceReady')}</p>
      <button type="button" className="button button-primary" data-testid="dev-label-print-replacement" disabled={busy} onClick={() => void act('print')}><Printer size={15}/>{t('dev.label.printReplace')}</button>
    </div>}
    <div className="staff-actions dev-label-actions">
      <button type="button" className="button button-secondary" data-testid="dev-label-preview-action" disabled={!ready || busy} onClick={() => void act('preview')}><Eye size={15}/>{t('dev.label.preview')}</button>
      <button type="button" className="button button-secondary" data-testid="dev-label-download" disabled={!ready || busy} onClick={() => void act('download')}><Download size={15}/>{t('dev.label.download')}</button>
      <button type="button" className="button button-secondary" data-testid="dev-label-print" disabled={!ready || busy} onClick={() => void act('print')}><Printer size={15}/>{t('dev.label.print')}</button>
    </div>
    {busy && <p className="ps-action-progress" role="status"><span className="spinner" aria-hidden="true"/>{t('ps.working')}</p>}
    {reasons.length > 0 && <div className="inline-empty" data-testid="dev-label-disabled" role="status"><p>{t('dev.label.blocked')}</p><ul>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul><a href="#ps-recovery-help" onClick={() => { const help = document.getElementById('ps-recovery-help') as HTMLDetailsElement | null; if (help) help.open = true; }}>{t('dev.help.link')}</a></div>}
    {visiblePreview && <figure className="dev-label-preview"><img src={visiblePreview.url} data-testid="dev-label-preview-image" alt={t('dev.label.previewAlt')} width={590} height={354}/><figcaption>{t('dev.label.printHint')}</figcaption><button type="button" className="button button-secondary" data-testid="dev-label-hide" onClick={() => setPreview(null)}><EyeOff size={15}/>{t('dev.label.hide')}</button></figure>}
    {notice && <p className="dev-label-notice" role="status"><RefreshCw size={16}/>{notice}</p>}
  </section>;
}
