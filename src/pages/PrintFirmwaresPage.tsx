import { useMemo, useState, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, Check, Download, FileArchive, LayoutDashboard, List, RefreshCw, Upload } from 'lucide-react';
import { FirmwareError, firmwareDownloadUrl, sha256OfFile, uploadFirmware, type FirmwareList, type FirmwareRelease } from '../lib/firmware';
import { errorCode } from '../lib/errors';
import { useLocale } from '../locales';

// Global Print Server sections. Only platform Admins reach them (the route gate and every RPC).
export function PrintServersTabs() {
  const { t } = useLocale();
  const items = [
    { to: '/admin/print-servers', label: t('fw.tab.dashboard'), icon: <LayoutDashboard size={16}/>, testId: 'ps-tab-dashboard' },
    { to: '/admin/print-servers/list', label: t('fw.tab.list'), icon: <List size={16}/>, testId: 'ps-tab-list' },
    { to: '/admin/print-servers/firmwares', label: t('fw.tab.firmwares'), icon: <FileArchive size={16}/>, testId: 'ps-tab-firmwares' },
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
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale]);
  const sizeFormatter = useMemo(() => new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', { maximumFractionDigits: 1 }), [locale]);
  const size = (bytes: number | null) => bytes === null ? t('notProvided') : bytes >= 1048576 ? `${sizeFormatter.format(bytes / 1048576)} MB` : `${sizeFormatter.format(bytes / 1024)} KB`;
  const busy = stage !== 'idle';
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
      await onRefresh();
    }
  }

  async function download(id: string) {
    try { window.location.assign(await firmwareDownloadUrl(id)); }
    catch (error) { setResult({ ok: false, text: t(error instanceof FirmwareError ? error.key : errorCode(error)) }); }
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
      <div className="section-heading"><div><p className="eyebrow">{t('fw.installedEyebrow')}</p><h2 id="fw-installed-title">{t('fw.installedTitle')}</h2></div></div>
      {data.installed.length === 0 ? <div className="inline-empty">{t('fw.noneInstalled')}</div> : <ul className="fw-installed" data-testid="fw-installed">
        {data.installed.map(item => <li key={item.version || '-'} data-testid={`fw-installed-${item.version || 'unknown'}`}><strong>{item.version || t('notProvided')}</strong><span>{t('fw.psCount').replace('{n}', String(item.print_servers))}</span><span className={`server-status ${item.uploaded ? 'server-online' : 'server-pending'}`}><span className="badge-dot"/>{t(item.uploaded ? 'fw.uploaded' : 'fw.notUploaded')}</span></li>)}
      </ul>}
    </section>
    <section className="servers-panel" aria-labelledby="fw-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('fw.listEyebrow')}</p><h2 id="fw-list-title">{t('fw.listTitle')}</h2></div><button type="button" className="button button-secondary" onClick={() => void onRefresh()} disabled={refreshing}><RefreshCw size={15}/>{t('refresh')}</button></div>
      {data.releases.length === 0 ? <div className="inline-empty" data-testid="fw-empty">{t('fw.empty')}</div> : <div className="table-scroll"><table className="servers-table fw-table"><thead><tr><th scope="col">{t('fw.col.version')}</th><th scope="col">{t('fw.col.model')}</th><th scope="col">{t('fw.col.file')}</th><th scope="col">SHA-256</th><th scope="col">{t('fw.col.state')}</th><th scope="col">{t('fw.col.uploaded')}</th><th scope="col"><span className="sr-only">{t('staff.actions')}</span></th></tr></thead><tbody>
        {data.releases.map(r => <tr key={r.id} data-testid={`fw-row-${r.id}`} data-status={r.status}>
          <td data-label={t('fw.col.version')}><strong>{r.version}</strong>{r.revision && <small className="ps-sub"> · {t('fw.revision')} {r.revision}</small>}{r.notes && <small className="ps-sub fw-row-notes">{r.notes}</small>}</td>
          <td data-label={t('fw.col.model')}>{MODELS.find(m => m.value === r.model)?.label ?? r.model} · {r.arch}</td>
          <td data-label={t('fw.col.file')}><span className="fw-filename">{r.filename}</span><small className="ps-sub">{size(r.size_bytes)}</small></td>
          <td data-label="SHA-256"><code className="fw-hash" data-testid={`fw-sha-${r.id}`}>{r.sha256 ?? t('notProvided')}</code></td>
          <td data-label={t('fw.col.state')}>{r.status === 'ready'
            ? <span className={`server-status ${r.installed_count > 0 ? 'server-online' : 'server-pending'}`} data-testid={`fw-state-${r.id}`}><span className="badge-dot"/>{t('fw.loaded')} · {installedCount(r)}</span>
            : <span className="server-status server-revoked" data-testid={`fw-state-${r.id}`}><span className="badge-dot"/>{t('fw.rejected')}</span>}</td>
          <td data-label={t('fw.col.uploaded')}>{r.created_at ? <time dateTime={r.created_at}>{dateFormatter.format(new Date(r.created_at))}</time> : t('notProvided')}{r.uploaded_by_email && <small className="ps-sub">{r.uploaded_by_email}</small>}</td>
          <td data-label={t('staff.actions')}>{r.status === 'ready' && <button type="button" className="button button-secondary" data-testid={`fw-download-${r.id}`} onClick={() => void download(r.id)}><Download size={15}/>{t('fw.download')}</button>}</td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
