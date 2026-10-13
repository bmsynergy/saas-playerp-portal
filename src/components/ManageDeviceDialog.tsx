import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { assignDevice, revokeDevice, type InventoryDevice } from '../lib/psDevice';
import { adminDeviceErrorKey, deleteAdminDevice, getAdminDeviceManage, moveAdminDevice, type AdminVenueOption, type AdminDeviceManage } from '../lib/psAdminDevice';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';
import { PortalDialog } from './PortalDialog';
import { VenueCombobox } from './VenueCombobox';

type Code = { serial: string; venue: string; code: string; expires_at: string | null; replaces: boolean };
type Props = { device: InventoryDevice; onClose: () => void; onChanged: () => Promise<unknown>; onCode: (code: Code) => void; onResult: (result: { ok: boolean; text: string }) => void };
export function ManageDeviceDialog({ device, onClose, onChanged, onCode, onResult }: Props) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<AdminDeviceManage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'manage' | 'unassign' | 'delete'>('manage');
  const [typedSerial, setTypedSerial] = useState('');
  const [venue, setVenue] = useState<AdminVenueOption | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setDetail(null); setError(''); setMode('manage'); setTypedSerial('');
    void getAdminDeviceManage(device.id, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setDetail(value);
      setVenue(value.device.venue_id ? {id:value.device.venue_id,name:value.device.venue_name ?? value.device.venue_id,slug:'',city:null,state:null,is_active:true,assigned_device:null} : null);
    }).catch(err => { if (!controller.signal.aborted) setError(t(adminDeviceErrorKey(err))); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [device.id, t]);
  const currentId = detail?.device.venue_id ?? null;
  const action = currentId ? detail?.actions.move : detail?.actions.assign;
  const canAssign = !!venue && venue.id !== currentId && !!action?.allowed && !loading && !busy;
  const reason = (code: string | null | undefined) => {
    if (!code) return '';
    const key = `adminDevice.blocker.${code}`;
    if (t(key) !== key) return t(key);
    const errorKey = `adminDevice.error.${code}`;
    return t(errorKey) !== errorKey ? t(errorKey) : t('adminDevice.error.other');
  };
  async function assign() {
    if (!canAssign || !venue) return;
    setBusy(true); setError('');
    try {
      const output = currentId ? await moveAdminDevice(device.id, venue.id) : await assignDevice(device.id, venue.id);
      onCode({ serial:device.serial, venue:venue.name, ...output });
      onClose(); await onChanged();
    } catch (err) { setError(t(currentId ? adminDeviceErrorKey(err) : psErrorKey(err))); }
    finally { setBusy(false); }
  }
  async function unassign() {
    if (!detail?.actions.unassign.allowed || busy) return;
    setBusy(true); setError('');
    try { await revokeDevice(device.id, false); onResult({ok:true,text:t('inv.revoked')}); onClose(); await onChanged(); }
    catch (err) { setError(t(psErrorKey(err))); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!detail?.actions.delete.allowed || typedSerial !== detail.device.serial || busy) return;
    setBusy(true); setError('');
    try { await deleteAdminDevice(device.id, typedSerial); onResult({ok:true,text:t('adminDevice.deleted').replace('{serial}',device.serial)}); onClose(); await onChanged(); }
    catch (err) { setError(t(adminDeviceErrorKey(err))); }
    finally { setBusy(false); }
  }
  const title = mode === 'delete' ? t('adminDevice.deleteTitle').replace('{serial}',device.serial) : mode === 'unassign' ? t('inv.revoke') : t('inv.manage');
  return <PortalDialog title={title} titleId="admin-device-manage-title" testId="admin-device-manage-dialog" alert={mode !== 'manage'} onClose={onClose} dismissible={!busy} actions={mode === 'manage' ? <>
    <button type="button" className="button button-primary" data-testid="inv-manage-assign" disabled={!canAssign} onClick={() => void assign()}>{t(currentId ? 'inv.reassign' : 'inv.assign')}</button>
    <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>{t('staff.cancel')}</button>
  </> : <>
    <button type="button" className="button button-primary ps-danger-solid" disabled={busy || loading || (mode === 'delete' ? !detail?.actions.delete.allowed || typedSerial !== device.serial : !detail?.actions.unassign.allowed)} onClick={() => void (mode === 'delete' ? remove() : unassign())}>{t(mode === 'delete' ? 'adminDevice.delete' : 'inv.revoke')}</button>
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setMode('manage'); setTypedSerial(''); setError(''); }}>{t('adminDevice.back')}</button>
  </>}>
    {loading ? <p role="status">{t('dev.loading')}</p> : detail && <>
      {mode === 'manage' ? <>
        <dl className="admin-device-review inv-manage-summary"><div><dt>{t('dev.serial')}</dt><dd>{detail.device.serial}</dd></div><div><dt>{t('ps.hostname')}</dt><dd>{detail.device.hostname}</dd></div><div><dt>{t('fw.model')}</dt><dd>{device.model_label ?? detail.device.model}</dd></div><div><dt>{t('state')}</dt><dd>{t(`dev.deviceStatus.${detail.device.status}`)}</dd></div><div><dt>{t('inv.venue')}</dt><dd>{detail.device.venue_name ?? t('inv.unassigned')}</dd></div></dl>
        <div className="field"><span>{t('inv.chooseVenue')}</span><VenueCombobox value={venue} onChange={setVenue} includeVenueId={currentId} disabled={busy || !action?.allowed} testId="inv-manage-venue"/></div>
        {action && !action.allowed && <p className="owner-section-lead">{reason(action.reason)}</p>}
        <div className="inv-manage-secondary">
          {(detail.actions.unassign.allowed || currentId) && <button type="button" className="button button-secondary ps-danger" disabled={busy || !detail.actions.unassign.allowed} onClick={() => { setError(''); setMode('unassign'); }}>{t('inv.revoke')}</button>}
          {currentId && !detail.actions.unassign.allowed && <small>{reason(detail.actions.unassign.reason)}</small>}
        </div>
        {detail.actions.delete.allowed && <section className="inv-manage-danger"><h3>{t('inv.dangerZone')}</h3><button type="button" className="button button-secondary ps-danger" disabled={busy} onClick={() => { setError(''); setMode('delete'); }}><Trash2 size={15}/>{t('inv.deletePrintServer')}</button></section>}
      </> : mode === 'unassign' ? <p>{t('inv.revokeConfirm').replace('{serial}',device.serial)}</p> : <><p>{t('adminDevice.deleteWarning')}</p><label className="field"><span>{t('adminDevice.typeSerial').replace('{serial}',device.serial)}</span><input autoComplete="off" value={typedSerial} onChange={e => setTypedSerial(e.target.value)}/></label></>}
    </>}
    {error && <p role="alert" className="form-error"><AlertTriangle size={16}/>{error}</p>}
  </PortalDialog>;
}
