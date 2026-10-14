import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAdminDeviceDetail, updateAdminDevice, adminDeviceErrorKey, type AdminDeviceDetail } from '../lib/psAdminDevice';
import { useLocale } from '../locales';
import { FirmwareUpdateAction } from './FirmwareUpdateAction';
import { InventoryDeviceIdentity } from './InventoryDeviceIdentity';

type Props = { deviceId: string; onChanged?: () => Promise<unknown>; showIdentity?: boolean };
type Confirmation = { editionId: string; version: string; installed: string; ring: string };
type Candidate = NonNullable<AdminDeviceDetail['update']['candidate']>;

export function DeviceAdminSummary({ deviceId, onChanged, showIdentity = false }: Props) {
  const { t } = useLocale();
  const { session } = useAuth();
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const detail = useQuery({ queryKey: ['ps-admin-device', session?.user.id, deviceId], queryFn: ({signal}) => getAdminDeviceDetail(deviceId, signal), enabled: !!session && !!deviceId, retry: false, refetchInterval: query => query.state.data?.update.active_update ? 10_000 : 30_000 });
  const update = detail.data?.update;
  const canUpdate = !!(update?.can_update && update.candidate?.edition_id && update.current_version && !update.active_update && !detail.isError && !detail.isFetching);
  const stillCurrent = !!(confirm && canUpdate && update?.candidate?.edition_id === confirm.editionId && update.candidate.version === confirm.version && update.current_version === confirm.installed && update.effective_ring === confirm.ring);
  const ringLabel = (ring: string | null) => ring ? t(`firmware.ring.${ring}`) : t('notProvided');
  const candidateReason = (candidate: Candidate) => {
    const key = `firmware.eligibility.${candidate.eligibility_reason}`;
    return t(key) === key ? t('firmware.eligibility.unknown') : t(key);
  };
  const blockedReason = (reason: string | null) => {
    if (!reason) return null;
    const key = `adminDevice.reason.${reason}`;
    return t(key) === key ? t('adminDevice.reason.not_authorized') : t(key);
  };

  async function review() {
    if (!canUpdate || !update?.candidate || !update.current_version || busy) return;
    setNotice('');
    const previous = { editionId: update.candidate.edition_id, version: update.candidate.version, installed: update.current_version, ring: update.effective_ring };
    const refreshed = await detail.refetch();
    const fresh = refreshed.data?.update;
    if (refreshed.isError || !fresh?.can_update || !fresh.candidate || !fresh.current_version || fresh.active_update || fresh.candidate.edition_id !== previous.editionId || fresh.candidate.version !== previous.version || fresh.current_version !== previous.installed || fresh.effective_ring !== previous.ring) {
      setConfirm(null); setNotice(t('adminDevice.updateChanged')); return;
    }
    setConfirm({ editionId: fresh.candidate.edition_id, version: fresh.candidate.version, installed: fresh.current_version, ring: fresh.effective_ring ?? '' });
  }

  async function submit() {
    if (!confirm || busy || !stillCurrent) return;
    setBusy(true); setNotice('');
    try {
      const refreshed = await detail.refetch();
      const fresh = refreshed.data?.update;
      if (refreshed.isError || !fresh?.can_update || !fresh.candidate || fresh.active_update || fresh.candidate.edition_id !== confirm.editionId || fresh.candidate.version !== confirm.version || fresh.current_version !== confirm.installed || fresh.effective_ring !== confirm.ring) {
        setConfirm(null); setNotice(t('adminDevice.updateChanged')); return;
      }
      await updateAdminDevice(deviceId, confirm.editionId, confirm.installed);
      setConfirm(null); setNotice(t('adminDevice.updateQueued'));
      await detail.refetch();
      await onChanged?.();
    } catch (error) { setNotice(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }

  return <section className="staff-panel admin-device-summary" aria-labelledby={`admin-device-${deviceId}`} data-testid="admin-device-summary">
    <div className="section-heading"><div><p className="eyebrow">{t('adminDevice.firmwareEyebrow')}</p><h3 id={`admin-device-${deviceId}`}>{t('adminDevice.firmwareTitle')}</h3></div><button type="button" className="button button-secondary" onClick={() => void detail.refetch()} disabled={detail.isFetching}><RefreshCw size={15} aria-hidden="true"/>{t('refresh')}</button></div>
    {detail.isPending ? <p className="firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</p> : detail.isError ? <p role="alert" className="form-error">{t(adminDeviceErrorKey(detail.error))}</p> : update ? <>
      {showIdentity && detail.data && <InventoryDeviceIdentity device={detail.data.device}/>}
      <div className="admin-device-firmware-grid">
        <div><small>{t('adminDevice.currentFirmware')}</small><strong>{update.current_version ?? t('dash.unknownVersion')}</strong></div>
        <div><small>{t('firmware.adminCandidate')}</small><strong>{update.candidate?.version ?? t('adminDevice.noStable')}</strong>{update.candidate && <small>{ringLabel(update.candidate.ring)} · {candidateReason(update.candidate)}</small>}</div>
      </div>
      <p className="ps-cert-small">{detail.data?.device.model} · {detail.data?.device.arch} · {t('firmware.effectiveRing')}: {ringLabel(update.effective_ring)}</p>
      {update.newest_signed && update.newest_signed.edition_id !== update.candidate?.edition_id && <div className="firmware-newest-signed" data-testid="admin-device-newest-signed">
        <span>{t('firmware.newestSigned')}</span><strong>{update.newest_signed.version} · {ringLabel(update.newest_signed.ring)}</strong>
        <p>{candidateReason(update.newest_signed)} · {update.newest_signed.admitted ? t('firmware.admitted') : t('firmware.notAdmitted')}</p>
      </div>}
      {canUpdate && <p role="status">{t('adminDevice.updateAvailable')}</p>}
      {update.active_update && <p className="owner-section-lead" role="status">{t('adminDevice.updateInProgress')}: {update.active_update.stage ?? update.active_update.status}{update.active_update.progress !== null ? ` · ${update.active_update.progress}%` : ''}</p>}
      <FirmwareUpdateAction testId="admin-device-update" disabled={!canUpdate || busy} onClick={() => void review()} reason={!canUpdate && !detail.isFetching && !update.active_update ? blockedReason(update.reason) : null} loading={busy}/>
    </> : null}
    {detail.isFetching && !detail.isPending && <p className="firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</p>}
    {notice && <p role="status" className="ps-result">{notice}</p>}
    {confirm && <div className="admin-device-confirm" role="group" aria-label={t('adminDevice.confirmUpdateTitle')}>
      <p>{t('adminDevice.confirmUpdate').replace('{version}', confirm.version).replace('{serial}', detail.data?.device.serial ?? '').replace('{installed}', confirm.installed)}</p>
      <p className="ps-cert-small">{t('firmware.effectiveRing')}: {ringLabel(confirm.ring)}</p>
      {!stillCurrent && <p role="status">{t('adminDevice.updateChanged')}</p>}
      <div className="staff-actions"><button type="button" className="button button-primary" disabled={busy || !stillCurrent} onClick={() => void submit()}>{t('adminDevice.update')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('staff.cancel')}</button></div>
    </div>}
  </section>;
}
