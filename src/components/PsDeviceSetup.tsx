import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Wrench } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAccess } from '../hooks/usePortalData';
import { canManageRings } from '../lib/access';
import { errorCode } from '../lib/errors';
import { FirmwareError, getInstallKitDownload, listInstallKits, type InstallKit } from '../lib/firmware';
import { getAdminDeviceDetail } from '../lib/psAdminDevice';
import { setupSsid } from '../lib/psLink';
import type { ResolvedDevice } from '../lib/psResolvedDevice';
import { pickBootableImage, setupFileSize, setupProgress, shaCommand, type SetupStepKey } from '../lib/psSetup';
import { useLocale } from '../locales';

// PE-486: guided Setup from the generic bootable image (platform super_admin only, the edge enforces it again).
// Never shows the pse_ code: PsDevicePreparation issues and shows it once. Never changes the channel:
// the existing «Cambiar canal» action of the firmware block does.
const failure = (error: unknown) => error instanceof FirmwareError ? error.key : errorCode(error);

// Signed URL from kit_download; the browser downloads it through a transient <a download>.
export async function downloadBootableImage(kit: InstallKit): Promise<void> {
  const { url, filename } = await getInstallKitDownload(kit.id);
  const a = document.createElement('a');
  a.href = url; a.download = filename || kit.file_name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export function PsDeviceSetup({ device }: { device: ResolvedDevice }) {
  const { t, locale } = useLocale();
  const { session } = useAuth();
  const access = useAccess();
  const allowed = !!session && canManageRings(access.data);
  const deviceId = device.device_id, link = device.link;
  const kits = useQuery({ queryKey: ['ps-install-kits', session?.user.id], queryFn: listInstallKits, enabled: allowed, retry: false });
  const detail = useQuery({ queryKey: ['ps-admin-device', session?.user.id, deviceId], queryFn: ({signal}) => getAdminDeviceDetail(deviceId, signal), enabled: allowed && !!deviceId, retry: false });
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const kit = pickBootableImage(kits.data ?? []);
  const ring = detail.data?.update.ota.channel?.ring ?? null, effective = detail.data?.update.effective_ring ?? null;
  const online = device.runtime?.online === true;
  const progress = setupProgress({ preparation: link.preparation.state, prepared: link.prepared, online, ring });
  const missing = t('notProvided');
  const ringLabel = (r: string | null) => r ? t(`firmware.ring.${r}`) : missing;
  const date = (v: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(locale) : missing; };
  const lastSeen = link.reported.last_seen_at ?? device.runtime?.last_seen_at ?? null, firmware = link.reported.firmware_version ?? device.runtime?.firmware_version ?? null;
  const toPreparation = !link.prepared && <a className="staff-action-link" href="#ps469-preparation" data-testid="ps-setup-open-preparation">{t('psSetup.openPreparation')}</a>;
  async function download() {
    if (!kit || busy) return;
    setBusy(true); setDownloadError('');
    try { await downloadBootableImage(kit); } catch (error) { setDownloadError(t('psSetup.error.download').replace('{reason}', t(failure(error)))); } finally { setBusy(false); }
  }
  const errors = [
    progress.codeExpired && <li key="code" data-error="code_expired"><strong>{t('psSetup.error.codeExpired')}</strong> {t('psSetup.error.codeExpiredFix')} {toPreparation}</li>,
    kits.isError && <li key="kits" data-error="kit_list">{t('psSetup.error.kits').replace('{reason}', t(failure(kits.error)))}</li>,
    downloadError && <li key="download" data-error="download">{downloadError}</li>,
  ].filter(Boolean);
  const body: Record<SetupStepKey, ReactNode> = {
    download: <>
      <p className="ps-cert-small">{t('psSetup.step.download.body')}</p>
      {kits.isPending ? <p className="ps-cert-small" role="status">{t('psSetup.kit.loading')}</p> : !kit ? !kits.isError && <p className="ps-cert-small" data-testid="ps-setup-no-image">{t('psSetup.kit.none')}</p> : <>
        <dl className="fw-release-facts" data-testid="ps-setup-image"><div><dt>{t('psSetup.kit.file')}</dt><dd className="ps-mono">{kit.file_name}</dd></div><div><dt>{t('psSetup.kit.size')}</dt><dd>{setupFileSize(kit.bytes, missing)}</dd></div><div><dt>{t('psSetup.kit.release')}</dt><dd className="ps-mono">{kit.release_version ?? missing}</dd></div><div><dt>{t('psSetup.kit.profile')}</dt><dd>{kit.profile || missing}</dd></div><div><dt>{t('psSetup.kit.baseImage')}</dt><dd>{kit.base_image_name ?? missing}</dd></div><div><dt>SHA-256</dt><dd><code className="ps-mono fw-hash" data-testid="ps-setup-sha">{kit.sha256}</code></dd></div></dl>
        <p className="ps-cert-small">{t('psSetup.kit.verify')} <code className="ps-mono" data-testid="ps-setup-sha-command">{shaCommand(kit.file_name)}</code> {t('psSetup.kit.verifyHelp')}</p>
      </>}
      <div className="staff-actions"><button type="button" className="button button-primary" data-testid="ps-setup-download" disabled={!kit || busy} onClick={() => void download()}><Download size={15}/>{t(busy ? 'psSetup.downloading' : 'psSetup.download')}</button></div>
    </>,
    flash: <p className="ps-cert-small">{t('psSetup.step.flash.body')}</p>,
    boot: <p className="ps-cert-small">{t('psSetup.step.boot.body').replace('{ssid}', setupSsid(link.serial || device.serial))}</p>,
    prepare: <><p className="ps-cert-small">{t('psSetup.step.prepare.body')}</p>{toPreparation}</>,
    link: <p className="ps-cert-small">{t('psSetup.step.link.body')}</p>,
    online: <><p className="ps-cert-small">{t('psSetup.step.online.body')}</p>{(lastSeen || firmware) && <dl className="dev-facts">{lastSeen && <div><dt>{t('psSetup.lastSeen')}</dt><dd>{date(lastSeen)}</dd></div>}{firmware && <div><dt>{t('psSetup.firmware')}</dt><dd className="ps-mono">{firmware}</dd></div>}</dl>}</>,
    channel: <><p className="ps-cert-small">{t('psSetup.step.channel.body')}</p>
      {detail.isError ? <p className="ps-cert-small" role="status" data-testid="ps-setup-channel-error">{t('psSetup.channel.unavailable')}</p> : detail.isPending ? <p className="ps-cert-small" role="status">{t('psSetup.channel.loading')}</p> : <dl className="dev-facts" data-testid="ps-setup-channel"><div><dt>{t('psSetup.channel.ring')}</dt><dd>{ringLabel(ring)}</dd></div><div><dt>{t('psSetup.channel.effective')}</dt><dd>{ringLabel(effective)}</dd></div></dl>}
      <a className="staff-action-link" href={device.venue ? '#ps469-firmware' : '#ps-setup-firmware'}>{t('psSetup.openFirmware')}</a></>,
  };
  if (!allowed) return null;
  return <section className="detail-panel ps-setup" id="ps-setup" aria-labelledby="ps-setup-title" data-testid="ps-setup">
    <div className="section-heading"><div><p className="eyebrow">{t('psSetup.nav')}</p><h2 id="ps-setup-title">{t('psSetup.title')}</h2></div><span className="section-icon"><Wrench size={20}/></span></div>
    <p className="ps-cert-small">{t('psSetup.lead')}</p>
    <p data-testid="ps-setup-progress" role="status"><strong>{t('psSetup.progress').replace('{n}', String(progress.done)).replace('{total}', String(progress.total))}</strong></p>
    {errors.length > 0 && <div className="form-error" role="alert" data-testid="ps-setup-error"><AlertTriangle size={17}/><div><strong>{t('psSetup.error.title')}</strong><ul>{errors}</ul></div></div>}
    <ol className="ps-setup-steps">{progress.steps.map(step => <li key={step.key} data-testid={`ps-setup-step-${step.key}`} data-state={step.state}>
      <p><strong>{t(`psSetup.step.${step.key}.title`)}</strong> <span className={`server-status ${step.state === 'done' ? 'server-online' : step.state === 'error' ? 'server-revoked' : 'server-pending'}`}>{t(`psSetup.state.${step.state}`)}</span></p>
      {body[step.key]}
    </li>)}</ol>
    <div data-testid="ps-setup-troubleshooting"><h3>{t('psSetup.trouble.title')}</h3><ul className="ps-cert-small">{(['codeRejected', 'forbidden', 'sha', 'offline', 'api'] as const).map(k => <li key={k}>{t(`psSetup.trouble.${k}`)}</li>)}</ul></div>
    <div className="fw-notice" data-testid="ps-setup-limits"><AlertTriangle size={15}/><div><strong>{t('psSetup.limits.title')}</strong><p>{t('psSetup.limits.body')}</p><p>{t('psSetup.limits.manual')}</p></div></div>
  </section>;
}
