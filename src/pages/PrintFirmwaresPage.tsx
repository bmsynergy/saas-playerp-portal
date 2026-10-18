import { useAccess } from '../hooks/usePortalData';
import { canManageRings } from '../lib/access';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Cpu, Download, FileArchive, LayoutDashboard, List, PenLine, RefreshCw, Rocket, ShieldCheck, Trash2, Upload, RadioTower } from 'lucide-react';
import { FirmwareError, deleteFirmware, firmwareDownloadUrl, promoteFirmwareEdition, setFirmwareAvailability, sha256OfFile, uploadFirmware, type FirmwareRelease } from '../lib/firmware';
import { signEdition } from '../lib/ota';
import { FIRMWARE_RINGS, firmwareRingAvailable, type FirmwareRing, type FirmwareConfirmation } from '../lib/firmwareLifecycle';
import { errorCode } from '../lib/errors';
import { useLocale } from '../locales';
import { AdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination } from '../components/PrintListPagination';
import { PortalDialog } from '../components/PortalDialog';
import { psErrorKey } from '../lib/printServerApi';
import { invalidatePsViews } from '../lib/psInvalidation';
import { useOtaPage } from '../lib/useOtaPage';

export function PrintServersTabs() {
  const { t } = useLocale();
  const access = useAccess();
  const items = [
    { to: '/admin/print-servers', label: t('fw.tab.dashboard'), icon: <LayoutDashboard size={16}/>, testId: 'ps-tab-dashboard' },
    { to: '/admin/print-servers/list', label: t('fw.tab.list'), icon: <List size={16}/>, testId: 'ps-tab-list' },
    { to: '/admin/print-servers/inventory', label: t('inv.tab'), icon: <Cpu size={16}/>, testId: 'ps-tab-inventory' },
    { to: '/admin/print-servers/firmwares', label: t('fw.tab.firmwares'), icon: <FileArchive size={16}/>, testId: 'ps-tab-firmwares' },
    { to: '/admin/print-servers/channels', label: t('pe474.channels.tab'), icon: <RadioTower size={16}/>, testId: 'ps-tab-channels' },
    { to: '/admin/print-servers/updates', label: t('ota.tab'), icon: <Rocket size={16}/>, testId: 'ps-tab-updates' },
  ];
  return <nav className="detail-tabs ps-global-tabs" aria-label={t('secondaryNavigation')}>
    {items.filter(item => item.testId !== 'ps-tab-channels' || canManageRings(access.data)).map(item => <NavLink key={item.to} end to={item.to} data-testid={item.testId} className={({ isActive }) => `detail-tab ${isActive ? 'active' : ''}`}>{item.icon}{item.label}</NavLink>)}
  </nav>;
}

const MODELS = [{ value: 'rpi4-2gb', label: 'Raspberry Pi 4 2GB' }];
const ARCHS = ['arm64', 'armhf'];
type Result = { ok: boolean; text: string; release?: FirmwareRelease; localSha?: string };

