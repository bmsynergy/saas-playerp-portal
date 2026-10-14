import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, Cpu, Download, FileArchive, LayoutDashboard, List, PenLine, RefreshCw, Rocket, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { FirmwareError, deleteFirmware, firmwareDownloadUrl, setFirmwareAvailability, sha256OfFile, uploadFirmware, type FirmwareList, type FirmwareRelease } from '../lib/firmware';
import { signEdition } from '../lib/ota';
import { FIRMWARE_RINGS, firmwareRingAvailable, type FirmwareRing, type FirmwareConfirmation } from '../lib/firmwareLifecycle';
import { errorCode } from '../lib/errors';
import { useLocale } from '../locales';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { matchesText, matchesUtcDay } from '../lib/adminLists';
import { PortalDialog } from '../components/PortalDialog';
import { psErrorKey } from '../lib/printServerApi';

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

export function PrintFirmwaresPage({ data, refreshing, onRefresh }: { data: FirmwareList; refreshing: boolean; onRefresh: () => Promise<unknown> }) {
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
  const [searchParams] = useSearchParams();
  const [signTarget, setSignTarget] = useState<FirmwareRelease | null>(null);
  const [signConfirmed, setSignConfirmed] = useState(false);
  const [availabilityTarget, setAvailabilityTarget] = useState<{ release: FirmwareRelease; ring?: FirmwareRing; retire?: boolean } | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const sizeFormatter = useMemo(() => new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', { maximumFractionDigits: 1 }), [locale]);
  const size = (bytes: number | null) => bytes === null ? t('notProvided') : bytes >= 1048576 ? `${sizeFormatter.format(bytes / 1048576)} MB` : `${sizeFormatter.format(bytes / 1024)} KB`;
  const busy = stage !== 'idle';
  const releaseFilters = useAdminListFilters();
  const distribution = useMemo(() => {
    const total = data.installed.reduce((sum, item) => sum + item.print_servers, 0);
    return { total, firmware: data.installed.map(item => ({ version: item.version || null, count: item.print_servers, pct: total ? item.print_servers * 100 / total : 0 })) };
  }, [data.installed]);
  const readyVersions = useMemo(() => new Set(data.releases.filter(item => item.status === 'ready').map(item => item.version)), [data.releases]);
  const lifecycleState = (item: FirmwareRelease) => item.lifecycle?.retired_at ? 'retired' : item.status === 'rejected' ? 'rejected' : item.lifecycle?.edition_status === 'signed' ? 'signed' : 'ready';
  const releases = data.releases.filter(item => matchesText(releaseFilters.filters.query, item.version, item.revision, item.notes, item.filename, item.model, item.arch) && (!releaseFilters.filters.status || lifecycleState(item) === releaseFilters.filters.status) && matchesUtcDay(item.created_at, releaseFilters.filters.from, releaseFilters.filters.to));
  const releasesPagination = usePrintListPagination(releases.length);
  const deepEdition = searchParams.get('edition'), deepRelease = searchParams.get('release');
  const focusedRelease = data.releases.find(item => deepEdition ? item.lifecycle?.edition_id === deepEdition : deepRelease ? item.id === deepRelease : false);
  const pageReleases = releases.slice(releasesPagination.start, releasesPagination.end);
  const shownReleases = focusedRelease ? [focusedRelease] : pageReleases;
  useEffect(() => {
    if (!focusedRelease) return;
    const frame = requestAnimationFrame(() => document.getElementById(`firmware-release-${focusedRelease.id}`)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [focusedRelease?.id]);
  const reasonText = (reason: string | null) => {
    if (!reason) return null;
    const key = `fw.lifecycle.reason.${reason}`;
    const translated = t(key);
    return translated === key ? t('fw.lifecycle.reason.generic') : translated;
  };
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

  const formatDate = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? dateFormatter.format(new Date(value)) : t('notProvided');
  async function confirmSign() {
    if (!signTarget?.sha256 || !signTarget.lifecycle?.can_sign || !signConfirmed || lifecycleBusy) return;
    const target = signTarget;
    const confirmation: FirmwareConfirmation = { sha256: target.sha256!, version: target.version, model: target.model, arch: target.arch, revision: target.revision };
    setLifecycleBusy(true); setLifecycleError('');
    try { await signEdition(target.id, confirmation); setSignTarget(null); setDeleteNotice({ text: t('fw.lifecycle.signSuccess'), warning: false }); try { await onRefresh(); } catch { setDeleteNotice({ text: `${t('fw.lifecycle.signSuccess')} ${t('fw.refreshFailed')}`, warning: true }); } }
    catch (error) { setLifecycleError(t(psErrorKey(error))); }
    finally { setLifecycleBusy(false); }
  }
  async function confirmAvailability() {
    const target = availabilityTarget, lifecycle = target?.release.lifecycle;
    if (!target || !lifecycle?.edition_id || !lifecycle.can_manage || (target.retire && !lifecycle.can_retire) || lifecycleBusy) return;
    const enabled = FIRMWARE_RINGS.filter(ring => lifecycle.rings[ring].enabled);
    const next = target.ring ? enabled.includes(target.ring) ? enabled.filter(ring => ring !== target.ring) : [...enabled, target.ring] : enabled;
    setLifecycleBusy(true); setLifecycleError('');
    try { await setFirmwareAvailability(lifecycle.edition_id, next, !!target.retire || !!lifecycle.retired_at, lifecycle.revision); setAvailabilityTarget(null); setDeleteNotice({ text: t(target.retire ? 'fw.lifecycle.retireSuccess' : 'fw.lifecycle.availabilitySuccess'), warning: false }); try { await onRefresh(); } catch { setDeleteNotice({ text: `${t(target.retire ? 'fw.lifecycle.retireSuccess' : 'fw.lifecycle.availabilitySuccess')} ${t('fw.refreshFailed')}`, warning: true }); } }
    catch (error) { setLifecycleError(t(error instanceof FirmwareError ? error.key : errorCode(error))); }
    finally { setLifecycleBusy(false); }
  }

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
      <div className="fw-device-heading"><h3>{selectedVersion === null ? t('fw.allDevices') : t('fw.selectedDevices').replace('{version}', selectedVersion || t('dash.unknownVersion'))}</h3><Link className="button button-secondary" data-testid="fw-view-inventory" to={`/admin/print-servers/inventory${selectedVersion === null ? '' : `?version=${encodeURIComponent(selectedVersion || '__unknown__')}`}`}>{t('fw.viewInventory')}</Link></div>
    </section>
    <section className="servers-panel" aria-labelledby="fw-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.listEyebrow')}</p><h2 id="fw-list-title">{t('fw.listTitle')}</h2></div><button type="button" className="button button-secondary" onClick={() => void onRefresh().catch(() => setDeleteNotice({text:t('fw.refreshFailed'),warning:true}))} disabled={refreshing}><RefreshCw size={15}/>{t('refresh')}</button></div>
      {focusedRelease ? <div className="fw-focus-toolbar" data-testid="fw-focus-toolbar"><span>{t('fw.lifecycle.selectedEdition')}: {focusedRelease.version}{focusedRelease.revision ? ` · ${focusedRelease.revision}` : ''}</span><Link className="button button-secondary" to="/admin/print-servers/firmwares">{t('fw.lifecycle.allReleases')}</Link></div> : <div className="admin-list-toolbar"><AdminListFilters id="fw-releases" filters={releaseFilters.filters} set={(key, value) => { releaseFilters.set(key, value); releasesPagination.reset(); }} clear={() => { releaseFilters.clear(); releasesPagination.reset(); }} statuses={[{ value: 'ready', label: t('fw.loaded') }, { value: 'signed', label: t('fw.lifecycle.signed') }, { value: 'retired', label: t('fw.lifecycle.retired') }, { value: 'rejected', label: t('fw.rejected') }]} dateLabel={t('list.uploaded')}/><span className="directory-count">{releases.length} / {data.total ?? t('fw.lifecycle.unknownTotal')}</span></div>}
      {!data.complete && <p className="fw-notice" role="status" data-testid="fw-incomplete"><AlertTriangle size={15}/>{t('fw.lifecycle.incomplete')}</p>}
      {(deepEdition || deepRelease) && !focusedRelease && <p className="inline-empty" role="status" data-testid="fw-detail-missing">{t('fw.lifecycle.detailMissing')}</p>}
      {deleteNotice && <div className={`ps-result ${deleteNotice.warning ? 'ps-result-error' : 'ps-result-ok'} fw-delete-notice`} role={deleteNotice.warning ? 'alert' : 'status'} data-testid="fw-delete-notice">{deleteNotice.warning ? <AlertTriangle size={18}/> : <Check size={18}/>}<span>{deleteNotice.text}</span></div>}
      {shownReleases.length === 0 ? <div className="inline-empty" data-testid="fw-empty">{data.releases.length ? t('list.noMatches') : t('fw.empty')}</div> : <ul className="fw-release-list" data-testid="fw-release-list">{shownReleases.map(r => <li id={`firmware-release-${r.id}`} className={`fw-release-card ${focusedRelease?.id === r.id ? 'fw-release-focused' : ''}`} key={r.id} data-testid={`fw-row-${r.id}`} data-status={lifecycleState(r)}>
        <div className="fw-release-head"><div className="fw-release-title"><strong><Link to={r.lifecycle?.edition_id ? `/admin/print-servers/firmwares?edition=${encodeURIComponent(r.lifecycle.edition_id)}` : `/admin/print-servers/firmwares?release=${encodeURIComponent(r.id)}`} data-testid={`fw-open-${r.id}`}>{r.version}</Link></strong>{r.revision && <span>{t('fw.revision')} {r.revision}</span>}<span>{MODELS.find(m => m.value === r.model)?.label ?? r.model} · {r.arch}</span>{focusedRelease?.id === r.id && <span className="server-status server-online" data-testid="fw-exact-edition">{t('fw.lifecycle.selectedEdition')}</span>}</div><span className={`server-status ${r.status === 'rejected' || r.lifecycle?.retired_at ? 'server-revoked' : r.lifecycle?.edition_status === 'signed' ? 'server-online' : 'server-pending'}`} data-testid={`fw-state-${r.id}`}><span className="badge-dot"/>{r.status === 'rejected' ? t('fw.rejected') : r.lifecycle?.retired_at ? t('fw.lifecycle.retired') : r.lifecycle?.edition_status === 'signed' ? t('fw.lifecycle.signed') : t('fw.loaded')}</span><div className="fw-release-actions">{r.status === 'ready' && <button type="button" className="button button-secondary" data-testid={`fw-download-${r.id}`} onClick={() => void download(r.id)}><Download size={15}/>{t('fw.download')}</button>}{r.lifecycle?.can_sign && <button type="button" className="button button-primary" disabled={lifecycleBusy || !r.sha256} title={!r.sha256 ? t('fw.lifecycle.metadataUnavailable') : undefined} data-testid={`fw-sign-${r.id}`} onClick={() => { setSignTarget(r); setSignConfirmed(false); setLifecycleError(''); }}><PenLine size={15}/>{t('fw.lifecycle.sign')}</button>}<button type="button" className="button button-secondary ps-danger" disabled={busy||deleting} data-testid={`fw-delete-${r.id}`} onClick={() => { setDeleteTarget(r); setDeleteError(''); setDeleteNotice(null); }}><Trash2 size={15}/>{t('fw.delete')}</button></div></div>
        <dl className="fw-release-facts"><div><dt>{t('fw.col.file')}</dt><dd className="fw-filename">{r.filename}</dd></div><div><dt>{t('fw.fileSize')}</dt><dd>{size(r.size_bytes)}</dd></div><div><dt>{t('fw.col.uploaded')}</dt><dd>{formatDate(r.created_at)}</dd></div><div><dt>{t('fw.uploadedBy')}</dt><dd>{r.uploaded_by_email ?? t('notProvided')}</dd></div><div className="fw-release-hash"><dt>SHA-256</dt><dd><code className="fw-hash" data-testid={`fw-sha-${r.id}`}>{r.sha256 ?? t('notProvided')}</code></dd></div>{r.notes && <div className="fw-release-notes"><dt>{t('fw.notes')}</dt><dd>{r.notes}</dd></div>}</dl>
        <div className="fw-lifecycle" data-testid={`fw-lifecycle-${r.id}`}>
          <p className="fw-lifecycle-explain"><ShieldCheck size={17}/>{r.status === 'rejected' ? t('fw.lifecycle.rejectedRule') : r.lifecycle?.lab_only ? t('fw.lifecycle.labOnlyRule') : t('fw.lifecycle.authenticity')}</p>
          {!r.lifecycle ? <p className="ps-dialog-warning" data-testid={`fw-unavailable-${r.id}`}>{t('fw.lifecycle.unavailable')}</p> : <>
            <dl className="fw-release-facts"><div><dt>{t('fw.lifecycle.signature')}</dt><dd>{r.lifecycle.edition_status === 'signed' ? t('fw.lifecycle.signed') : r.lifecycle.edition_status === 'preparing' ? t('ota.preparing') : t('fw.lifecycle.unsigned')}</dd></div><div><dt>{t('fw.lifecycle.signer')}</dt><dd>{r.lifecycle.signed_by_email ?? r.lifecycle.signed_by ?? t('notProvided')}</dd></div><div><dt>{t('fw.lifecycle.signedAt')}</dt><dd>{formatDate(r.lifecycle.signed_at)}</dd></div><div><dt>key_id</dt><dd className="fw-hash" data-testid={`fw-key-${r.id}`}>{r.lifecycle.key_id ?? t('notProvided')}</dd></div>{r.lifecycle.edition_id && <div><dt>{t('fw.lifecycle.editionId')}</dt><dd className="fw-hash">{r.lifecycle.edition_id}</dd></div>}{r.lifecycle.retired_at && <div><dt>{t('fw.lifecycle.retired')}</dt><dd>{formatDate(r.lifecycle.retired_at)} · {r.lifecycle.retired_by ?? t('notProvided')}</dd></div>}</dl>
            <div className="fw-ring-grid">{FIRMWARE_RINGS.map(ring => { const state = r.lifecycle!.rings[ring]; const available = firmwareRingAvailable(r.lifecycle, ring); return <div className="fw-ring-card" key={ring} data-testid={`fw-ring-${r.id}-${ring}`} data-enabled={state.enabled} data-eligible={state.eligible}><strong>{t(`ota.ring.${ring}`)}</strong><span className={`server-status ${available ? 'server-online' : state.enabled ? 'server-pending' : 'server-offline'}`}>{available ? t('fw.lifecycle.available') : state.enabled ? t('fw.lifecycle.blocked') : t('fw.lifecycle.disabled')}</span>{state.reason && <small>{reasonText(state.reason)}</small>}{r.lifecycle?.can_manage && !r.lifecycle.retired_at && <button type="button" className="button button-secondary" disabled={lifecycleBusy || (!state.enabled && !state.eligible)} data-testid={`fw-toggle-${r.id}-${ring}`} onClick={() => { setAvailabilityTarget({ release: r, ring }); setLifecycleError(''); }}>{t(state.enabled ? 'fw.lifecycle.disableRing' : 'fw.lifecycle.enableRing')}</button>}</div>; })}</div>
            {!r.lifecycle.lab_only && !r.lifecycle.retired_at && r.lifecycle.edition_status === 'signed' && (r.lifecycle.canary_confirmed_at ? <p className="fw-lifecycle-note">{t('fw.lifecycle.canaryConfirmed')}: {formatDate(r.lifecycle.canary_confirmed_at)}</p> : <p className="fw-lifecycle-note" data-testid={`fw-canary-pending-${r.id}`}>{t('fw.lifecycle.canaryPending')}</p>)}
            {r.lifecycle.sign_block_reason && <p className="fw-lifecycle-note">{reasonText(r.lifecycle.sign_block_reason)}</p>}
            {r.lifecycle.can_manage && !r.lifecycle.retired_at && <div className="fw-release-actions"><button type="button" className="button button-secondary ps-danger" disabled={lifecycleBusy || !r.lifecycle.can_retire} data-testid={`fw-retire-${r.id}`} onClick={() => { setAvailabilityTarget({ release: r, retire: true }); setLifecycleError(''); }}>{t('fw.lifecycle.retire')}</button>{!r.lifecycle.can_retire && r.lifecycle.retire_block_reason && <span className="fw-lifecycle-note">{reasonText(r.lifecycle.retire_block_reason)}</span>}</div>}
          </>}
        </div>

      </li>)}</ul>}
      {!focusedRelease && <PrintListPagination pagination={releasesPagination} id="fw-releases"/>}
    </section>
    {deleteTarget && <PortalDialog title={t('fw.deleteTitle')} titleId="fw-delete-title" descriptionId="fw-delete-description" alert testId="fw-delete-dialog" dismissible={!deleting} onClose={() => { if (!deleting) setDeleteTarget(null); }} actions={<><button type="button" className="button button-secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>{t('staff.cancel')}</button><button type="button" className="button button-primary ps-danger-solid" disabled={deleting} data-testid="fw-confirm-delete" onClick={() => void confirmDelete()}>{deleting ? t('fw.deleting') : t('fw.confirmDelete')}</button></>}><p id="fw-delete-description">{t('fw.deletePrompt').replace('{version}', deleteTarget.version)}</p><p className="ps-dialog-warning"><AlertTriangle size={17}/>{t('fw.deleteWarning')}</p>{deleteError && <p className="ps-error-text" role="alert" data-testid="fw-delete-error">{deleteError}</p>}</PortalDialog>}
    {signTarget && <PortalDialog title={t('fw.lifecycle.sign')} titleId="fw-sign-title" descriptionId="fw-sign-description" alert testId="fw-sign-dialog" dismissible={!lifecycleBusy} onClose={() => setSignTarget(null)} actions={<><button type="button" className="button button-secondary" disabled={lifecycleBusy} onClick={() => setSignTarget(null)}>{t('staff.cancel')}</button><button type="button" className="button button-primary" disabled={lifecycleBusy || !signConfirmed} data-testid="fw-confirm-sign" onClick={() => void confirmSign()}>{t('fw.lifecycle.sign')}</button></>}><p id="fw-sign-description">{t('fw.lifecycle.signPrompt')}</p><dl className="fw-confirm-facts"><div><dt>SHA-256</dt><dd className="fw-hash">{signTarget.sha256 ?? t('notProvided')}</dd></div><div><dt>{t('fw.version')}</dt><dd>{signTarget.version}</dd></div><div><dt>{t('fw.model')}</dt><dd>{signTarget.model}</dd></div><div><dt>{t('fw.arch')}</dt><dd>{signTarget.arch}</dd></div><div><dt>{t('fw.revision')}</dt><dd>{signTarget.revision ?? t('notProvided')}</dd></div></dl><label className="fw-confirm-check"><input type="checkbox" checked={signConfirmed} onChange={event => setSignConfirmed(event.target.checked)} data-testid="fw-sign-check"/>{t('fw.lifecycle.confirmFacts')}</label>{lifecycleError && <p role="alert" className="ps-error-text" data-testid="fw-sign-error">{lifecycleError}</p>}</PortalDialog>}
    {availabilityTarget && <PortalDialog title={t(availabilityTarget.retire ? 'fw.lifecycle.retire' : 'fw.lifecycle.changeRing')} titleId="fw-availability-title" descriptionId="fw-availability-description" alert testId="fw-availability-dialog" dismissible={!lifecycleBusy} onClose={() => setAvailabilityTarget(null)} actions={<><button type="button" className="button button-secondary" disabled={lifecycleBusy} onClick={() => setAvailabilityTarget(null)}>{t('staff.cancel')}</button><button type="button" className={`button button-primary ${availabilityTarget.retire ? 'ps-danger-solid' : ''}`} disabled={lifecycleBusy} data-testid="fw-confirm-availability" onClick={() => void confirmAvailability()}>{t('staff.confirm')}</button></>}><p id="fw-availability-description">{availabilityTarget.retire ? t('fw.lifecycle.retirePrompt') : t(availabilityTarget.release.lifecycle?.rings[availabilityTarget.ring!].enabled ? 'fw.lifecycle.disablePrompt' : 'fw.lifecycle.enablePrompt').replace('{ring}', t(`ota.ring.${availabilityTarget.ring}`))}</p><p className="ps-dialog-warning"><AlertTriangle size={17}/>{t(availabilityTarget.retire ? 'fw.lifecycle.retireWarning' : 'fw.lifecycle.ringWarning')}</p>{lifecycleError && <p role="alert" className="ps-error-text" data-testid="fw-availability-error">{lifecycleError}</p>}</PortalDialog>}
  </div>;
}
