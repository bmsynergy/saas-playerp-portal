import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAdminDeviceDetail, updateAdminDevice, adminDeviceErrorKey } from '../lib/psAdminDevice';
import { useLocale } from '../locales';

type Props = { deviceId: string; onChanged?: () => Promise<unknown> };

export function DeviceAdminSummary({ deviceId, onChanged }: Props) {
  const { t } = useLocale();
  const { session } = useAuth();
  const [confirm, setConfirm] = useState<{editionId:string;version:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const detail = useQuery({ queryKey: ['ps-admin-device', session?.user.id, deviceId], queryFn: ({signal}) => getAdminDeviceDetail(deviceId, signal), enabled: !!session && !!deviceId, retry: false, refetchInterval: query => query.state.data?.update.active_update ? 10_000 : 30_000 });
  const update = detail.data?.update;
  const canUpdate = !!update?.latest_stable && update.update_available && !update.active_update && !detail.isError && !detail.isFetching;
  const stillCurrent = !!confirm && canUpdate && update?.latest_stable?.edition_id === confirm.editionId && update.latest_stable.version === confirm.version;

  async function submit() {
    if (!update?.latest_stable || !stillCurrent || busy) return;
    setBusy(true); setNotice('');
    try {
      await updateAdminDevice(deviceId, update.latest_stable.edition_id);
      setConfirm(null); setNotice(t('adminDevice.updateQueued'));
      await detail.refetch();
      await onChanged?.();
    } catch (error) { setNotice(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }

  return <section className="staff-panel admin-device-summary" aria-labelledby={`admin-device-${deviceId}`} data-testid="admin-device-summary">
    <div className="section-heading"><div><p className="eyebrow">{t('adminDevice.firmwareEyebrow')}</p><h3 id={`admin-device-${deviceId}`}>{t('adminDevice.firmwareTitle')}</h3></div><button type="button" className="button button-secondary" onClick={() => void detail.refetch()} disabled={detail.isFetching}><RefreshCw size={15}/>{t('refresh')}</button></div>
    {detail.isPending ? <p role="status">{t('dev.loading')}</p> : detail.isError ? <p role="alert" className="form-error">{t(adminDeviceErrorKey(detail.error))}</p> : update ? <>
      <div className="admin-device-firmware-grid"><div><small>{t('adminDevice.currentFirmware')}</small><strong>{update.current_version ?? t('dash.unknownVersion')}</strong></div><div><small>{t('adminDevice.latestStable')}</small><strong>{update.latest_stable?.version ?? t('adminDevice.noStable')}</strong></div></div>
      {canUpdate && <p role="status">{t('adminDevice.updateAvailable')}</p>}
      {update.active_update && <p className="owner-section-lead" role="status">{t('adminDevice.updateInProgress')}: {update.active_update.stage ?? update.active_update.status}{update.active_update.progress !== null ? ` · ${update.active_update.progress}%` : ''}</p>}
      {!update.latest_stable && <p className="owner-section-lead">{t('adminDevice.noStableDetail')}</p>}
      {update.reason && !canUpdate && !update.active_update && <p className="owner-section-lead">{t(`adminDevice.reason.${update.reason}`) === `adminDevice.reason.${update.reason}` ? update.reason : t(`adminDevice.reason.${update.reason}`)}</p>}
      <button type="button" className="button button-primary" data-testid="admin-device-update" disabled={!canUpdate || busy} onClick={() => setConfirm({editionId:update!.latest_stable!.edition_id,version:update!.latest_stable!.version})}><RefreshCw size={15}/>{t('adminDevice.update')}</button>
    </> : null}
    {notice && <p role="status" className="ps-result">{notice}</p>}
    {confirm && <div className="admin-device-confirm" role="group" aria-label={t('adminDevice.confirmUpdateTitle')}>
      <p>{t('adminDevice.confirmUpdate').replace('{version}', confirm.version).replace('{serial}', detail.data?.device.serial ?? '')}</p>
      {!stillCurrent && <p role="status">{t('adminDevice.updateChanged')}</p>}
      <div className="staff-actions"><button type="button" className="button button-primary" disabled={busy || !stillCurrent} onClick={() => void submit()}>{t('adminDevice.update')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('staff.cancel')}</button></div>
    </div>}
  </section>;
}
