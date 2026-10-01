import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, Check, Clock3, Copy, Download, FileKey2, Gauge, Globe2, Hash, KeyRound, ListOrdered, Network, Pause, Pencil, Play, Plus, Printer, Radar, Server, StickyNote, Tag, Trash2, X } from 'lucide-react';
import { fleetState, formatUptime, normalizeMac, relativeTime, sameMac, type FleetRow } from '../lib/printFleet';
import { psErrorKey, type PanelPrinter, type PanelScan, type PanelState, type PrintServerApi } from '../lib/printServerApi';
import { slugLabel } from '../lib/identity';
import { useLocale } from '../locales';
import { fleetStateClass } from './PrintFleetPage';
import { PortalDialog } from '../components/PortalDialog';

type Venue = Pick<FleetRow, 'venue_id' | 'venue_name' | 'venue_slug' | 'venue_is_active'>;
type Props = { venue: Venue; state: PanelState; api: PrintServerApi; refresh: () => Promise<unknown>; stale?: boolean };
// A confirmed step answers with its result message, or with a follow-up confirmation.
type Confirm = { title: string; body: string; detail?: ReactNode; danger?: boolean; run: () => Promise<string | Confirm> };
type Result = { ok: boolean; text: string };
type PrinterForm = { label: string; mac_address: string; model: string; location: string };
const EMPTY_FORM: PrinterForm = { label: '', mac_address: '', model: '', location: '' };
const FINAL = ['done', 'failed', 'expired'];
const POLL_MS = 1500; const POLL_LIMIT_MS = 3 * 60 * 1000;
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text);

function Item({ icon, label, children, testId }: { icon: ReactNode; label: string; children: ReactNode; testId?: string }) {
  return <div className="detail-item"><span className="detail-item-icon" aria-hidden="true">{icon}</span><div><span className="detail-item-label">{label}</span><strong data-testid={testId}>{children}</strong></div></div>;
}

