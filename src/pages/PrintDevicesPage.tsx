import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Cpu, ExternalLink, Plus, Settings2 } from 'lucide-react';
import { type InventoryDevice } from '../lib/psDevice';
import { getDeviceModelCatalog, createAdminDevice, adminDeviceErrorKey, type DeviceModel, type AdminVenueOption } from '../lib/psAdminDevice';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { PrintServersTabs } from './PrintFirmwaresPage';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { matchesText, matchesUtcDay } from '../lib/adminLists';
import { PortalDialog } from '../components/PortalDialog';
import { adminSheetHref } from '../lib/psVenueDevices';
import { VenueCombobox } from '../components/VenueCombobox';
import { ManageDeviceDialog } from '../components/ManageDeviceDialog';
import { PsLinkStateBadge } from '../components/PsLinkStateBadge';
import { PS_LINK_STATES, psLinkStateKey, reportedOr, type PsLinkState } from '../lib/psLink';

type Props = { devices: InventoryDevice[]; venues: OwnerVenue[]; onChanged: () => Promise<unknown> };
type Result = { ok: boolean; text: string };
type Code = { serial: string; venue: string; code: string; expires_at: string | null; replaces: boolean };

export function PrintDevicesPage({ devices, onChanged }: Props) {
  const { t, locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const version = params.get('version') ?? '';
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  const [models, setModels] = useState<DeviceModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [form, setForm] = useState({ model: '', arch: '', label: '' });
  const [venue, setVenue] = useState<AdminVenueOption | null>(null);
  const [review, setReview] = useState(false);
  const [manageDevice, setManageDevice] = useState<InventoryDevice | null>(null);
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const { filters, set, clear } = useAdminListFilters();
  const [assignment, setAssignment] = useState('');
  // PE-462: the link (when sent) is the authority for state and venue; older backends keep status.
  const stateOf = (device: InventoryDevice) => device.link?.state ?? device.status;
  const stateLabel = (value: string) => (PS_LINK_STATES as readonly string[]).includes(value) ? t(psLinkStateKey(value as PsLinkState)) : t(`dev.deviceStatus.${value}`);
  const venueOf = (device: InventoryDevice) => device.link ? device.link.venue_id : device.venue_id;
  const filtered = devices.filter(device => matchesText(filters.query, device.serial, device.hostname, device.model, device.label, device.venue_name, device.software_version, device.link?.display_name, device.link?.venue_name, device.link?.reported.hostname) && (!filters.status || stateOf(device) === filters.status) && (!assignment || (assignment === 'assigned' ? !!venueOf(device) : !venueOf(device))) && (!version || (version === '__unknown__' ? !device.software_version : device.software_version === version)) && matchesUtcDay(device.created_at, filters.from, filters.to));
  const pagination = usePrintListPagination(filtered.length);
  const model = models.find(m => m.model === form.model);
  useEffect(() => { pagination.reset(); }, [version]);
  useEffect(() => () => catalogRequest.current?.abort(), []);
  function closeAdd() { catalogRequest.current?.abort(); catalogRequest.current = null; setAdding(false); }

  async function openAdd() {
    catalogRequest.current?.abort();
    const controller = new AbortController();
    catalogRequest.current = controller;
    setAdding(true); setReview(false); setModelsLoading(true); setModelsError(''); setVenue(null); setModels([]); setForm({ model: '', arch: '', label: '' });
    try {
      const catalog = await getDeviceModelCatalog(controller.signal);
      if (catalogRequest.current !== controller || controller.signal.aborted) return;
      setModels(catalog.models);
      const preferred = catalog.default;
      if (preferred && catalog.models.some(item => item.model === preferred.model && item.active && item.archs.includes(preferred.arch))) {
        setForm(current => ({ ...current, model: preferred.model, arch: preferred.arch }));
      }
    } catch (error) { if (catalogRequest.current === controller && !controller.signal.aborted) setModelsError(t(adminDeviceErrorKey(error))); }
    finally { if (catalogRequest.current === controller && !controller.signal.aborted) setModelsLoading(false); }
  }
  async function create() {
    if (busy || !model?.active || !model.archs.includes(form.arch)) return;
    setBusy(true); setModelsError('');
    try {
      const out = await createAdminDevice({ model: form.model, arch: form.arch, label: form.label.trim(), venue_id: venue?.id ?? null });
      closeAdd(); setReview(false);
      setResult({ ok: true, text: t('inv.created').replace('{serial}', out.device.serial) });
      if (out.assignment) { setCode({ serial: out.device.serial, venue: venue?.name ?? '', ...out.assignment }); setCopied(false); }
      try { await onChanged(); } catch { setResult({ ok: false, text: `${t('inv.created').replace('{serial}', out.device.serial)} ${t('fw.refreshFailed')}` }); }
    } catch (error) { setModelsError(t(adminDeviceErrorKey(error))); }
    finally { setBusy(false); }
  }
  function clearVersion() { const next = new URLSearchParams(params); next.delete('version'); setParams(next); }
  const hasFilters = !!(filters.query || filters.status || filters.from || filters.to || assignment || version);
  const extraFilters = <>
    <label><span>{t('inv.assignedFilter')}</span><select value={assignment} onChange={event => { setAssignment(event.target.value); pagination.reset(); }} data-testid="devices-assignment"><option value="">{t('dash.filter.allVenues')}</option><option value="assigned">{t('dash.filter.assigned')}</option><option value="unassigned">{t('dash.filter.unassigned')}</option></select></label>
    <label><span>{t('adminDevice.versionFilter')}</span><select value={version} onChange={event => { const next = new URLSearchParams(params); if (event.target.value) next.set('version', event.target.value); else next.delete('version'); setParams(next); pagination.reset(); }} data-testid="devices-version"><option value="">{t('adminDevice.allVersions')}</option>{[...new Set(devices.map(d => d.software_version).filter((v): v is string => !!v))].sort().map(v => <option key={v} value={v}>{v}</option>)}<option value="__unknown__">{t('dash.unknownVersion')}</option>{version && version !== '__unknown__' && !devices.some(d => d.software_version === version) && <option value={version}>{version}</option>}</select></label>
  </>;

  return <div className="page-stack staff-page" data-testid="devices-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('inv.title')}</h1><p>{t('inv.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Cpu size={30}/></div></div>
    <PrintServersTabs/>
    <section className="servers-panel" aria-labelledby="inv-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('inv.eyebrow')}</p><h2 id="inv-list-title">{t('inv.listTitle')}</h2></div><button type="button" className="button button-primary" data-testid="inv-create" disabled={busy} onClick={() => void openAdd()}><Plus size={16}/>{t('inv.create')}</button></div>
      <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="inv-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>
      <div className="inv-filter-bar"><AdminListFilters id="devices" filters={filters} set={(key, value) => { set(key, value); pagination.reset(); }} clear={() => { clear(); setAssignment(''); clearVersion(); pagination.reset(); }} clearDisabled={!hasFilters} statuses={[...new Set(devices.map(stateOf))].sort().map(value => ({ value, label: stateLabel(value) }))} afterStatus={extraFilters} dateLabel={t('list.created')} fromLabel={t('inv.createdFrom')} toLabel={t('inv.createdThrough')}/><span className="directory-count">{filtered.length} / {devices.length}</span></div>
      {filtered.length === 0 ? <div className="inline-empty">{devices.length ? t('list.noMatches') : t('inv.empty')}</div> : <div className="table-scroll"><table className="servers-table fw-table inv-inventory-table"><thead><tr><th scope="col">{t('dev.serial')}</th><th scope="col">{t('ps.hostname')}</th><th scope="col">{t('fw.model')}</th><th scope="col">{t('adminDevice.currentFirmware')}</th><th scope="col">{t('state')}</th><th scope="col">{t('inv.venue')}</th><th scope="col"><span className="sr-only">{t('staff.actions')}</span></th></tr></thead><tbody>
        {filtered.slice(pagination.start, pagination.end).map(d => { const l = d.link; const venueId = l ? l.venue_id : d.venue_id; const venueName = l ? l.venue_name : d.venue_name; return <tr key={d.id} data-testid={`inv-row-${d.serial}`} data-status={d.status} data-link-state={l?.state}>
          <td data-label={t('dev.serial')}><strong className="ps-mono">{l?.serial || d.serial}</strong></td>
          <td data-label={t('ps.hostname')}><span className="fw-cell">{l ? reportedOr(l.reported.hostname, t('psLink.pending')) : d.hostname}</span></td>
          <td data-label={t('fw.model')}><span className="fw-cell">{l ? l.model_label ?? (l.model || d.model) : d.model_label ?? d.model}{(l ? l.label : d.label) && <small className="ps-sub">{l ? l.label : d.label}</small>}</span></td>
          <td data-label={t('adminDevice.currentFirmware')}>{l ? reportedOr(l.reported.firmware_version, t('psLink.pending')) : d.software_version ?? t('dash.unknownVersion')}</td>
          <td data-label={t('state')}><span className="fw-cell">{l ? <span><PsLinkStateBadge state={l.state}/>{l.legacy ? ` · ${t('dev.legacy')}` : ''}</span> : <span>{t(`dev.deviceStatus.${d.status}`)}{d.legacy ? ` · ${t('dev.legacy')}` : ''}</span>}{d.print_server_id && <small className="ps-sub">{d.online ? t('ps.state.online') : t('ps.state.offline')}</small>}{l && <small className="ps-sub">{t('psLink.lastSeen')}: {l.reported.last_seen_at ? date(l.reported.last_seen_at) : t('psLink.pending')}</small>}</span></td>
          <td data-label={t('inv.venue')}>{venueId ? <Link className="text-link" to={`/admin/tenants/${encodeURIComponent(venueId)}/print-servers`}>{venueName ?? venueId}</Link> : t('inv.unassigned')}</td>
          <td data-label={t('staff.actions')}><div className="inv-actions"><Link className="button button-secondary" data-testid={`inv-open-${d.serial}`} to={adminSheetHref(d.print_server_id ?? d.id)}><ExternalLink size={15}/>{t('inv.openSheet')}</Link><button type="button" className="button button-secondary" data-testid={`inv-manage-${d.serial}`} onClick={() => setManageDevice(d)}><Settings2 size={15}/>{t('inv.manage')}</button></div></td>
        </tr>; })}
      </tbody></table></div>}
      <PrintListPagination pagination={pagination} id="devices"/>
    </section>
    {code && <section className="staff-panel inv-code" role="alertdialog" aria-labelledby="inv-code-title" data-testid="inv-code"><div className="section-heading"><div><p className="eyebrow">{t('inv.codeEyebrow')}</p><h2 id="inv-code-title">{t('inv.codeTitle').replace('{serial}', code.serial).replace('{venue}', code.venue)}</h2></div></div><p className="owner-section-lead">{t(code.replaces ? 'inv.codeReplaces' : 'inv.codeHint')} {t('inv.codeExpires').replace('{time}', date(code.expires_at))} {t('inv.activationSeparate')}</p><p className="ps-mono fw-hash inv-code-value" data-testid="inv-code-value">{code.code}</p><div className="staff-actions"><button type="button" className="button button-secondary" onClick={() => { void navigator.clipboard.writeText(code.code).then(() => setCopied(true)).catch(() => setResult({ ok: false, text: t('dev.copyFailed') })); }}><Copy size={15}/>{t(copied ? 'inv.copied' : 'inv.copy')}</button><button type="button" className="button button-primary" data-testid="inv-code-close" onClick={() => setCode(null)}><Check size={15}/>{t('inv.codeDone')}</button></div></section>}
    {adding && <PortalDialog title={t('inv.create')} titleId="admin-device-add-title" testId="admin-device-add-dialog" onClose={closeAdd} dismissible={!busy} actions={<><button type="button" className="button button-primary" disabled={busy || modelsLoading || !model?.active || !model.archs.includes(form.arch)} onClick={() => review ? void create() : setReview(true)}>{review ? t('staff.confirm') : t('adminDevice.review')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => review ? setReview(false) : closeAdd()}>{review ? t('adminDevice.back') : t('staff.cancel')}</button></>}>
      {modelsLoading ? <p role="status">{t('dev.loading')}</p> : modelsError && !models.length ? <p role="alert" className="form-error">{modelsError}</p> : !review ? <div className="admin-device-form"><label className="field"><span>{t('fw.model')}</span><select value={form.model} onChange={e => { const next = models.find(m => m.model === e.target.value); setForm(f => ({ ...f, model: e.target.value, arch: next?.default_arch ?? '' })); }}><option value="">{t('adminDevice.chooseModel')}</option>{models.filter(m => m.active).map(m => <option key={m.model} value={m.model}>{m.label}</option>)}</select></label><label className="field"><span>{t('fw.arch')}</span><select value={form.arch} onChange={e => setForm(f => ({ ...f, arch: e.target.value }))} disabled={!model}><option value="">{t('adminDevice.chooseArch')}</option>{model?.archs.map(arch => <option key={arch} value={arch}>{arch}</option>)}</select></label><label className="field"><span>{t('adminDevice.label')}</span><input value={form.label} maxLength={80} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}/></label><div className="field"><span>{t('inv.venue')}</span><VenueCombobox value={venue} onChange={setVenue} testId="inv-add-venue"/></div><p className="owner-section-lead admin-device-wide">{t('adminDevice.generatedNote')}</p></div> : <div className="admin-device-review"><p>{t('adminDevice.reviewNote')}</p><dl><div><dt>{t('fw.model')}</dt><dd>{model?.label}</dd></div><div><dt>{t('fw.arch')}</dt><dd>{form.arch}</dd></div><div><dt>{t('adminDevice.label')}</dt><dd>{form.label || t('notProvided')}</dd></div><div><dt>{t('inv.venue')}</dt><dd>{venue?.name ?? t('inv.unassigned')}</dd></div></dl><p>{t('adminDevice.generatedNote')}</p></div>}{modelsError && !!models.length && <p role="alert" className="form-error">{modelsError}</p>}
    </PortalDialog>}
    {manageDevice && <ManageDeviceDialog device={manageDevice} onClose={() => setManageDevice(null)} onChanged={onChanged} onResult={setResult}/>}
  </div>;
}
