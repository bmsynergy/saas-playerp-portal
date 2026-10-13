import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Cpu, Plus, Send, Trash2, X } from 'lucide-react';
import { assignDevice, revokeDevice, type InventoryDevice } from '../lib/psDevice';
import { getDeviceModels, getAdminDeviceDetail, createAdminDevice, deleteAdminDevice, adminDeviceErrorKey, type DeviceModel, type AdminDeviceDetail } from '../lib/psAdminDevice';
import { psErrorKey } from '../lib/printServerApi';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { PrintServersTabs } from './PrintFirmwaresPage';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { matchesText, matchesUtcDay } from '../lib/adminLists';
import { PortalDialog } from '../components/PortalDialog';
import { DeviceAdminSummary } from '../components/DeviceAdminSummary';

type Props = { devices: InventoryDevice[]; venues: OwnerVenue[]; onChanged: () => Promise<unknown> };
type Result = { ok: boolean; text: string };
type Code = { serial: string; venue: string; code: string; expires_at: string | null; replaces: boolean };

export function PrintDevicesPage({ devices, venues, onChanged }: Props) {
  const { t, locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const version = params.get('version') ?? '';
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [code, setCode] = useState<Code | null>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [models, setModels] = useState<DeviceModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [form, setForm] = useState({ model: '', arch: '', label: '', venue_id: '' });
  const [review, setReview] = useState(false);
  const deleteRequest = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<InventoryDevice | null>(null);
  const [deleteDetail, setDeleteDetail] = useState<AdminDeviceDetail | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [typedSerial, setTypedSerial] = useState('');
  const [sheetDevice, setSheetDevice] = useState<InventoryDevice | null>(null);
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const sortedVenues = useMemo(() => [...venues].sort((a, b) => a.name.localeCompare(b.name)), [venues]);
  const { filters, set, clear } = useAdminListFilters();
  const [assignment, setAssignment] = useState('');
  const filtered = devices.filter(device => matchesText(filters.query, device.serial, device.hostname, device.model, device.label, device.venue_name, device.software_version) && (!filters.status || device.status === filters.status) && (!assignment || (assignment === 'assigned' ? !!device.venue_id : !device.venue_id)) && (!version || (version === '__unknown__' ? !device.software_version : device.software_version === version)) && matchesUtcDay(device.created_at, filters.from, filters.to));
  const pagination = usePrintListPagination(filtered.length);
  const model = models.find(m => m.model === form.model);

  useEffect(() => { pagination.reset(); }, [version]);

  async function run<T>(fn: () => Promise<T>, ok: (value: T) => string | null, admin = false) {
    setBusy(true); setResult(null);
    try { const value = await fn(); const text = ok(value); if (text) setResult({ ok: true, text }); }
    catch (error) { const key = admin ? adminDeviceErrorKey(error) : psErrorKey(error); setResult({ ok: false, text: t(key) === key ? t('dev.error.other') : t(key) }); }
    finally { setBusy(false); await onChanged(); }
  }
  async function openAdd() {
    setAdding(true); setReview(false); setModelsLoading(true); setModelsError(''); setForm({ model: '', arch: '', label: '', venue_id: '' });
    try { const items = await getDeviceModels(); setModels(items); if (items[0]) setForm(current => ({...current, model:items[0].model, arch:items[0].default_arch})); }
    catch (error) { setModelsError(t(adminDeviceErrorKey(error))); }
    finally { setModelsLoading(false); }
  }
  async function create() {
    if (!model || !model.archs.includes(form.arch)) return;
    setBusy(true); setModelsError('');
    try {
      const out = await createAdminDevice({model:form.model,arch:form.arch,label:form.label.trim(),venue_id:form.venue_id || null});
      setAdding(false); setReview(false);
      setResult({ok:true,text:t('inv.created').replace('{serial}',out.device.serial)});
      if (out.assignment) { setCode({serial:out.device.serial,venue:sortedVenues.find(v=>v.id===form.venue_id)?.name ?? form.venue_id,...out.assignment}); setCopied(false); }
      await onChanged();
    } catch (error) { setModelsError(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }
  async function openDelete(device: InventoryDevice) {
    const request = ++deleteRequest.current;
    setDeleteTarget(device); setDeleteDetail(null); setDeleteError(''); setTypedSerial(''); setDeleteLoading(true);
    try { const detail = await getAdminDeviceDetail(device.id); if (deleteRequest.current === request) setDeleteDetail(detail); }
    catch (error) { if (deleteRequest.current === request) setDeleteError(t(adminDeviceErrorKey(error))); }
    finally { if (deleteRequest.current === request) setDeleteLoading(false); }
  }
  async function confirmDelete() {
    if (!deleteTarget || !deleteDetail?.delete.allowed || typedSerial !== deleteTarget.serial) return;
    setBusy(true); setDeleteError('');
    try { await deleteAdminDevice(deleteTarget.id, typedSerial); setResult({ok:true,text:t('adminDevice.deleted').replace('{serial}',deleteTarget.serial)}); setDeleteTarget(null); await onChanged(); }
    catch (error) { setDeleteError(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }
  function clearVersion() { const next = new URLSearchParams(params); next.delete('version'); setParams(next); }

  return <div className="page-stack staff-page" data-testid="devices-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('inv.title')}</h1><p>{t('inv.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Cpu size={30}/></div></div>
    <PrintServersTabs/>
    <section className="servers-panel" aria-labelledby="inv-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('inv.eyebrow')}</p><h2 id="inv-list-title">{t('inv.listTitle')}</h2></div><button type="button" className="button button-primary" data-testid="inv-create" disabled={busy} onClick={() => void openAdd()}><Plus size={16}/>{t('inv.create')}</button></div>
      <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="inv-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>
      <div className="admin-list-toolbar"><AdminListFilters id="devices" filters={filters} set={(key, value) => { set(key, value); pagination.reset(); }} clear={() => { clear(); setAssignment(''); clearVersion(); pagination.reset(); }} statuses={[...new Set(devices.map(device => device.status))].sort().map(value => ({ value, label: t(`dev.deviceStatus.${value}`) }))} dateLabel={t('list.created')}/><label className="admin-assignment-filter"><span>{t('dash.filter.assignment')}</span><select value={assignment} onChange={event => { setAssignment(event.target.value); pagination.reset(); }} data-testid="devices-assignment"><option value="">{t('dash.filter.allVenues')}</option><option value="assigned">{t('dash.filter.assigned')}</option><option value="unassigned">{t('dash.filter.unassigned')}</option></select></label><label className="admin-assignment-filter"><span>{t('adminDevice.versionFilter')}</span><select value={version} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('version',event.target.value); else next.delete('version'); setParams(next); pagination.reset(); }} data-testid="devices-version"><option value="">{t('adminDevice.allVersions')}</option>{[...new Set(devices.map(d=>d.software_version).filter((v):v is string=>!!v))].sort().map(v=><option key={v} value={v}>{v}</option>)}<option value="__unknown__">{t('dash.unknownVersion')}</option>{version && version !== '__unknown__' && !devices.some(d=>d.software_version===version) && <option value={version}>{version}</option>}</select></label><span className="directory-count">{filtered.length} / {devices.length}</span></div>
      {filtered.length === 0 ? <div className="inline-empty">{devices.length ? t('list.noMatches') : t('inv.empty')}</div> : <div className="table-scroll"><table className="servers-table fw-table"><thead><tr><th scope="col">{t('dev.serial')}</th><th scope="col">{t('ps.hostname')}</th><th scope="col">{t('fw.model')}</th><th scope="col">{t('adminDevice.currentFirmware')}</th><th scope="col">{t('state')}</th><th scope="col">{t('inv.venue')}</th><th scope="col"><span className="sr-only">{t('staff.actions')}</span></th></tr></thead><tbody>
        {filtered.slice(pagination.start, pagination.end).map(d => <tr key={d.id} data-testid={`inv-row-${d.serial}`} data-status={d.status}>
          <td data-label={t('dev.serial')}><strong className="ps-mono">{d.serial}</strong><button type="button" className="staff-action-link inv-open-sheet" onClick={()=>setSheetDevice(d)}>{t('inv.openSheet')}</button></td>
          <td data-label={t('ps.hostname')}><span className="fw-cell">{d.hostname}</span></td>
          <td data-label={t('fw.model')}><span className="fw-cell">{d.model_label ?? d.model}{d.label && <small className="ps-sub">{d.label}</small>}</span></td>
          <td data-label={t('adminDevice.currentFirmware')}>{d.software_version ?? t('dash.unknownVersion')}</td>
          <td data-label={t('state')}><span className="fw-cell"><span>{t(`dev.deviceStatus.${d.status}`)}{d.legacy ? ` · ${t('dev.legacy')}` : ''}</span>{d.print_server_id && <small className="ps-sub">{d.online ? t('ps.state.online') : t('ps.state.offline')}</small>}</span></td>
          <td data-label={t('inv.venue')}>{d.venue_id ? <Link className="text-link" to={`/admin/print-servers/${encodeURIComponent(d.venue_id)}`}>{d.venue_name ?? d.venue_id}</Link> : t('inv.unassigned')}</td>
          <td data-label={t('staff.actions')}><div className="inv-actions">{!d.legacy && d.status !== 'retired' && <><select aria-label={t('inv.chooseVenue')} value={assignTo[d.id] ?? ''} disabled={busy} data-testid={`inv-venue-${d.serial}`} onChange={e => setAssignTo(s => ({ ...s, [d.id]: e.target.value }))}><option value="">{t('inv.chooseVenue')}</option>{sortedVenues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select><button type="button" className="button button-secondary" data-testid={`inv-assign-${d.serial}`} disabled={busy || !assignTo[d.id]} onClick={() => { const venueId = assignTo[d.id]; const venue = venues.find(v => v.id === venueId)?.name ?? venueId; void run(() => assignDevice(d.id, venueId), v => { setCode({ serial: d.serial, venue, ...v }); setCopied(false); return null; }); }}><Send size={15}/>{t(d.status === 'assigned' ? 'inv.reassign' : 'inv.assign')}</button>{d.status === 'assigned' && <button type="button" className="button button-secondary ps-danger" data-testid={`inv-revoke-${d.serial}`} disabled={busy} onClick={() => { if (window.confirm(t('inv.revokeConfirm').replace('{serial}', d.serial))) void run(() => revokeDevice(d.id, false), () => t('inv.revoked')); }}><X size={15}/>{t('inv.revoke')}</button>}</>}{!d.venue_id && !d.print_server_id && !d.legacy && <button type="button" className="button button-secondary ps-danger" data-testid={`inv-delete-${d.serial}`} disabled={busy} onClick={()=>void openDelete(d)}><Trash2 size={15}/>{t('adminDevice.delete')}</button>}</div></td>
        </tr>)}
      </tbody></table></div>}
      <PrintListPagination pagination={pagination} id="devices"/>
    </section>
    {code && <section className="staff-panel inv-code" role="alertdialog" aria-labelledby="inv-code-title" data-testid="inv-code"><div className="section-heading"><div><p className="eyebrow">{t('inv.codeEyebrow')}</p><h2 id="inv-code-title">{t('inv.codeTitle').replace('{serial}', code.serial).replace('{venue}', code.venue)}</h2></div></div><p className="owner-section-lead">{t(code.replaces ? 'inv.codeReplaces' : 'inv.codeHint')} {t('inv.codeExpires').replace('{time}', date(code.expires_at))} {t('inv.activationSeparate')}</p><p className="ps-mono fw-hash inv-code-value" data-testid="inv-code-value">{code.code}</p><div className="staff-actions"><button type="button" className="button button-secondary" onClick={() => { void navigator.clipboard.writeText(code.code).then(() => setCopied(true)).catch(() => setResult({ ok: false, text: t('dev.copyFailed') })); }}><Copy size={15}/>{t(copied ? 'inv.copied' : 'inv.copy')}</button><button type="button" className="button button-primary" data-testid="inv-code-close" onClick={() => setCode(null)}><Check size={15}/>{t('inv.codeDone')}</button></div></section>}
    {adding && <PortalDialog title={t('inv.create')} titleId="admin-device-add-title" testId="admin-device-add-dialog" onClose={()=>setAdding(false)} dismissible={!busy} actions={<><button type="button" className="button button-primary" disabled={busy || modelsLoading || !model || !model.archs.includes(form.arch)} onClick={()=>review?void create():setReview(true)}>{review?t('staff.confirm'):t('adminDevice.review')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>review?setReview(false):setAdding(false)}>{review?t('adminDevice.back'):t('staff.cancel')}</button></>}>
      {modelsLoading ? <p role="status">{t('dev.loading')}</p> : modelsError && !models.length ? <p role="alert" className="form-error">{modelsError}</p> : !review ? <div className="admin-device-form"><label className="field"><span>{t('fw.model')}</span><select value={form.model} onChange={e=>{const next=models.find(m=>m.model===e.target.value);setForm(f=>({...f,model:e.target.value,arch:next?.default_arch??''}));}}>{models.map(m=><option key={m.model} value={m.model}>{m.label}</option>)}</select></label><label className="field"><span>{t('fw.arch')}</span><select value={form.arch} onChange={e=>setForm(f=>({...f,arch:e.target.value}))}>{model?.archs.map(arch=><option key={arch} value={arch}>{arch}</option>)}</select></label><label className="field"><span>{t('adminDevice.label')}</span><input value={form.label} maxLength={80} onChange={e=>setForm(f=>({...f,label:e.target.value}))}/></label><label className="field"><span>{t('inv.venue')}</span><select value={form.venue_id} onChange={e=>setForm(f=>({...f,venue_id:e.target.value}))}><option value="">{t('inv.unassigned')}</option>{sortedVenues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><p className="owner-section-lead admin-device-wide">{t('adminDevice.generatedNote')}</p></div> : <div className="admin-device-review"><p>{t('adminDevice.reviewNote')}</p><dl><div><dt>{t('fw.model')}</dt><dd>{model?.label}</dd></div><div><dt>{t('fw.arch')}</dt><dd>{form.arch}</dd></div><div><dt>{t('adminDevice.label')}</dt><dd>{form.label||t('notProvided')}</dd></div><div><dt>{t('inv.venue')}</dt><dd>{sortedVenues.find(v=>v.id===form.venue_id)?.name??t('inv.unassigned')}</dd></div></dl><p>{t('adminDevice.generatedNote')}</p></div>}{modelsError && !!models.length && <p role="alert" className="form-error">{modelsError}</p>}
    </PortalDialog>}
    {deleteTarget && <PortalDialog title={t('adminDevice.deleteTitle').replace('{serial}',deleteTarget.serial)} titleId="admin-device-delete-title" testId="admin-device-delete-dialog" alert onClose={()=>{deleteRequest.current++;setDeleteTarget(null);}} dismissible={!busy} actions={<><button type="button" className="button button-primary ps-danger-solid" disabled={busy || deleteLoading || !deleteDetail?.delete.allowed || typedSerial!==deleteTarget.serial} onClick={()=>void confirmDelete()}>{t('adminDevice.delete')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>{deleteRequest.current++;setDeleteTarget(null);}}>{t('staff.cancel')}</button></>}><p>{t('adminDevice.deleteWarning')}</p>{deleteLoading ? <p role="status">{t('dev.loading')}</p> : deleteDetail && !deleteDetail.delete.allowed ? <div role="alert" className="form-error"><AlertTriangle size={17}/><span>{t('adminDevice.deleteBlocked')}: {deleteDetail.delete.blockers.map(b=>t(`adminDevice.blocker.${b}`)===`adminDevice.blocker.${b}`?b:t(`adminDevice.blocker.${b}`)).join(' · ')}</span></div> : deleteDetail && <label className="field"><span>{t('adminDevice.typeSerial').replace('{serial}',deleteTarget.serial)}</span><input autoComplete="off" value={typedSerial} onChange={e=>setTypedSerial(e.target.value)}/></label>}{deleteError && <p role="alert" className="form-error">{deleteError}</p>}</PortalDialog>}
    {sheetDevice && <PortalDialog title={sheetDevice.serial} titleId="admin-device-sheet-title" testId="admin-device-sheet-dialog" onClose={()=>setSheetDevice(null)} actions={<button type="button" className="button button-secondary" onClick={()=>setSheetDevice(null)}>{t('inv.codeDone')}</button>}><DeviceAdminSummary deviceId={sheetDevice.id} onChanged={onChanged}/>{sheetDevice.venue_id && <Link className="text-link" to={`/admin/print-servers/${encodeURIComponent(sheetDevice.venue_id)}`} onClick={()=>setSheetDevice(null)}>{t('inv.openSheet')}</Link>}</PortalDialog>}
  </div>;
}
