import { useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AlertTriangle, Check, Cpu, Download, FileArchive, LayoutDashboard, List, RefreshCw, Rocket, Trash2, Upload } from 'lucide-react';
import { FirmwareError, deleteFirmware, firmwareDownloadUrl, sha256OfFile, uploadFirmware, type FirmwareList, type FirmwareRelease } from '../lib/firmware';
import { errorCode } from '../lib/errors';
import { useLocale } from '../locales';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { matchesText, matchesUtcDay } from '../lib/adminLists';
import { summarizeInventory, type Inventory } from '../lib/printInventory';
import { PortalDialog } from '../components/PortalDialog';

// Global Print Server sections. Only platform Admins reach them (the route gate and every RPC).
export function PrintServersTabs() {
  const { t } = useLocale();
  const items = [
    { to: '/admin/print-servers', label: t('fw.tab.dashboard'), icon: <LayoutDashboard size={16}/>, testId: 'ps-tab-dashboard' },
    { to: '/admin/print-servers/list', label: t('fw.tab.list'), icon: <List size={16}/>, testId: 'ps-tab-list' },
    { to: '/admin/print-servers/inventory', label: t('inv.tab'), icon: <Cpu size={16}/>, testId: 'ps-tab-inventory' },
    { to: '/admin/print-servers/firmwares', label: t('fw.tab.firmwares'), icon: <FileArchive size={16}/>, testId: 'ps-tab-firmwares' },
    { to: '/admin/print-servers/updates', label: t('ota.tab'), icon: <Rocket size={16}/>, testId: 'ps-tab-updates' },
  ];
  return <nav className="detail-tabs ps-global-tabs" aria-label={t('secondaryNavigation')}>
    {items.map(item => <NavLink key={item.to} end to={item.to} data-testid={item.testId} className={({ isActive }) => `detail-tab ${isActive ? 'active' : ''}`}>{item.icon}{item.label}</NavLink>)}
  </nav>;
}

const MODELS = [{ value: 'rpi4-2gb', label: 'Raspberry Pi 4 2GB' }];
const ARCHS = ['arm64', 'armhf'];
type Result = { ok: boolean; text: string; release?: FirmwareRelease; localSha?: string };

