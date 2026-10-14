import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { assignDevice, revokeDevice, type InventoryDevice } from '../lib/psDevice';
import { adminDeviceErrorKey, getAdminDeviceManage, moveAdminDevice, type AdminVenueOption, type AdminDeviceManage } from '../lib/psAdminDevice';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';
import { PortalDialog } from './PortalDialog';
import { VenueCombobox } from './VenueCombobox';

type Code = { serial: string; venue: string; code: string; expires_at: string | null; replaces: boolean };
type Props = { device: InventoryDevice; onClose: () => void; onChanged: () => Promise<unknown>; onCode: (code: Code) => void; onResult: (result: { ok: boolean; text: string }) => void };
type Mode = 'manage' | 'assign' | 'unassign' | 'retire';

export function ManageDeviceDialog({ device, onClose, onChanged, onCode, onResult }: Props) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<AdminDeviceManage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('manage');
  const [typedSerial, setTypedSerial] = useState('');
  const [venue, setVenue] = useState<AdminVenueOption | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setDetail(null); setError(''); setMode('manage'); setTypedSerial('');
    void getAdminDeviceManage(device.id, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setDetail(value);
      setVenue(value.device.venue_id ? { id: value.device.venue_id, name: value.device.venue_name ?? value.device.venue_id, slug: '', city: null, state: null, is_active: true, assigned_device: null } : null);
    }).catch(err => { if (!controller.signal.aborted) setError(t(adminDeviceErrorKey(err))); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [device.id, t]);

  const currentId = detail?.device.venue_id ?? null;
  const currentVenue = detail?.device.venue_name ?? t('inv.unassigned');
  const action = currentId ? detail?.actions.move : detail?.actions.assign;
  const canAssign = !!venue && venue.id !== currentId && !!action?.allowed && !loading && !busy;
  const canUnassign = !!detail?.actions.unassign.allowed && !loading && !busy;
  const canRetire = !!detail?.actions.retire.allowed && !loading && !busy;
  const reason = (code: string | null | undefined) => {
    if (!code) return '';
    const key = `adminDevice.blocker.${code}`;
    if (t(key) !== key) return t(key);
    const errorKey = `adminDevice.error.${code}`;
    return t(errorKey) !== errorKey ? t(errorKey) : t('adminDevice.error.other');
  };
  function review(next: Mode) { setError(''); setTypedSerial(''); setMode(next); }
  async function assign() {
    if (!canAssign || !venue) return;
    setBusy(true); setError('');
    try {
      const output = currentId ? await moveAdminDevice(device.id, venue.id) : await assignDevice(device.id, venue.id);
      onCode({ serial: device.serial, venue: venue.name, ...output });
      onClose(); await onChanged();
    } catch (err) { setError(t(currentId ? adminDeviceErrorKey(err) : psErrorKey(err))); }
    finally { setBusy(false); }
  }
  async function revoke(retire: boolean) {
    if (retire ? !canRetire || typedSerial !== detail?.device.serial : !canUnassign) return;
    setBusy(true); setError('');
    try {
      await revokeDevice(device.id, retire);
      onResult({ ok: true, text: t(retire ? 'inv.retired' : 'inv.revoked').replace('{serial}', device.serial) });
      onClose(); await onChanged();
    } catch (err) { setError(t(psErrorKey(err))); }
    finally { setBusy(false); }
  }
  const title = mode === 'retire' ? t('inv.retireTitle').replace('{serial}', device.serial) : mode === 'unassign' ? t('inv.revoke') : mode === 'assign' ? t(currentId ? 'inv.reassign' : 'inv.assign') : t('inv.manage');
  return <PortalDialog title={title} titleId="admin-device-manage-title" testId="admin-device-manage-dialog" alert={mode === 'unassign' || mode === 'retire'} onClose={onClose} dismissible={!busy} actions={mode === 'manage' ? <>
    <button type="button" className="button button-primary" data-testid="inv-manage-assign" disabled={!canAssign} onClick={() => review('assign')}>{t(currentId ? 'inv.reassign' : 'inv.assign')}</button>
    <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>{t('staff.cancel')}</button>
  </> : <>
    <button type="button" className={`button button-primary ${mode !== 'assign' ? 'ps-danger-solid' : ''}`} data-testid={`inv-confirm-${mode}`} disabled={busy || loading || (mode === 'assign' ? !canAssign : mode === 'retire' ? !canRetire || typedSerial !== detail?.device.serial : !canUnassign)} onClick={() => void (mode === 'assign' ? assign() : revoke(mode === 'retire'))}>{t(mode === 'retire' ? 'inv.retire' : mode === 'unassign' ? 'inv.revoke' : currentId ? 'inv.reassign' : 'inv.assign')}</button>
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => review('manage')}>{t('adminDevice.back')}</button>
  </>}>
    {loading ? <p role="status">{t('dev.loading')}</p> : detail && <>
      {mode === 'manage' ? <>
        <dl className="inv-manage-summary"><div><dt>{t('dev.serial')}</dt><dd>{detail.device.serial}</dd></div><div><dt>{t('ps.hostname')}</dt><dd>{detail.device.hostname}</dd></div><div><dt>{t('fw.model')}</dt><dd>{device.model_label ?? detail.device.model}</dd></div><div><dt>{t('state')}</dt><dd>{t(`dev.deviceStatus.${detail.device.status}`)}</dd></div><div><dt>{t('inv.venue')}</dt><dd>{currentVenue}</dd></div></dl>
        <div className="field inv-manage-venue"><span>{t('inv.chooseVenue')}</span><VenueCombobox value={venue} onChange={setVenue} includeVenueId={currentId} disabled={busy || !action?.allowed} testId="inv-manage-venue"/></div>
        {action && !action.allowed && <p className="owner-section-lead">{reason(action.reason)}</p>}
        <div className="inv-manage-secondary">
          {(detail.actions.unassign.allowed || currentId) && <button type="button" className="button button-secondary ps-danger" disabled={!canUnassign} onClick={() => review('unassign')}>{t('inv.revoke')}</button>}
          {currentId && !detail.actions.unassign.allowed && <small>{reason(detail.actions.unassign.reason)}</small>}
          {(detail.actions.retire.allowed || detail.actions.retire.reason) && <button type="button" className="button button-secondary ps-danger" disabled={!canRetire} onClick={() => review('retire')}>{t('inv.retire')}</button>}
          {!detail.actions.retire.allowed && detail.actions.retire.reason && <small>{reason(detail.actions.retire.reason)}</small>}
        </div>
      </> : mode === 'assign' ? <p>{t(currentId ? 'inv.moveConfirm' : 'inv.assignConfirm').replaceAll('{serial}', device.serial).replaceAll('{from}', currentVenue).replaceAll('{venue}', venue?.name ?? '')}</p>
        : mode === 'unassign' ? <p>{t('inv.revokeConfirm').replace('{serial}', device.serial).replace('{venue}', currentVenue)}</p>
          : <><p>{t('inv.retireConfirm').replace('{serial}', device.serial).replace('{venue}', currentVenue)}</p><label className="field"><span>{t('adminDevice.typeSerial').replace('{serial}', device.serial)}</span><input autoComplete="off" value={typedSerial} onChange={e => setTypedSerial(e.target.value)}/></label></>}
    </>}
    {error && <p role="alert" className="form-error"><AlertTriangle size={16}/>{error}</p>}
  </PortalDialog>;
}
