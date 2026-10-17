import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getAdminDeviceDetail, updateAdminDevice, setAdminDeviceChannel, validateAdminDevice, adminDeviceErrorKey, type AdminDeviceDetail } from '../lib/psAdminDevice';
import { defaultEditionId, firmwareHeadline, updateReasonKey } from '../lib/psOtaDevice';
import type { FirmwareRing } from '../lib/firmwareEligibility';
import { CanaryValidationBlock, ChannelBlock, ChannelDialog, EditionPicker, GeneralRequirementsBlock, ValidateDialog } from './DeviceOtaBlocks';
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
  const detail = useQuery({ queryKey: ['ps-admin-device', session?.user.id, deviceId], queryFn: ({signal}) => getAdminDeviceDetail(deviceId, signal), enabled: !!session && !!deviceId, retry: false, refetchInterval: query => query.state.data?.update.active_update || query.state.data?.update.ota.canary?.status === 'in_progress' ? 10_000 : 30_000 });
  const update = detail.data?.update;
  const ota = update?.ota;
  const editions = ota?.editions ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'channel' | 'validate' | null>(null);
  const [dialogError, setDialogError] = useState('');
  // PE-473: with the editions contract staff choose any selectable edition; without it, the candidate as before.
  const selected = editions ? editions.find(e => e.edition_id === (picked ?? defaultEditionId(editions)) && e.selectable) ?? null : null;
  const target = editions ? (selected ? { edition_id: selected.edition_id, version: selected.version } : null) : update?.candidate ? { edition_id: update.candidate.edition_id, version: update.candidate.version } : null;
  const canUpdate = !!(target && update?.current_version && !update.active_update && !detail.isError && !detail.isFetching && (editions ? !!selected : update.can_update));
  const stillCurrent = !!(confirm && canUpdate && target?.edition_id === confirm.editionId && target.version === confirm.version && update?.current_version === confirm.installed && update.effective_ring === confirm.ring);
  const headline = update ? firmwareHeadline(update.current_version, ota?.canary ?? null, update.reason) : null;
  const serial = detail.data?.device.serial ?? '';
  const ringLabel = (ring: string | null) => ring ? t(`firmware.ring.${ring}`) : t('notProvided');
  const candidateReason = (candidate: Candidate) => {
    const key = `firmware.eligibility.${candidate.eligibility_reason}`;
    return t(key) === key ? t('firmware.eligibility.unknown') : t(key);
  };
  const blockedReason = (reason: string | null) => {
    const key = updateReasonKey(reason, ota?.canary ?? null);
    if (!key) return null;
    return t(key) === key ? t('adminDevice.reason.not_authorized') : t(key);
  };
  const pickTarget = (u: AdminDeviceDetail['update'] | undefined) => {
    if (!u) return null;
    if (u.ota.editions) { const e = u.ota.editions.find(x => x.edition_id === confirmTargetId() && x.selectable); return e ? { edition_id: e.edition_id, version: e.version } : null; }
    return u.can_update && u.candidate ? { edition_id: u.candidate.edition_id, version: u.candidate.version } : null;
  };
  const confirmTargetId = () => confirm?.editionId ?? target?.edition_id ?? null;
  const openChannel = () => { setDialogError(''); setNotice(''); setDialog('channel'); };
  const openValidate = () => { setDialogError(''); setNotice(''); setDialog('validate'); };

  async function changeChannel(ring: FirmwareRing, groupId: string | null) {
    const channel = ota?.channel;
    if (!channel || busy) return;
    setBusy(true); setDialogError('');
    try {
      const refreshed = await detail.refetch();
      const fresh = refreshed.data?.update.ota.channel;
      if (refreshed.isError || !fresh?.can_change || fresh.ring !== channel.ring) { setDialogError(t('adminDevice.error.channel_changed')); return; }
      const result = await setAdminDeviceChannel(deviceId, ring, groupId, channel.ring);
      setDialog(null); setNotice(t(result.changed ? 'otaDevice.channel.changed' : 'otaDevice.channel.unchanged'));
      await detail.refetch();
      await onChanged?.();
    } catch (error) { setDialogError(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }

  async function validate() {
    const canary = ota?.canary, installed = update?.current_version;
    if (!canary?.edition || !installed || busy) return;
    setBusy(true); setDialogError('');
    try {
      const refreshed = await detail.refetch();
      const fresh = refreshed.data?.update;
      if (refreshed.isError || !fresh?.ota.canary?.can_validate || fresh.ota.canary.edition?.edition_id !== canary.edition.edition_id || fresh.current_version !== installed) { setDialogError(t('adminDevice.updateChanged')); return; }
      await validateAdminDevice(deviceId, canary.edition.edition_id, installed);
      setDialog(null); setNotice(t('otaDevice.canary.requested'));
      await detail.refetch();
    } catch (error) { setDialogError(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }

  async function review() {
    if (!canUpdate || !target || !update?.current_version || busy) return;
    setNotice('');
    const previous = { editionId: target.edition_id, version: target.version, installed: update.current_version, ring: update.effective_ring };
    const refreshed = await detail.refetch();
    const fresh = refreshed.data?.update;
    const freshTarget = pickTarget(fresh);
    if (refreshed.isError || !fresh || !freshTarget || !fresh.current_version || fresh.active_update || freshTarget.edition_id !== previous.editionId || freshTarget.version !== previous.version || fresh.current_version !== previous.installed || fresh.effective_ring !== previous.ring) {
      setConfirm(null); setNotice(t('adminDevice.updateChanged')); return;
    }
    setConfirm({ editionId: freshTarget.edition_id, version: freshTarget.version, installed: fresh.current_version, ring: fresh.effective_ring ?? '' });
  }

  async function submit() {
    if (!confirm || busy || !stillCurrent) return;
    setBusy(true); setNotice('');
    try {
      const refreshed = await detail.refetch();
      const fresh = refreshed.data?.update;
      const freshTarget = pickTarget(fresh);
      if (refreshed.isError || !fresh || !freshTarget || fresh.active_update || freshTarget.edition_id !== confirm.editionId || freshTarget.version !== confirm.version || fresh.current_version !== confirm.installed || fresh.effective_ring !== confirm.ring) {
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
      {headline && <p role="status" data-testid="admin-device-headline"><strong>{t(headline.key).replace('{version}', headline.version ?? '')}</strong></p>}
      {update.newest_signed && update.newest_signed.edition_id !== update.candidate?.edition_id && <div className="firmware-newest-signed" data-testid="admin-device-newest-signed">
        <span>{t('firmware.newestSigned')}</span><strong>{update.newest_signed.version} · {ringLabel(update.newest_signed.ring)}</strong>
        <p>{candidateReason(update.newest_signed)} · {update.newest_signed.admitted ? t('firmware.admitted') : t('firmware.notAdmitted')}</p>
      </div>}
      {canUpdate && <p role="status">{t('adminDevice.updateAvailable')}</p>}
      {update.active_update && <p className="owner-section-lead" role="status">{t('adminDevice.updateInProgress')}: {update.active_update.stage ?? update.active_update.status}{update.active_update.progress !== null ? ` · ${update.active_update.progress}%` : ''}</p>}
      {editions && <EditionPicker editions={editions} value={selected?.edition_id ?? null} onChange={id => { setPicked(id); setConfirm(null); }} disabled={busy || !!update.active_update}/>}
      <FirmwareUpdateAction testId="admin-device-update" disabled={!canUpdate || busy} onClick={() => void review()} reason={!canUpdate && !detail.isFetching && !update.active_update ? (editions && !selected ? t(update.reason === 'up_to_date' && ota?.canary && ['pending', 'in_progress', 'failed'].includes(ota.canary.status) ? 'otaDevice.reason.up_to_date_unvalidated' : 'otaDevice.edition.noneSelectable') : blockedReason(update.reason)) : null} loading={busy}/>
      {ota?.channel && <ChannelBlock deviceId={deviceId} channel={ota.channel} onChange={openChannel}/>}
      {ota?.canary && <CanaryValidationBlock deviceId={deviceId} canary={ota.canary} busy={busy} onValidate={openValidate} onChangeChannel={ota.channel?.can_change ? openChannel : null}/>}
      {ota?.general && <GeneralRequirementsBlock deviceId={deviceId} general={ota.general} onChangeChannel={openChannel} canChangeChannel={!!ota.channel?.can_change}/>}
    </> : null}
    {detail.isFetching && !detail.isPending && <p className="firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('dev.loading')}</p>}
    {notice && <p role="status" className="ps-result">{notice}</p>}
    {confirm && <div className="admin-device-confirm" role="group" aria-label={t('adminDevice.confirmUpdateTitle')}>
      <p>{t('adminDevice.confirmUpdate').replace('{version}', confirm.version).replace('{serial}', detail.data?.device.serial ?? '').replace('{installed}', confirm.installed)}</p>
      <p className="ps-cert-small">{t('firmware.effectiveRing')}: {ringLabel(confirm.ring)}</p>
      {!stillCurrent && <p role="status">{t('adminDevice.updateChanged')}</p>}
      <div className="staff-actions"><button type="button" className="button button-primary" disabled={busy || !stillCurrent} onClick={() => void submit()}>{t('adminDevice.update')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('staff.cancel')}</button></div>
    </div>}
    {dialog === 'channel' && ota?.channel && <ChannelDialog channel={ota.channel} serial={serial} busy={busy} error={dialogError} onCancel={() => setDialog(null)} onConfirm={(ring, group) => void changeChannel(ring, group)}/>}
    {dialog === 'validate' && ota?.canary?.edition && update?.current_version && <ValidateDialog canary={ota.canary} serial={serial} installed={update.current_version} busy={busy} error={dialogError} onCancel={() => setDialog(null)} onConfirm={() => void validate()}/>}
  </section>;
}
