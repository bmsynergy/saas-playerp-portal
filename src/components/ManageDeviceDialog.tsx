import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { assignDevice, revokeDevice, type InventoryDevice } from '../lib/psDevice';
import { AdminDeviceError, deleteAdminDevice, adminDeviceErrorKey, getAdminDeviceManage, moveAdminDevice, type AdminVenueOption, type AdminDeviceManage } from '../lib/psAdminDevice';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';
import { PortalDialog } from './PortalDialog';
import { VenueCombobox } from './VenueCombobox';

type Code = { serial: string; venue: string; code: string; expires_at: string | null; replaces: boolean };
type Props = { device: InventoryDevice; onClose: () => void; onChanged: () => Promise<unknown>; onCode: (code: Code) => void; onResult: (result: { ok: boolean; text: string }) => void };
type Mode = 'manage' | 'assign' | 'unassign' | 'retire' | 'delete';

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
      const text = t(retire ? 'inv.retired' : 'inv.revoked').replace('{serial}', device.serial);
      onResult({ ok: true, text }); onClose();
      try { await onChanged(); } catch { onResult({ ok: false, text: `${text} ${t('fw.refreshFailed')}` }); }
    } catch (err) { setError(t(psErrorKey(err))); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!detail?.actions.delete.allowed || typedSerial !== detail.device.serial || busy) return;
    setBusy(true); setError('');
    try {
      await deleteAdminDevice(device.id, typedSerial);
      const text = t('adminDevice.deleted').replace('{serial}', device.serial);
      onResult({ ok: true, text }); onClose();
      try { await onChanged(); } catch { onResult({ ok: false, text: `${text} ${t('fw.refreshFailed')}` }); }
    } catch (err) {
      setError([t(adminDeviceErrorKey(err)), ...(err instanceof AdminDeviceError ? err.blockers.map(reason) : [])].join(' '));
      if (err instanceof AdminDeviceError && err.key === 'adminDevice.error.delete_blocked') {
        // A new operation may have appeared since opening the dialog. Close the
        // destructive gate immediately; refresh to explain the authoritative state.
        setTypedSerial(''); setMode('manage');
        setDetail(current => current ? { ...current, actions: { ...current.actions, delete: { allowed: false, reason: 'delete_blocked' } }, delete: { allowed: false, blockers: err.blockers } } : null);
        try { setDetail(await getAdminDeviceManage(device.id)); } catch { /* retain the closed gate and refusal */ }
      }
    }
    finally { setBusy(false); }
  }
  const title = mode === 'delete' ? t('adminDevice.deleteTitle').replace('{serial}', device.serial) : mode === 'retire' ? t('inv.retireTitle').replace('{serial}', device.serial) : mode === 'unassign' ? t('inv.revoke') : mode === 'assign' ? t(currentId ? 'inv.reassign' : 'inv.assign') : t('inv.manage');
  return <PortalDialog title={title} titleId="admin-device-manage-title" testId="admin-device-manage-dialog" alert={mode === 'unassign' || mode === 'retire' || mode === 'delete'} onClose={onClose} dismissible={!busy} actions={mode === 'manage' ? <>
    <button type="button" className="button button-primary" data-testid="inv-manage-assign" disabled={!canAssign} onClick={() => review('assign')}>{t(currentId ? 'inv.reassign' : 'inv.assign')}</button>
    <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>{t('staff.cancel')}</button>
  </> : <>
    <button type="button" className={`button button-primary ${mode !== 'assign' ? 'ps-danger-solid' : ''}`} data-testid={`inv-confirm-${mode}`} disabled={busy || loading || (mode === 'assign' ? !canAssign : mode === 'delete' ? !detail?.actions.delete.allowed || typedSerial !== detail?.device.serial : mode === 'retire' ? !canRetire || typedSerial !== detail?.device.serial : !canUnassign)} onClick={() => void (mode === 'delete' ? remove() : mode === 'assign' ? assign() : revoke(mode === 'retire'))}>{t(mode === 'delete' ? 'adminDevice.delete' : mode === 'retire' ? 'inv.retire' : mode === 'unassign' ? 'inv.revoke' : currentId ? 'inv.reassign' : 'inv.assign')}</button>
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
          {(detail.actions.retire.allowed || detail.actions.retire.reason) && <button type="button" className="button button-secondary ps-danger" data-testid="inv-manage-retire" disabled={!canRetire} onClick={() => review('retire')}>{t('inv.retire')}</button>}
          {!detail.actions.retire.allowed && detail.actions.retire.reason && <small>{reason(detail.actions.retire.reason)}</small>}
        </div>
        <p className="owner-section-lead">{t('adminDevice.retireBeforeDelete')}</p>
        {!detail.actions.delete.allowed && detail.delete.blockers.length > 0 && <ul className="owner-section-lead" data-testid="inv-delete-blockers">{detail.delete.blockers.map(code => <li key={code}>{reason(code)}</li>)}</ul>}
        {detail.actions.delete.allowed && <section className="inv-manage-danger"><h3>{t('inv.dangerZone')}</h3><button type="button" className="button button-secondary ps-danger" disabled={busy} data-testid="inv-manage-delete" onClick={() => { setError(''); setTypedSerial(''); setMode('delete'); }}><Trash2 size={15}/>{t('inv.deletePrintServer')}</button></section>}
      </> : mode === 'assign' ? <p>{t(currentId ? 'inv.moveConfirm' : 'inv.assignConfirm').replaceAll('{serial}', device.serial).replaceAll('{from}', currentVenue).replaceAll('{venue}', venue?.name ?? '')}</p>
        : mode === 'unassign' ? <p>{t('inv.revokeConfirm').replace('{serial}', device.serial).replace('{venue}', currentVenue)}</p>
          : <><p>{t(mode === 'delete' ? 'adminDevice.deleteWarning' : 'inv.retireConfirm').replace('{serial}', device.serial).replace('{venue}', currentVenue)}</p><label className="field"><span>{t('adminDevice.typeSerial').replace('{serial}', device.serial)}</span><input data-testid="inv-confirm-serial" autoComplete="off" spellCheck={false} value={typedSerial} onChange={e => setTypedSerial(e.target.value)}/></label></>}
    </>}
    {error && <p role="alert" className="form-error"><AlertTriangle size={16}/>{error}</p>}
  </PortalDialog>;
}