export function PrintFirmwaresPage() {
  const { t, locale } = useLocale();
  const cache = useQueryClient();
  const page = useOtaPage('firmwares');
  const [searchParams, setSearchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [form, setForm] = useState({ version: '', revision: '', model: 'rpi4-2gb', arch: 'arm64', notes: '' });
  const [stage, setStage] = useState<'idle' | 'hash' | 'upload' | 'verify'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FirmwareRelease | null>(null);
  const [signTarget, setSignTarget] = useState<FirmwareRelease | null>(null);
  const [signConfirmed, setSignConfirmed] = useState(false);
  const [availabilityTarget, setAvailabilityTarget] = useState<{ release: FirmwareRelease; ring?: FirmwareRing; retire?: boolean } | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError,setNoticeError]=useState(false);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const formatDate = (v: string | null) => v && !Number.isNaN(Date.parse(v)) ? dateFormatter.format(new Date(v)) : t('notProvided');
  const releases = page.query.data?.items ?? [];
  const linkedQuery = searchParams.get('q');
  useEffect(() => { if (linkedQuery && page.filters.query !== linkedQuery) page.set('query', linkedQuery); }, [linkedQuery]);
  const focusedId = searchParams.get('edition') ?? searchParams.get('release');
  const focused = releases.find(r => r.id === focusedId || r.lifecycle?.edition_id === focusedId) ?? null;
  useEffect(() => { if (!focused) return; const frame = requestAnimationFrame(() => document.getElementById(`firmware-release-${focused.id}`)?.scrollIntoView({ block: 'start' })); return () => cancelAnimationFrame(frame); }, [focused?.id]);
  const refresh = async () => invalidatePsViews(cache);
  const reasonText = (reason: string | null) => { if (!reason) return null; const key = `pe474.reason.${reason}`; const translated = t(key); return translated === key ? t('fw.lifecycle.reason.generic') : translated; };
  const stageBusy = stage !== 'idle';
  const formSet = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file || stageBusy) return;
    setResult(null);
    try {
      setStage('hash'); const localSha = await sha256OfFile(file);
      const release = await uploadFirmware({ file, ...form }, next => setStage(next));
      const matches = release.sha256 === localSha;
      setResult({ ok: matches, text: t(matches ? 'fw.result.ok' : 'fw.result.mismatch'), release, localSha });
      setFile(null); setForm(current => ({ ...current, version: '', revision: '', notes: '' })); setFileKey(key => key + 1);
    } catch (error) { setResult({ok:false,text:t(error instanceof FirmwareError ? error.key : errorCode(error)),release:error instanceof FirmwareError ? error.release : undefined}); }
    finally { setStage('idle'); await refresh().catch(() => {setNoticeError(true);setNotice(t('fw.refreshFailed'));}); }
  }
  async function download(id: string) { try { window.location.assign(await firmwareDownloadUrl(id)); } catch (error) { setNotice(t(error instanceof FirmwareError ? error.key : errorCode(error))); } }
  async function perform(action: () => Promise<void>, success: string, close: () => void) {
    if (busyAction || page.query.isError || page.query.isFetching) return;
    setBusyAction(true); setActionError('');
    try { await action(); close(); setNoticeError(false);setNotice(t(success)); try { await refresh(); } catch {setNoticeError(true);setNotice(`${t(success)} ${t('fw.refreshFailed')}`);} }
    catch (error) { const key = error instanceof FirmwareError ? error.key : psErrorKey(error); const message=t(key) === key ? (reasonText(key) ?? t('genericError')) : t(key); setActionError(message);setNoticeError(true);setNotice(message); if(key==='fw.lifecycle.error.availabilityChanged'||key==='pe474.reason.availability_changed'){close();} await refresh().catch(() => {}); }
    finally { setBusyAction(false); }
  }
  const sign = () => {
    const release = signTarget;
    if (!release?.sha256 || !release.lifecycle?.can_sign || !signConfirmed) return;
    const confirmation: FirmwareConfirmation = { sha256: release.sha256, version: release.version, model: release.model, arch: release.arch, revision: release.revision };
    void perform(async () => { await signEdition(release.id, confirmation); }, 'pe474.firmware.signedLab', () => setSignTarget(null));
  };
  const changeAvailability = () => {
    const target = availabilityTarget, lifecycle = target?.release.lifecycle;
    const current=page.query.data?.items.find(item=>item.id===target?.release.id)?.lifecycle;
    if (!current || current.revision!==lifecycle?.revision) {setAvailabilityTarget(null);setNoticeError(true);setNotice(t('pe474.reason.availability_changed'));return;}
    if (!target || !lifecycle?.edition_id || !lifecycle.can_manage) return;
    if (target.retire) {
      if (!lifecycle.can_retire) return;
      void perform(() => setFirmwareAvailability(lifecycle.edition_id!, [...lifecycle.enabled_rings], true, lifecycle.revision), 'fw.lifecycle.retireSuccess', () => setAvailabilityTarget(null));
    } else if (target.ring && lifecycle.next_promotion === target.ring && lifecycle.rings[target.ring].can_enable) {
      void perform(() => promoteFirmwareEdition(lifecycle.edition_id!, target.ring!, lifecycle.revision), 'pe474.firmware.promoted', () => setAvailabilityTarget(null));
    }
  };
  const remove = () => { const target = deleteTarget; if (!target) return; void perform(async () => { await deleteFirmware(target.id); }, 'fw.deleteSuccess', () => setDeleteTarget(null)); };
  const chooseDetail = (release: FirmwareRelease) => setSearchParams(release.lifecycle?.edition_id ? {edition:release.lifecycle.edition_id} : {release:release.id});
  const stateOf = (r: FirmwareRelease) => r.status === 'rejected' ? 'rejected' : !r.lifecycle ? 'unknown' : r.lifecycle.retired_at ? 'retired' : r.lifecycle.edition_status === 'signed' ? 'signed' : 'ready';

  return <div className="page-stack staff-page" data-testid="firmwares-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('fw.title')}</h1><p>{t('pe474.firmware.lead')}</p></div><div className="heading-accent" aria-hidden="true"><FileArchive size={30}/></div></div>
    <PrintServersTabs/>
    <section className="staff-panel" aria-labelledby="fw-upload-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.uploadEyebrow')}</p><h2 id="fw-upload-title">{t('fw.uploadTitle')}</h2></div></div>
      <p className="owner-section-lead fw-notice"><AlertTriangle size={15}/>{t('fw.noInstall')}</p>
      <form className="fw-form" onSubmit={submit} data-testid="fw-form">
        <label className="field fw-file"><span>{t('fw.file')}</span><input key={fileKey} type="file" accept=".zip,application/zip" required disabled={stageBusy} data-testid="fw-file" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
        <label className="field"><span>{t('fw.version')}</span><input value={form.version} required pattern="[0-9]+\.[0-9]+\.[0-9]+([.\-][0-9A-Za-z.\-]+)?" placeholder="0.3.5" disabled={stageBusy} data-testid="fw-version" onChange={e => formSet('version',e.target.value)}/></label>
        <label className="field"><span>{t('fw.revision')}</span><input value={form.revision} maxLength={40} disabled={stageBusy} data-testid="fw-revision" onChange={e => formSet('revision',e.target.value)}/></label>
        <label className="field"><span>{t('fw.model')}</span><select value={form.model} disabled={stageBusy} data-testid="fw-model" onChange={e => formSet('model',e.target.value)}>{MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        <label className="field"><span>{t('fw.arch')}</span><select value={form.arch} disabled={stageBusy} data-testid="fw-arch" onChange={e => formSet('arch',e.target.value)}>{ARCHS.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="field fw-notes"><span>{t('fw.notes')}</span><textarea value={form.notes} maxLength={4000} rows={3} disabled={stageBusy} data-testid="fw-notes" onChange={e => formSet('notes',e.target.value)}/></label>
        <div className="fw-actions"><button className="button button-primary" type="submit" disabled={!file || stageBusy} data-testid="fw-submit"><Upload size={17}/>{stageBusy ? t(`fw.stage.${stage}`) : t('fw.submit')}</button></div>
      </form>
      {result && <div className={`ps-result ${result.ok ? 'ps-result-ok' : 'ps-result-error'}`} role="status" data-testid="fw-result">{result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>}<span>{result.text}</span></div>}
      {result?.release && <dl className="fw-hashes"><div><dt>{t('fw.serverHash')}</dt><dd className="fw-hash">{result.release.sha256 ?? t('notProvided')}</dd></div>{result.localSha && <div><dt>{t('fw.localHash')}</dt><dd className="fw-hash">{result.localSha}</dd></div>}</dl>}
    </section>
    <section className="servers-panel" aria-labelledby="fw-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.listEyebrow')}</p><h2 id="fw-list-title">{t('fw.listTitle')}</h2></div><button type="button" className="button button-secondary" onClick={() => void page.query.refetch()} disabled={page.query.isFetching}><RefreshCw size={15}/>{t('refresh')}</button></div>
      <div className="admin-list-toolbar"><AdminListFilters id="fw-releases" filters={page.filters} set={page.set} clear={page.clear} statuses={[{value:'ready',label:t('fw.loaded')},{value:'signed',label:t('fw.lifecycle.signed')},{value:'unsigned',label:t('fw.lifecycle.unsigned')},{value:'retired',label:t('fw.lifecycle.retired')},{value:'rejected',label:t('fw.rejected')}]} afterStatus={<><label><span>{t('ota.ring')}</span><select value={page.filters.ring ?? ''} onChange={e => page.set('ring',e.target.value)} data-testid="fw-ring-filter"><option value="">{t('list.allStates')}</option>{[...FIRMWARE_RINGS,'none'].map(r => <option key={r} value={r}>{r === 'none' ? t('pe474.firmware.noChannels') : t(`ota.ring.${r}`)}</option>)}</select></label><label><span>{t('fw.model')}</span><input value={page.filters.model ?? ''} onChange={e => page.set('model',e.target.value)}/></label><label><span>{t('fw.arch')}</span><input value={page.filters.arch ?? ''} onChange={e => page.set('arch',e.target.value)}/></label></>}/><span className="directory-count">{page.pagination.total}</span></div>
      {notice && <div role={noticeError?'alert':'status'} className={`ps-result ${noticeError?'ps-result-error':'ps-result-ok'}`}>{notice}</div>}
      {page.query.isError ? <div role="alert" className="form-error">{t(psErrorKey(page.query.error))}<button className="button button-secondary" onClick={() => void page.query.refetch()}>{t('refresh')}</button></div> : page.query.isPending ? <p className="inline-empty" role="status">{t('dev.loading')}</p> : releases.length === 0 ? <p className="inline-empty">{t('list.noMatches')}</p> : <ul className="fw-release-list" data-testid="fw-release-list">{releases.map(r => {
        const lifecycle = r.lifecycle, expanded = focused?.id === r.id;
        return <li id={`firmware-release-${r.id}`} className={`fw-release-card ${expanded ? 'fw-release-focused' : ''}`} key={r.id} data-testid={`fw-row-${r.id}`} data-status={stateOf(r)}>
          <div className="fw-release-head"><div className="fw-release-title"><strong><button className="staff-action-link pe474-title-button" type="button" onClick={() => chooseDetail(r)} data-testid={`fw-open-${r.id}`}>{r.version}</button></strong>{r.revision && <span>{t('fw.revision')} {r.revision}</span>}<span>{r.model} · {r.arch}</span></div><span className={`server-status ${stateOf(r)==='signed'?'server-online':stateOf(r)==='retired'||stateOf(r)==='rejected'?'server-revoked':'server-pending'}`} data-testid={`fw-state-${r.id}`}>{t(stateOf(r)==='signed'?'fw.lifecycle.signed':stateOf(r)==='retired'?'fw.lifecycle.retired':stateOf(r)==='rejected'?'fw.rejected':stateOf(r)==='unknown'?'pe474.firmware.unknown':'fw.loaded')}</span><div className="fw-release-actions"><button type="button" className="button button-secondary" onClick={() => chooseDetail(r)}>{t('pe474.firmware.details')}</button>{r.status==='ready'&&<button type="button" className="button button-secondary" onClick={() => void download(r.id)}><Download size={15}/>{t('fw.download')}</button>}{lifecycle?.can_sign&&<button className="button button-primary" disabled={busyAction||page.query.isFetching||page.query.isError||!r.sha256} onClick={() => {setSignTarget(r);setSignConfirmed(false);setActionError('');}}><PenLine size={15}/>{t('fw.lifecycle.sign')}</button>}<button className="button button-secondary ps-danger" disabled={busyAction||stageBusy} onClick={() => {setDeleteTarget(r);setActionError('');}}><Trash2 size={15}/>{t('fw.delete')}</button></div></div>
          <p className="ps-sub">{r.filename} · {formatDate(r.created_at)} · {t('pe474.firmware.installedCount').replace('{n}',String(r.installed_count))}</p>
          {expanded && <div className="pe474-firmware-detail" data-testid={`fw-detail-${r.id}`}>
            <div className="fw-focus-toolbar"><strong>{t('pe474.firmware.details')}</strong><button type="button" className="button button-secondary" onClick={() => setSearchParams({})}>{t('pe474.firmware.closeDetails')}</button></div>
            <dl className="fw-release-facts"><div><dt>{t('fw.col.file')}</dt><dd>{r.filename}</dd></div><div><dt>{t('fw.fileSize')}</dt><dd>{r.size_bytes === null?t('notProvided'):`${(r.size_bytes/1048576).toFixed(1)} MB`}</dd></div><div><dt>SHA-256</dt><dd className="fw-hash">{r.sha256??t('notProvided')}</dd></div><div><dt>{t('fw.uploadedBy')}</dt><dd>{r.uploaded_by_email??t('notProvided')}</dd></div>{r.notes&&<div><dt>{t('fw.notes')}</dt><dd>{r.notes}</dd></div>}{r.errors.length>0&&<div><dt>{t('fw.validation')}</dt><dd>{r.errors.map(e=>t(`fw.check.${e}`)).join(' · ')}</dd></div>}{lifecycle?.edition_id&&<div><dt>{t('fw.lifecycle.editionId')}</dt><dd className="fw-hash">{lifecycle.edition_id}</dd></div>}{lifecycle?.signed_at&&<div><dt>{t('fw.lifecycle.signedAt')}</dt><dd>{formatDate(lifecycle.signed_at)}</dd></div>}{lifecycle?.key_id&&<div><dt>{t('fw.lifecycle.signature')}</dt><dd className="fw-hash">{lifecycle.key_id}</dd></div>}</dl>
            {!lifecycle ? <p className="form-error" role="alert">{t('fw.lifecycle.unavailable')}</p> : <>
              <p className="fw-lifecycle-explain"><ShieldCheck size={17}/>{t('pe474.firmware.sameArtifact')}</p>
              {lifecycle.edition_status==='signed'&&lifecycle.enabled_rings.length===0&&<p className="fw-lifecycle-note fw-lifecycle-alert" data-testid={`fw-no-rings-${r.id}`}>{t('pe474.firmware.legacyNoChannels')}</p>}
              <div className="fw-ring-grid">{FIRMWARE_RINGS.map(ring => { const state = lifecycle.rings[ring], available = firmwareRingAvailable(lifecycle,ring); return <div className="fw-ring-card" key={ring} data-testid={`fw-ring-${r.id}-${ring}`} data-enabled={state.enabled}><strong>{t(`ota.ring.${ring}`)}</strong><span className={`server-status ${available?'server-online':'server-offline'}`}>{t(available?'fw.lifecycle.available':'fw.lifecycle.disabled')}</span>{state.can_enable&&lifecycle.next_promotion===ring ? <button className="button button-secondary" disabled={busyAction||page.query.isFetching||page.query.isError} onClick={() => {setAvailabilityTarget({release:r,ring});setActionError('');}} data-testid={`fw-promote-${r.id}-${ring}`}>{t(`pe474.firmware.enable.${ring}`)}</button> : !state.enabled&&state.enable_block_reason&&<small>{reasonText(state.enable_block_reason)}</small>}</div>; })}</div>
              {lifecycle.canary_evidence&&<p className="fw-lifecycle-note">{t('pe474.firmware.canaryInfo').replace('{n}',String(lifecycle.canary_evidence.committed_canary_targets))}</p>}
              {lifecycle.can_manage&&!lifecycle.retired_at&&<button className="button button-secondary ps-danger" disabled={busyAction||!lifecycle.can_retire} onClick={() => {setAvailabilityTarget({release:r,retire:true});setActionError('');}}>{t('fw.lifecycle.retire')}</button>}
            </>}
          </div>}
        </li>;
      })}</ul>}
      {focusedId&&!focused&&!page.query.isPending&&<p className="fw-notice" role="status">{t('pe474.firmware.detailOnPage')}</p>}
      <PrintListPagination pagination={page.pagination} id="fw-releases" disabled={page.query.isFetching}/>
    </section>
    {deleteTarget&&<PortalDialog title={t('fw.deleteTitle')} titleId="fw-delete-title" descriptionId="fw-delete-description" alert dismissible={!busyAction} onClose={() => setDeleteTarget(null)} actions={<><button className="button button-secondary" disabled={busyAction} onClick={() => setDeleteTarget(null)}>{t('staff.cancel')}</button><button className="button button-primary ps-danger-solid" disabled={busyAction} onClick={remove}>{t('fw.confirmDelete')}</button></>}><p id="fw-delete-description">{t('fw.deletePrompt').replace('{version}',deleteTarget.version)}</p>{actionError&&<p role="alert" className="form-error">{actionError}</p>}</PortalDialog>}
    {signTarget&&<PortalDialog title={t('fw.lifecycle.sign')} titleId="fw-sign-title" descriptionId="fw-sign-description" alert dismissible={!busyAction} onClose={() => setSignTarget(null)} actions={<><button className="button button-secondary" disabled={busyAction} onClick={() => setSignTarget(null)}>{t('staff.cancel')}</button><button className="button button-primary" disabled={busyAction||!signConfirmed} onClick={sign}>{t('fw.lifecycle.sign')}</button></>}><p id="fw-sign-description">{t('pe474.firmware.signPrompt')}</p><dl className="fw-confirm-facts"><div><dt>SHA-256</dt><dd className="fw-hash">{signTarget.sha256??t('notProvided')}</dd></div><div><dt>{t('fw.version')}</dt><dd>{signTarget.version}</dd></div><div><dt>{t('fw.model')}</dt><dd>{signTarget.model}</dd></div><div><dt>{t('fw.arch')}</dt><dd>{signTarget.arch}</dd></div></dl><label className="fw-confirm-check"><input type="checkbox" checked={signConfirmed} onChange={e => setSignConfirmed(e.target.checked)}/>{t('fw.lifecycle.confirmFacts')}</label>{actionError&&<p role="alert" className="form-error">{actionError}</p>}</PortalDialog>}
    {availabilityTarget&&<PortalDialog title={t(availabilityTarget.retire?'fw.lifecycle.retire':`pe474.firmware.enable.${availabilityTarget.ring}`)} titleId="fw-availability-title" descriptionId="fw-availability-description" alert dismissible={!busyAction} onClose={() => setAvailabilityTarget(null)} actions={<><button className="button button-secondary" disabled={busyAction} onClick={() => setAvailabilityTarget(null)}>{t('staff.cancel')}</button><button className="button button-primary" disabled={busyAction||page.query.isFetching||page.query.isError} onClick={changeAvailability}>{t('staff.confirm')}</button></>}><p id="fw-availability-description">{availabilityTarget.retire?t('fw.lifecycle.retirePrompt'):t(`pe474.firmware.confirm.${availabilityTarget.ring}`).replace('{version}',availabilityTarget.release.version)}</p>{actionError&&<p role="alert" className="form-error">{actionError}</p>}</PortalDialog>}
  </div>;
}