export function PrintFirmwaresPage({ data, inventory, refreshing, onRefresh }: { data: FirmwareList; inventory: Inventory; refreshing: boolean; onRefresh: () => Promise<unknown> }) {
  const { t, locale } = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [form, setForm] = useState({ version: '', revision: '', model: 'rpi4-2gb', arch: 'arm64', notes: '' });
  const [stage, setStage] = useState<'idle' | 'hash' | 'upload' | 'verify'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FirmwareRelease | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteNotice, setDeleteNotice] = useState<{text:string;warning:boolean}|null>(null);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const sizeFormatter = useMemo(() => new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', { maximumFractionDigits: 1 }), [locale]);
  const size = (bytes: number | null) => bytes === null ? t('notProvided') : bytes >= 1048576 ? `${sizeFormatter.format(bytes / 1048576)} MB` : `${sizeFormatter.format(bytes / 1024)} KB`;
  const busy = stage !== 'idle';
  const releaseFilters = useAdminListFilters();
  const distribution = useMemo(() => summarizeInventory(inventory.items), [inventory.items]);
  const readyVersions = useMemo(() => new Set(data.releases.filter(item => item.status === 'ready').map(item => item.version)), [data.releases]);
  const selectedItems = inventory.items.filter(item => selectedVersion === null || (item.firmware_known ? item.firmware_version : '') === selectedVersion);
  const releases = data.releases.filter(item => matchesText(releaseFilters.filters.query, item.version, item.revision, item.notes, item.filename, item.model, item.arch) && (!releaseFilters.filters.status || item.status === releaseFilters.filters.status) && matchesUtcDay(item.created_at, releaseFilters.filters.from, releaseFilters.filters.to));
  const releasesPagination = usePrintListPagination(releases.length);
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    setResult(null);
    try {
      setStage('hash');
      const localSha = await sha256OfFile(file);
      const release = await uploadFirmware({ file, ...form }, next => setStage(next));
      const matches = release.sha256 === localSha;
      setResult({ ok: matches, text: t(matches ? 'fw.result.ok' : 'fw.result.mismatch'), release, localSha });
      setFile(null); setForm(current => ({ ...current, version: '', revision: '', notes: '' }));
      setFileKey(key => key + 1);
    } catch (error) {
      const key = error instanceof FirmwareError ? error.key : errorCode(error);
      setResult({ ok: false, text: t(key), release: error instanceof FirmwareError ? error.release : undefined });
    } finally {
      setStage('idle');
      try { await onRefresh(); }
      catch { setResult(current => current ? { ...current, text: `${current.text} ${t('fw.refreshFailed')}` } : { ok: false, text: t('fw.refreshFailed') }); }
    }
  }

  async function download(id: string) {
    try { window.location.assign(await firmwareDownloadUrl(id)); }
    catch (error) { setResult({ ok: false, text: t(error instanceof FirmwareError ? error.key : errorCode(error)) }); }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const deleted = await deleteFirmware(deleteTarget.id);
      setDeleteTarget(null);
      const notice = t(deleted.fileRemoved ? 'fw.deleteSuccess' : 'fw.deleteRecordOnly');
      setDeleteNotice({text:notice,warning:!deleted.fileRemoved});
      try { await onRefresh(); }
      catch { setDeleteNotice({text:`${notice} ${t('fw.refreshFailed')}`,warning:true}); }
    } catch (error) {
      setDeleteError(t(error instanceof FirmwareError ? error.key : errorCode(error)));
    } finally { setDeleting(false); }
  }

  const installedCount = (release: FirmwareRelease) => release.installed_count > 0
    ? t('fw.installedOn').replace('{n}', String(release.installed_count)) : t('fw.notInstalled');

  return <div className="page-stack staff-page" data-testid="firmwares-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('fw.title')}</h1><p>{t('fw.lead')}</p></div><div className="heading-accent" aria-hidden="true"><FileArchive size={30}/></div></div>
    <PrintServersTabs/>
    <section className="staff-panel" aria-labelledby="fw-upload-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.uploadEyebrow')}</p><h2 id="fw-upload-title">{t('fw.uploadTitle')}</h2></div></div>
      <p className="owner-section-lead fw-notice" data-testid="fw-no-install"><AlertTriangle size={15}/>{t('fw.noInstall')}</p>
      <form className="fw-form" onSubmit={submit} data-testid="fw-form">
        <label className="field fw-file"><span>{t('fw.file')}</span><input key={fileKey} id="fw-file" type="file" accept=".zip,application/zip" required disabled={busy} data-testid="fw-file" onChange={event => setFile(event.target.files?.[0] ?? null)}/></label>
        <label className="field"><span>{t('fw.version')}</span><input value={form.version} required pattern="[0-9]+\.[0-9]+\.[0-9]+([.\-][0-9A-Za-z.\-]+)?" placeholder="0.3.5" disabled={busy} data-testid="fw-version" onChange={event => set('version', event.target.value)}/></label>
        <label className="field"><span>{t('fw.revision')}</span><input value={form.revision} maxLength={40} placeholder={t('fw.revisionPlaceholder')} disabled={busy} data-testid="fw-revision" onChange={event => set('revision', event.target.value)}/></label>
        <label className="field"><span>{t('fw.model')}</span><select value={form.model} disabled={busy} data-testid="fw-model" onChange={event => set('model', event.target.value)}>{MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        <label className="field"><span>{t('fw.arch')}</span><select value={form.arch} disabled={busy} data-testid="fw-arch" onChange={event => set('arch', event.target.value)}>{ARCHS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="field fw-notes"><span>{t('fw.notes')}</span><textarea value={form.notes} maxLength={4000} rows={3} disabled={busy} data-testid="fw-notes" onChange={event => set('notes', event.target.value)}/></label>
        <div className="fw-actions"><button className="button button-primary" type="submit" disabled={!file || busy} data-testid="fw-submit"><Upload size={17}/>{busy ? t(`fw.stage.${stage}`) : t('fw.submit')}</button></div>
      </form>
      <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="fw-result" data-ok={result ? String(result.ok) : undefined}>
        {result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span>
      </div>
      {result?.release && <dl className="fw-hashes" data-testid="fw-result-detail">
        <div><dt>{t('fw.serverHash')}</dt><dd className="fw-hash" data-testid="fw-server-sha">{result.release.sha256 ?? t('notProvided')}</dd></div>
        {result.localSha && <div><dt>{t('fw.localHash')}</dt><dd className="fw-hash" data-testid="fw-local-sha">{result.localSha}</dd></div>}
        {result.release.errors.length > 0 && <div><dt>{t('fw.validation')}</dt><dd>{result.release.errors.map(e => t(`fw.check.${e}`)).join(' · ')}</dd></div>}
      </dl>}
    </section>
    <section className="staff-panel" aria-labelledby="fw-installed-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.installedEyebrow')}</p><h2 id="fw-installed-title">{t('fw.installedTitle')}</h2><p className="owner-section-lead">{t('fw.distributionDenominator').replace('{n}', String(distribution.total))}</p></div></div>
      {distribution.total === 0 ? <div className="inline-empty" data-testid="fw-distribution-empty">{t('fw.noInventory')}</div> : <div className="fw-distribution" data-testid="fw-distribution">
        <div className="fw-donut-wrap"><svg className="fw-donut" viewBox="0 0 200 200" role="group" aria-label={t('fw.distributionLabel')}>
          <circle cx="100" cy="100" r="76" className="fw-donut-track" />
          {distribution.firmware.map((entry, index) => {
            const key = entry.version ?? '';
            const offset = distribution.firmware.slice(0, index).reduce((sum, part) => sum + part.pct, 0);
            return <circle key={key || 'unknown'} cx="100" cy="100" r="76" fill="none" stroke={`var(--fw-chart-${index % 8})`} strokeWidth={selectedVersion === key ? 30 : 24} strokeDasharray={`${entry.pct} ${100 - entry.pct}`} strokeDashoffset={-offset} pathLength="100" transform="rotate(-90 100 100)" role="button" tabIndex={0} aria-pressed={selectedVersion === key} aria-label={`${entry.version ?? t('dash.unknownVersion')}: ${sizeFormatter.format(entry.pct)}%, ${entry.count} ${t('fw.devices')}`} data-testid={`fw-segment-${key || 'unknown'}`} onClick={() => setSelectedVersion(current => current === key ? null : key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedVersion(current => current === key ? null : key); } }}/>
          })}
          <text x="100" y="96" textAnchor="middle" className="fw-donut-total">{distribution.total}</text><text x="100" y="116" textAnchor="middle" className="fw-donut-caption">{t('fw.devices')}</text>
        </svg></div>
        <div className="fw-distribution-legend" role="group" aria-label={t('fw.distributionLabel')}>
          {distribution.firmware.map((entry, index) => { const key = entry.version ?? ''; return <button key={key || 'unknown'} type="button" className={`fw-legend-item ${selectedVersion === key ? 'active' : ''}`} aria-pressed={selectedVersion === key} onClick={() => setSelectedVersion(current => current === key ? null : key)} data-testid={`fw-legend-${key || 'unknown'}`}><span className="fw-legend-dot" style={{ background: `var(--fw-chart-${index % 8})` }}/><span className="fw-legend-copy"><strong>{entry.version ?? t('dash.unknownVersion')}</strong><small>{key && readyVersions.has(key) ? t('fw.uploaded') : t('fw.notUploaded')}</small></span><span className="fw-legend-value">{entry.count} · {sizeFormatter.format(entry.pct)}%</span></button>; })}
        </div>
      </div>}
      <div className="fw-device-heading"><h3>{selectedVersion === null ? t('fw.allDevices') : t('fw.selectedDevices').replace('{version}', selectedVersion || t('dash.unknownVersion'))}</h3>{selectedVersion !== null && <button type="button" className="button button-secondary" onClick={() => setSelectedVersion(null)} data-testid="fw-clear-distribution">{t('ps.filter.clear')}</button>}</div>
      {selectedItems.length === 0 ? <div className="inline-empty" data-testid="fw-devices-empty">{t('fw.noDevices')}</div> : <ul className="fw-device-list" data-testid="fw-devices">{selectedItems.map(item => <li key={item.id}><div><strong>{item.label || item.hostname || item.device_id || t('dash.device')}</strong><small>{item.venue_name || item.last_venue_name || t('dash.unknownVenue')}</small></div><span>{item.firmware_known && item.firmware_version ? item.firmware_version : t('dash.unknownVersion')}</span>{item.venue_id && item.assignment === 'assigned' ? <Link to={`/admin/print-servers/${encodeURIComponent(item.venue_id)}`} className="staff-action-link">{t('ps.open')}</Link> : <span className="ps-sub">{t('dash.noDetail')}</span>}</li>)}</ul>}
    </section>
    <section className="servers-panel" aria-labelledby="fw-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.listEyebrow')}</p><h2 id="fw-list-title">{t('fw.listTitle')}</h2></div><button type="button" className="button button-secondary" onClick={() => void onRefresh().catch(() => setDeleteNotice({text:t('fw.refreshFailed'),warning:true}))} disabled={refreshing}><RefreshCw size={15}/>{t('refresh')}</button></div>
      <div className="admin-list-toolbar"><AdminListFilters id="fw-releases" filters={releaseFilters.filters} set={(key, value) => { releaseFilters.set(key, value); releasesPagination.reset(); }} clear={() => { releaseFilters.clear(); releasesPagination.reset(); }} statuses={[{ value: 'ready', label: t('fw.loaded') }, { value: 'rejected', label: t('fw.rejected') }]} dateLabel={t('list.uploaded')}/><span className="directory-count">{releases.length} / {data.releases.length}</span></div>
      {deleteNotice && <div className={`ps-result ${deleteNotice.warning ? 'ps-result-error' : 'ps-result-ok'} fw-delete-notice`} role={deleteNotice.warning ? 'alert' : 'status'} data-testid="fw-delete-notice">{deleteNotice.warning ? <AlertTriangle size={18}/> : <Check size={18}/>}<span>{deleteNotice.text}</span></div>}
      {releases.length === 0 ? <div className="inline-empty" data-testid="fw-empty">{data.releases.length ? t('list.noMatches') : t('fw.empty')}</div> : <ul className="fw-release-list" data-testid="fw-release-list">{releases.slice(releasesPagination.start, releasesPagination.end).map(r => <li className="fw-release-card" key={r.id} data-testid={`fw-row-${r.id}`} data-status={r.status}>
        <div className="fw-release-head"><div className="fw-release-title"><strong>{r.version}</strong>{r.revision && <span>{t('fw.revision')} {r.revision}</span>}<span>{MODELS.find(m => m.value === r.model)?.label ?? r.model} · {r.arch}</span></div><span className={`server-status ${r.status === 'ready' ? r.installed_count > 0 ? 'server-online' : 'server-pending' : 'server-revoked'}`} data-testid={`fw-state-${r.id}`}><span className="badge-dot"/>{r.status === 'ready' ? `${t('fw.loaded')} · ${installedCount(r)}` : t('fw.rejected')}</span><div className="fw-release-actions">{r.status === 'ready' && <button type="button" className="button button-secondary" data-testid={`fw-download-${r.id}`} onClick={() => void download(r.id)}><Download size={15}/>{t('fw.download')}</button>}<button type="button" className="button button-secondary ps-danger" disabled={busy||deleting} data-testid={`fw-delete-${r.id}`} onClick={() => { setDeleteTarget(r); setDeleteError(''); setDeleteNotice(null); }}><Trash2 size={15}/>{t('fw.delete')}</button></div></div>
        <dl className="fw-release-facts"><div><dt>{t('fw.col.file')}</dt><dd className="fw-filename">{r.filename}</dd></div><div><dt>{t('fw.fileSize')}</dt><dd>{size(r.size_bytes)}</dd></div><div><dt>{t('fw.col.uploaded')}</dt><dd>{r.created_at ? <time dateTime={r.created_at}>{dateFormatter.format(new Date(r.created_at))}</time> : t('notProvided')}</dd></div><div><dt>{t('fw.uploadedBy')}</dt><dd>{r.uploaded_by_email ?? t('notProvided')}</dd></div><div className="fw-release-hash"><dt>SHA-256</dt><dd><code className="fw-hash" data-testid={`fw-sha-${r.id}`}>{r.sha256 ?? t('notProvided')}</code></dd></div>{r.notes && <div className="fw-release-notes"><dt>{t('fw.notes')}</dt><dd>{r.notes}</dd></div>}</dl>

      </li>)}</ul>}
      <PrintListPagination pagination={releasesPagination} id="fw-releases"/>
    </section>
    {deleteTarget && <PortalDialog title={t('fw.deleteTitle')} titleId="fw-delete-title" descriptionId="fw-delete-description" alert testId="fw-delete-dialog" dismissible={!deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} actions={<><button type="button" className="button button-secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>{t('cancel')}</button><button type="button" className="button button-primary ps-danger-solid" disabled={deleting} data-testid="fw-confirm-delete" onClick={() => void confirmDelete()}>{deleting ? t('fw.deleting') : t('fw.confirmDelete')}</button></>}><p id="fw-delete-description">{t('fw.deletePrompt').replace('{version}', deleteTarget.version)}</p><p className="ps-dialog-warning"><AlertTriangle size={17}/>{t('fw.deleteWarning')}</p>{deleteError && <p className="ps-error-text" role="alert" data-testid="fw-delete-error">{deleteError}</p>}</PortalDialog>}
  </div>;
}