export function PrintServerDetailPage({ venue, state, api, refresh, stale = false }: Props) {
  const { locale, t } = useLocale();
  const server = state.print_server; const pendingEnrollment = state.pending_enrollment; const canManage = state.can_manage;
  const venueName = venue.venue_name; const venueId = state.venue_id;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // The one-time enrollment code lives only here: never in storage, the URL, the query cache or a log.
  const [enrollment, setEnrollment] = useState<{ code: string; expires_at: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [enrollLabel, setEnrollLabel] = useState('');
  const [certMissing, setCertMissing] = useState(false);
  const [scan, setScan] = useState<PanelScan | null>(null);
  const [polling, setPolling] = useState(false);
  const [scanTimedOut, setScanTimedOut] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PrinterForm>(EMPTY_FORM);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const alive = useRef(true);
  const labelInput = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const dateFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => setNow(Date.now()), [state]);
  useEffect(() => setCertMissing(false), [server?.id, server?.ca_cert_available]);
  useEffect(() => { if (formOpen) labelInput.current?.focus(); }, [formOpen]);

  function date(value: string | null, empty = t('notProvided')) {
    const time = value ? new Date(value) : null;
    return time && !Number.isNaN(time.getTime()) ? dateFormatter.format(time) : empty;
  }
  function signal(value: string | null) {
    const relative = relativeTime(value, now, locale);
    return relative ? `${relative} · ${date(value)}` : t('ps.never');
  }
  async function reload() { try { await refresh(); } catch { /* The periodic refetch reports a lasting failure. */ } }
  function ask(next: Confirm) { if (!busy) { setResult(null); setConfirm(next); } }
  async function accept() {
    const current = confirm;
    if (!current || busy) return;
    setBusy(true); setResult(null);
    let next: Confirm | null = null;
    try {
      const out = await current.run();
      if (typeof out === 'string') setResult({ ok: true, text: out }); else next = out;
    } catch (error) { setResult({ ok: false, text: t(psErrorKey(error)) }); }
    if (!alive.current) return;
    await reload();
    // Close only when controls are enabled again, so dialog focus can return.
    if (alive.current) { setBusy(false); setConfirm(next); }
  }

  // --- Print Server: assign / replace / revoke -------------------------------
  function askEnrollment() {
    const label = enrollLabel.trim();
    ask({ title: t(server ? 'ps.replace' : 'ps.assign'), danger: !!server,
      body: fill(t(server ? 'ps.confirm.replace' : 'ps.confirm.assign'), { venue: venueName }),
      run: async () => {
        const created = await api.createEnrollment(venueId, label);
        setCopied(false); setEnrollment({ code: created.enrollment_code, expires_at: created.expires_at }); setEnrollLabel('');
        return t('ps.result.enrollmentCreated');
      } });
  }
  function askRevoke() {
    if (!server) return;
    ask({ title: t('ps.revoke'), danger: true, body: fill(t('ps.confirm.revoke'), { venue: venueName, name: server.label || server.hostname || server.id }),
      run: async () => fill(t('ps.result.revoked'), { jobs: (await api.revokePrintServer(server.id)).jobs_cancelled }) });
  }
  async function copyCode() {
    if (!enrollment) return;
    try { await navigator.clipboard.writeText(enrollment.code); setCopied(true); } catch { setCopied(false); }
  }

  // --- Certificate (a read: no confirmation) ---------------------------------
  async function downloadCert() {
    if (busy) return;
    setBusy(true); setResult(null);
    try {
      const cert = await api.getCaCert(venueId);
      const url = URL.createObjectURL(new Blob([cert.pem], { type: 'application/x-pem-file' }));
      const link = document.createElement('a');
      link.href = url; link.download = cert.filename; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResult({ ok: true, text: fill(t('ps.result.certDownloaded'), { file: cert.filename }) });
    } catch (error) {
      const key = psErrorKey(error);
      if (key === 'ps.error.noCaCert') setCertMissing(true);
      setResult({ ok: false, text: t(key) });
    } finally { if (alive.current) setBusy(false); }
  }

  // --- Network scan -----------------------------------------------------------
  async function poll(commandId: string) {
    const deadline = Date.now() + POLL_LIMIT_MS;
    try {
      while (alive.current) {
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
        if (!alive.current) return;
        const command = await api.getCommand(commandId);
        if (!alive.current) return;
        setScan(command);
        if (FINAL.includes(command.status)) break;
        if (Date.now() >= deadline) { setScanTimedOut(true); break; }
      }
    } catch (error) { if (alive.current) setResult({ ok: false, text: t(psErrorKey(error)) }); }
    finally { if (alive.current) { setPolling(false); void reload(); } }
  }
  function askScan() {
    ask({ title: t('ps.scan.request'), body: fill(t('ps.confirm.scan'), { venue: venueName }),
      run: async () => {
        const requested = await api.requestScan(venueId);
        setScanTimedOut(false); setPolling(true);
        setScan({ command_id: requested.command_id, status: requested.status, created_at: null, expires_at: requested.expires_at, completed_at: null, result: null, error_code: null, error_detail: null });
        void poll(requested.command_id);
        return t(requested.already ? 'ps.result.scanAlready' : requested.ps_online ? 'ps.result.scanRequested' : 'ps.result.scanRequestedOffline');
      } });
  }

  // --- Printers ---------------------------------------------------------------
  function submitPrinter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { label: form.label.trim(), mac_address: form.mac_address.trim(), model: form.model.trim(), location: form.location.trim() };
    if (!input.label) { setResult({ ok: false, text: t('ps.error.labelRequired') }); return; }
    if (!normalizeMac(input.mac_address)) { setResult({ ok: false, text: t('ps.error.invalidMac') }); return; }
    ask({ title: t('ps.printers.add'), body: fill(t('ps.confirm.addPrinter'), { venue: venueName, name: input.label, mac: input.mac_address }),
      run: async () => {
        await api.addPrinter(venueId, input);
        setForm(EMPTY_FORM); setFormOpen(false);
        return fill(t('ps.result.printerAdded'), { name: input.label });
      } });
  }
  function prefill(mac: string | null, model: string | null) {
    setForm({ ...EMPTY_FORM, mac_address: mac ?? '', model: model ?? '' }); setFormOpen(true); setResult(null);
    labelInput.current?.focus();
  }
  function askRename(printer: PanelPrinter) {
    const label = (drafts[printer.id] ?? printer.label).trim();
    if (!label) { setResult({ ok: false, text: t('ps.error.labelRequired') }); return; }
    if (label === printer.label) { document.getElementById(`printer-rename-input-${printer.id}`)?.focus(); return; }
    ask({ title: t('ps.printers.rename'), body: fill(t('ps.confirm.rename'), { venue: venueName, name: printer.label, next: label }),
      run: async () => {
        await api.renamePrinter(printer.id, label);
        setDrafts(current => { const rest = { ...current }; delete rest[printer.id]; return rest; });
        return fill(t('ps.result.printerRenamed'), { name: label });
      } });
  }
  function askToggle(printer: PanelPrinter) {
    const active = !printer.is_active;
    ask({ title: t(active ? 'ps.printers.reactivate' : 'ps.printers.pause'), body: fill(t(active ? 'ps.confirm.reactivate' : 'ps.confirm.pause'), { venue: venueName, name: printer.label }),
      run: async () => { await api.setPrinterActive(printer.id, active); return fill(t(active ? 'ps.result.printerReactivated' : 'ps.result.printerPaused'), { name: printer.label }); } });
  }
  function askTest(printer: PanelPrinter) {
    ask({ title: t('ps.printers.test'), body: fill(t('ps.confirm.test'), { venue: venueName, name: printer.label }),
      run: async () => { await api.testPrint(printer.id); return fill(t('ps.result.testQueued'), { name: printer.label }); } });
  }
  function askRemove(printer: PanelPrinter) {
    const removed = () => fill(t('ps.result.printerRemoved'), { name: printer.label });
    ask({ title: t('ps.printers.remove'), danger: true, body: fill(t('ps.confirm.remove'), { venue: venueName, name: printer.label }),
      run: async () => {
        const first = await api.removePrinter(printer.id, false);
        if (first.removed) return removed();
        // Still in use: a second, explicit confirmation names what will be affected.
        return { title: t('ps.printers.removeForce'), danger: true,
          body: fill(t('ps.confirm.removeInUse'), { venue: venueName, name: printer.label, jobs: first.pending_jobs }),
          detail: <div data-testid="remove-in-use"><p className="ps-dialog-sub">{t('ps.printers.workstations')}</p>{first.workstations.length ? <ul className="ps-dialog-list">{first.workstations.map(item => <li key={item.id}>{item.name}</li>)}</ul> : <p className="ps-dialog-sub">{t('ps.none')}</p>}<p className="ps-dialog-sub">{t('ps.pendingJobs')}: <strong>{first.pending_jobs}</strong></p></div>,
          run: async () => { await api.removePrinter(printer.id, true); return removed(); } };
      } });
  }

  const status = fleetState({ print_server: server, pending_enrollment: pendingEnrollment });
  const lastStatus = server?.last_status ?? null;
  const totalPending = state.printers.reduce((sum, printer) => sum + printer.pending_jobs, 0);
  const shownScan = scan ?? state.last_scan;
  const scanStatus = scanTimedOut && shownScan && !FINAL.includes(shownScan.status) ? 'timeout' : shownScan?.status ?? null;
  const certAvailable = !!server?.ca_cert_available && !certMissing;
  const yesNo = (value: boolean | null) => value === null ? t('notProvided') : t(value ? 'ps.yes' : 'ps.no');

  return <div className="page-stack staff-page" data-testid="ps-detail">
    <Link className="back-link" to="/admin/print-servers"><ArrowLeft size={17}/>{t('ps.back')}</Link>
    <div className="page-heading detail-heading"><div><p className="eyebrow">{t('ps.detailEyebrow')}</p><h1 data-testid="ps-venue-name">{venueName}</h1><p>{venue.venue_slug || t('notProvided')}{venue.venue_is_active === false && ` · ${t('ps.venueInactive')}`}</p></div><span className={`server-status ${fleetStateClass[status]}`} data-testid="ps-state" data-state={status}><span className="badge-dot"/>{t(`ps.state.${status}`)}</span></div>
    <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="action-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>
    {stale && <div className="form-error" role="alert"><AlertTriangle size={19}/><span>{t('ps.stale')}</span></div>}
    {!canManage && <div className="staff-self-note" data-testid="ps-read-only">{t('ps.readOnly')}</div>}

    <section className="detail-panel" aria-labelledby="ps-card-title"><div className="section-heading"><div><p className="eyebrow">{t('printServer')}</p><h2 id="ps-card-title">{t('ps.cardTitle')}</h2></div><span className="section-icon"><Server size={20}/></span></div>
      {server ? <div className="detail-grid">
        <Item icon={<Activity size={19}/>} label={t('state')}>{t(`ps.state.${status}`)}</Item>
        <Item icon={<Tag size={19}/>} label={t('ps.label')}>{server.label || t('notProvided')}</Item>
        <Item icon={<Hash size={19}/>} label={t('version')} testId="ps-version">{server.software_version || t('notProvided')}</Item>
        <Item icon={<KeyRound size={19}/>} label={t('ps.deviceId')}>{server.device_id || t('notProvided')}</Item>
        <Item icon={<Server size={19}/>} label={t('ps.hostname')}>{server.hostname || t('notProvided')}</Item>
        <Item icon={<Network size={19}/>} label={t('ps.localAddress')}>{server.local_address ? `${server.local_address}${server.local_port !== null ? `:${server.local_port}` : ''}` : t('notProvided')}</Item>
        <Item icon={<Clock3 size={19}/>} label={t('ps.enrolledAt')}>{date(server.enrolled_at)}</Item>
        <Item icon={<Clock3 size={19}/>} label={t('lastSignal')}>{signal(server.last_seen_at)}</Item>
      </div> : <div className="inline-empty servers-empty"><Server size={25}/>{t(pendingEnrollment ? 'ps.noServerPending' : 'ps.noServer')}<span className="sr-only" data-testid="ps-version">{t('notProvided')}</span></div>}
      <div className="ps-section-body">
        {pendingEnrollment && <p className="staff-notice ps-pending" data-testid="ps-enrollment-pending"><Clock3 size={18}/><span>{fill(t('ps.enrollmentPendingUntil'), { time: date(pendingEnrollment.expires_at) })}{pendingEnrollment.label ? ` · ${pendingEnrollment.label}` : ''}</span></p>}
        {canManage && <div className="staff-actions ps-actions">
          <label className="field ps-inline-field"><span>{t('ps.enrollLabel')}</span><div className="field-control"><input type="text" data-testid="ps-assign-label" autoComplete="off" maxLength={80} value={enrollLabel} onChange={event => setEnrollLabel(event.target.value)} placeholder={t('ps.enrollLabelPlaceholder')} disabled={busy}/></div></label>
          <button type="button" className="button button-primary" data-testid="ps-assign" disabled={busy} onClick={askEnrollment}><Plus size={17}/>{t(server ? 'ps.replace' : 'ps.assign')}</button>
          {server && <button type="button" className="button button-secondary ps-danger" data-testid="ps-revoke" disabled={busy} onClick={askRevoke}><X size={17}/>{t('ps.revoke')}</button>}
        </div>}
      </div>
    </section>

    <section className="detail-panel" aria-labelledby="ps-cert-title"><div className="section-heading"><div><p className="eyebrow">{t('ps.cert.eyebrow')}</p><h2 id="ps-cert-title">{t('ps.cert.title')}</h2></div><span className="section-icon"><FileKey2 size={20}/></span></div>
      <div className="detail-grid">
        <Item icon={<FileKey2 size={19}/>} label={t('ps.cert.fingerprint')} testId="ps-cert-fingerprint"><span className="ps-mono">{server?.ca_cert_fingerprint && certAvailable ? server.ca_cert_fingerprint : t('ps.cert.notReported')}</span></Item>
        <Item icon={<Clock3 size={19}/>} label={t('ps.cert.updated')}>{date(certAvailable ? server?.ca_cert_updated_at ?? null : null)}</Item>
      </div>
      <div className="ps-section-body"><div className="staff-actions ps-actions">
        <button type="button" className="button button-secondary" data-testid="ps-cert-download" disabled={busy || !certAvailable} onClick={() => void downloadCert()}><Download size={17}/>{t('ps.cert.download')}</button>
        <span className="staff-self-note">{t(certAvailable ? 'ps.cert.publicOnly' : 'ps.cert.notReported')}</span>
      </div></div>
    </section>

    <section className="detail-panel" aria-labelledby="ps-diag-title"><div className="section-heading"><div><p className="eyebrow">{t('ps.diag.eyebrow')}</p><h2 id="ps-diag-title">{t('ps.diag.title')}</h2></div><span className="section-icon"><Gauge size={20}/></span></div>
      <div className="detail-grid">
        <Item icon={<Clock3 size={19}/>} label={t('ps.diag.lastStatusAt')}>{date(server?.last_status_at ?? null)}</Item>
        <Item icon={<Activity size={19}/>} label={t('ps.diag.uptime')}>{formatUptime(lastStatus?.uptime_seconds ?? null) ?? t('notProvided')}</Item>
        <Item icon={<ListOrdered size={19}/>} label={t('ps.queueDepth')} testId="ps-queue-depth">{lastStatus?.queue_depth ?? t('notProvided')}</Item>
        <Item icon={<ListOrdered size={19}/>} label={t('ps.pendingJobs')} testId="ps-pending-jobs">{totalPending}</Item>
        <Item icon={<Globe2 size={19}/>} label={t('ps.diag.portalUrl')}><span className="ps-mono">{lastStatus?.portal_url || t('notProvided')}</span></Item>
        <Item icon={<Clock3 size={19}/>} label={t('ps.diag.channelOpenedAt')}>{date(server?.channel_opened_at ?? null)}</Item>
        <Item icon={<StickyNote size={19}/>} label={t('ps.diag.note')}>{lastStatus?.note || t('notProvided')}</Item>
      </div>
      {state.printers.length > 0 && <div className="ps-section-body"><p className="detail-item-label">{t('ps.diag.pendingByPrinter')}</p><ul className="ps-queue-list">{state.printers.map(printer => <li key={printer.id} data-testid={`printer-queue-${printer.id}`}><span>{printer.label}</span><strong>{printer.pending_jobs}</strong></li>)}</ul></div>}
    </section>

    <section className="staff-panel" aria-labelledby="ps-scan-title"><div className="section-heading"><div><p className="eyebrow">{t('ps.scan.eyebrow')}</p><h2 id="ps-scan-title">{t('ps.scan.title')}</h2></div><span className="section-icon"><Radar size={20}/></span></div>
      <p className="staff-panel-lead">{t('ps.scan.lead')}</p>
      <div className="staff-actions ps-actions">
        {canManage && <button type="button" className="button button-primary" data-testid="ps-scan" disabled={busy || polling || !server} onClick={askScan}><Radar size={17}/>{t(polling ? 'ps.scan.running' : 'ps.scan.request')}</button>}
        <span className="staff-role" data-testid="ps-scan-status" data-status={scanStatus ?? 'none'}>{polling && !scanTimedOut && <span className="spinner ps-spinner"/>}{t('ps.scan.statusLabel')}: {scanStatus ? slugLabel(t, 'ps.scan.status', scanStatus) : t('ps.scan.status.none')}</span>
        {shownScan && <span className="staff-self-note">{date(shownScan.result?.scanned_at ?? shownScan.completed_at ?? shownScan.created_at, '')}{shownScan.result?.network ? ` · ${shownScan.result.network}` : ''}</span>}
      </div>
      {shownScan && (shownScan.error_code || shownScan.error_detail) && <div className="form-error ps-scan-error" data-testid="ps-scan-error"><AlertTriangle size={19}/><span>{[shownScan.error_code, shownScan.error_detail].filter(Boolean).join(' — ')}</span></div>}
      {shownScan?.result && (shownScan.result.candidates.length === 0 ? <div className="staff-empty" data-testid="scan-empty"><Radar size={27}/><span>{t('ps.scan.noCandidates')}</span></div> : <div className="staff-table-wrap"><table className="staff-table ps-scan-table"><thead><tr><th>{t('ps.printers.model')}</th><th>{t('ps.printers.mac')}</th><th>{t('ps.localAddress')}</th><th>{t('ps.scan.reachable')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{shownScan.result.candidates.map((candidate, index) => {
        const mac = candidate.mac_address; const key = mac ?? `unknown-${index}`;
        const registered = !!candidate.printer_id || state.printers.some(printer => sameMac(printer.mac_address, mac));
        return <tr key={key} data-testid={`scan-candidate-${key}`}>
          <td data-label={t('ps.printers.model')} className="staff-identity"><strong>{candidate.model || t('ps.scan.unknownModel')}</strong>{candidate.hostname && <small>{candidate.hostname}</small>}</td>
          <td data-label={t('ps.printers.mac')}><span className="ps-mono">{mac || t('notProvided')}</span></td>
          <td data-label={t('ps.localAddress')}><span className="ps-mono">{candidate.local_address ? `${candidate.local_address}${candidate.port !== null ? `:${candidate.port}` : ''}` : t('notProvided')}</span></td>
          <td data-label={t('ps.scan.reachable')}>{yesNo(candidate.reachable)}</td>
          <td data-label={t('staff.actions')}>{registered ? <span className="staff-self-note" data-testid={`scan-registered-${key}`}>{t('ps.scan.alreadyRegistered')}</span> : canManage && mac ? <button type="button" className="staff-action-link" data-testid={`scan-add-${mac}`} disabled={busy} onClick={() => prefill(mac, candidate.model)}><Plus size={14}/>{t('ps.scan.add')}</button> : null}</td>
        </tr>;
      })}</tbody></table></div>)}
    </section>

    <section className="staff-panel" aria-labelledby="ps-printers-title"><div className="section-heading"><div><p className="eyebrow">{t('ps.printers.eyebrow')}</p><h2 id="ps-printers-title">{t('ps.printers.title')}</h2></div><span className="count-pill">{state.printers.length}</span></div>
      <p className="staff-panel-lead">{t('ps.printers.lead')}</p>
      {canManage && <div className="staff-actions ps-actions"><button type="button" className="button button-secondary" data-testid="printer-add" aria-expanded={formOpen} disabled={busy} onClick={() => { setFormOpen(!formOpen); if (formOpen) setForm(EMPTY_FORM); }}>{formOpen ? <X size={17}/> : <Plus size={17}/>}{t(formOpen ? 'ps.printers.cancelAdd' : 'ps.printers.add')}</button></div>}
      {canManage && formOpen && <form className="staff-invite-form ps-printer-form" data-testid="printer-form" onSubmit={submitPrinter} noValidate>
        <label className="field"><span>{t('ps.printers.name')} *</span><div className="field-control"><input ref={labelInput} type="text" data-testid="printer-form-label" autoComplete="off" maxLength={80} value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} disabled={busy} required/></div></label>
        <label className="field"><span>{t('ps.printers.mac')} *</span><div className="field-control"><input type="text" data-testid="printer-form-mac" autoComplete="off" maxLength={17} value={form.mac_address} onChange={event => setForm({ ...form, mac_address: event.target.value })} placeholder="AA:BB:CC:DD:EE:FF" disabled={busy} required/></div></label>
        <label className="field"><span>{t('ps.printers.model')}</span><div className="field-control"><input type="text" data-testid="printer-form-model" autoComplete="off" maxLength={80} value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} disabled={busy}/></div></label>
        <label className="field"><span>{t('ps.printers.location')}</span><div className="field-control"><input type="text" data-testid="printer-form-location" autoComplete="off" maxLength={80} value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} disabled={busy}/></div></label>
        <button type="submit" className="button button-primary" data-testid="printer-form-submit" disabled={busy}><Plus size={17}/>{t('ps.printers.addSubmit')}</button>
      </form>}
      {state.printers.length === 0 ? <div className="staff-empty" data-testid="printers-empty"><Printer size={27}/><strong>{t('ps.printers.empty')}</strong></div> : <div className="staff-table-wrap"><table className="staff-table ps-printers-table"><thead><tr><th>{t('ps.printers.name')}</th><th>{t('ps.printers.mac')}</th><th>{t('state')}</th><th>{t('ps.printers.lastReport')}</th><th>{t('ps.printers.lastError')}</th><th>{t('ps.pendingJobs')}</th><th>{t('ps.printers.workstations')}</th>{canManage && <th>{t('staff.actions')}</th>}</tr></thead><tbody>{state.printers.map(printer => {
        const report = printer.last_report; const reportAt = report?.reported_at ?? printer.last_report_at;
        const error = printer.last_error || report?.error || null;
        return <tr key={printer.id} data-testid={`printer-row-${printer.id}`} data-active={String(printer.is_active)}>
          <td data-label={t('ps.printers.name')} className="staff-identity"><strong data-testid={`printer-label-${printer.id}`}>{printer.label || t('notProvided')}</strong><small>{printer.model || t('ps.scan.unknownModel')}{printer.location ? ` · ${printer.location}` : ''}</small></td>
          <td data-label={t('ps.printers.mac')}><span className="ps-mono">{printer.mac_address || t('notProvided')}</span></td>
          <td data-label={t('state')}><span className={`status-badge ${printer.is_active ? 'status-active' : 'status-inactive'}`} data-testid={`printer-state-${printer.id}`}><span className="badge-dot"/>{t(printer.is_active ? 'ps.printers.active' : 'ps.printers.paused')}</span></td>
          <td data-label={t('ps.printers.lastReport')}>{report || reportAt ? <><span>{report?.state || t('notProvided')} · {t('ps.scan.reachable')}: {yesNo(report?.reachable ?? null)}</span><small className="ps-sub">{date(reportAt)}{report?.local_address ? ` · ${report.local_address}` : ''}</small></> : <span className="staff-self-note">{t('ps.never')}</span>}</td>
          <td data-label={t('ps.printers.lastError')}>{error ? <span className="ps-error-text">{error}</span> : <span className="staff-self-note">{t('ps.none')}</span>}</td>
          <td data-label={t('ps.pendingJobs')}><strong>{printer.pending_jobs}</strong></td>
          <td data-label={t('ps.printers.workstations')}>{printer.workstations.length ? printer.workstations.map(item => item.name).join(', ') : <span className="staff-self-note">{t('ps.none')}</span>}</td>
          {canManage && <td data-label={t('staff.actions')} className="staff-actions-cell"><div className="staff-actions">
            <input className="ps-rename-input" id={`printer-rename-input-${printer.id}`} data-testid={`printer-rename-input-${printer.id}`} type="text" aria-label={`${t('ps.printers.rename')}: ${printer.label}`} maxLength={80} value={drafts[printer.id] ?? printer.label} disabled={busy}
              onChange={event => setDrafts({ ...drafts, [printer.id]: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); askRename(printer); } }}/>
            <button type="button" className="staff-action-link" data-testid={`printer-rename-${printer.id}`} disabled={busy} onClick={() => askRename(printer)}><Pencil size={14}/>{t('ps.printers.rename')}</button>
            <button type="button" className="staff-action-link" data-testid={`printer-toggle-${printer.id}`} disabled={busy} onClick={() => askToggle(printer)}>{printer.is_active ? <Pause size={14}/> : <Play size={14}/>}{t(printer.is_active ? 'ps.printers.pause' : 'ps.printers.reactivate')}</button>
            <button type="button" className="staff-action-link" data-testid={`printer-test-${printer.id}`} disabled={busy} onClick={() => askTest(printer)}><Printer size={14}/>{t('ps.printers.test')}</button>
            <button type="button" className="staff-action-link danger" data-testid={`printer-remove-${printer.id}`} disabled={busy} onClick={() => askRemove(printer)}><Trash2 size={14}/>{t('ps.printers.remove')}</button>
          </div></td>}
        </tr>;
      })}</tbody></table></div>}
    </section>

    {confirm && <PortalDialog title={confirm.title} titleId="ps-confirm-title" descriptionId="ps-confirm-body" testId="confirm-dialog" alert onClose={() => setConfirm(null)} dismissible={!busy} actions={<>
        <button type="button" className={`button button-primary ${confirm.danger ? 'ps-danger-solid' : ''}`} data-testid="confirm-accept" disabled={busy} onClick={() => void accept()}><Check size={15}/>{t(busy ? 'ps.working' : 'staff.confirm')}</button>
        <button type="button" className="button button-secondary" data-testid="confirm-cancel" disabled={busy} onClick={() => setConfirm(null)}><X size={15}/>{t('staff.cancel')}</button>
      </>}>
      <p className="ps-dialog-venue">{t('ps.confirm.venue')}: <strong>{venueName}</strong></p>
      <p id="ps-confirm-body" data-testid="confirm-text">{confirm.body}</p>
      {confirm.detail}
    </PortalDialog>}

    {enrollment && !confirm && <PortalDialog title={t('ps.enrollment.title')} titleId="ps-enrollment-title" testId="enrollment-dialog" onClose={() => { setEnrollment(null); setCopied(false); }} actions={<>
        <button type="button" className="button button-primary" data-testid="enrollment-copy" onClick={() => void copyCode()}><Copy size={15}/>{t(copied ? 'ps.enrollment.copied' : 'ps.enrollment.copy')}</button>
        <button type="button" className="button button-secondary" data-testid="enrollment-close" onClick={() => { setEnrollment(null); setCopied(false); }}><X size={15}/>{t('ps.enrollment.close')}</button>
      </>}>
      <p className="ps-dialog-venue">{t('ps.confirm.venue')}: <strong>{venueName}</strong></p>
      <p>{t('ps.enrollment.lead')}</p>
      <code className="ps-code" data-testid="enrollment-code">{enrollment.code}</code>
      <p className="ps-dialog-sub" data-testid="enrollment-expires">{fill(t('ps.enrollment.expires'), { time: date(enrollment.expires_at) })}</p>
      <p className="ps-dialog-warning"><AlertTriangle size={16}/>{t('ps.enrollment.once')}</p>
    </PortalDialog>}
  </div>;
}
