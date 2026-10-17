import { useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Printer } from 'lucide-react';
import type { AdminDeviceSheet } from '../lib/psAdminDeviceSheet';
import { generateLabelPng, labelFilename, printLabel, type LabelData } from '../lib/psLabel';
import { useLocale } from '../locales';
import { InventoryDeviceIdentity } from './InventoryDeviceIdentity';
import { PsLinkStateBadge } from './PsLinkStateBadge';
import { PS_LINK_STATES, type PsLinkState } from '../lib/psLink';
import './InventoryDeviceSheet.css';

type Props = { sheet: AdminDeviceSheet; compact?: boolean };
type Item = { key: string; primary: string; secondary?: string | null; date?: string | null; facts?: (string | null | undefined)[] };

export function InventoryDeviceSheet({ sheet, compact = false }: Props) {
  const { t, locale } = useLocale();
  const [showPsk, setShowPsk] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [preview, setPreview] = useState<{ url: string; identity: string } | null>(null);
  const currentIdentity = useRef<string | null>(null);
  const labelRequest = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [labelError, setLabelError] = useState(false);
  const device = sheet.device;
  const wifi = sheet.credentials.wifi;
  const adminCode = sheet.credentials.admin_code;
  const label: LabelData | null = sheet.label.ready && sheet.label.label && wifi &&
    sheet.label.label.device_id === device.id && sheet.label.label.serial === device.serial &&
    sheet.label.label.ssid === wifi.ssid && sheet.label.label.psk === wifi.psk &&
    sheet.label.label.wifi_applied_at === wifi.applied_at
    ? { deviceId: device.id, serial: device.serial, ssid: wifi.ssid, password: wifi.psk, appliedAt: wifi.applied_at }
    : null;
  const labelIdentity = label ? JSON.stringify([label.deviceId, label.serial, label.ssid, label.password, label.appliedAt]) : null;
  currentIdentity.current = labelIdentity;

  useEffect(() => {
    labelRequest.current?.abort();
    setBusy(false); setShowPsk(false); setShowCode(false); setPreview(null); setLabelError(false);
  }, [device.id, wifi?.applied_at, adminCode?.applied_at, labelIdentity]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => () => { currentIdentity.current = null; labelRequest.current?.abort(); }, []);

  const date = (value: string | null | undefined) => value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : t('notProvided');
  const reason = (value: string | null | undefined) => {
    if (!value) return t('stockSheet.empty');
    const key = `stockSheet.reason.${value}`;
    const translated = t(key);
    return translated === key ? t('stockSheet.empty') : translated;
  };
  const facts = (...values: (string | number | null | undefined)[]) => values.filter((value) => value !== null && value !== undefined && value !== '').map(String);

  async function labelAction(action: 'preview' | 'download' | 'print') {
    if (!label || !labelIdentity || busy) return;
    const actionIdentity = labelIdentity;
    const controller = new AbortController();
    labelRequest.current?.abort(); labelRequest.current = controller;
    setBusy(true); setLabelError(false);
    try {
      const blob = await generateLabelPng(label);
      if (controller.signal.aborted || currentIdentity.current !== actionIdentity) return;
      if (action === 'print') await printLabel(blob, controller.signal);
      else if (action === 'download') {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = labelFilename(label);
        anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } else setPreview({ url: URL.createObjectURL(blob), identity: actionIdentity });
    } catch { if (!controller.signal.aborted) setLabelError(true); }
    finally { if (labelRequest.current === controller) setBusy(false); }
  }

  const printers: Item[] = sheet.printers.items.map((item, index) => ({ key: item.id || `printer-${index}`, primary: item.label || item.model || item.id || t('notProvided'), secondary: item.model, date: item.last_seen_at, facts: facts(item.location, item.is_active ? t('active') : t('inactive')) }));
  const scans: Item[] = sheet.scans.items.map((item, index) => ({ key: item.command_id || `scan-${index}`, primary: item.status || t('notProvided'), secondary: item.print_server_id, date: item.completed_at || item.requested_at, facts: facts(item.printers_found, item.error_code) }));
  const jobs: Item[] = sheet.jobs.recent.map((item, index) => ({ key: item.id || `job-${index}`, primary: item.status || t('notProvided'), secondary: item.source_type, date: item.completed_at || item.created_at, facts: facts(item.printer_id, item.venue_id, item.attempts) }));
  const operations: Item[] = sheet.operations.map((item, index) => ({ key: item.command_id || `operation-${index}`, primary: item.command_type || t('notProvided'), secondary: item.status, date: item.completed_at || item.requested_at, facts: facts(item.error_code) }));
  const ota: Item[] = sheet.ota.map((item, index) => ({ key: item.target_id || `ota-${index}`, primary: item.desired_version || t('notProvided'), secondary: item.status, date: item.updated_at || item.issued_at, facts: facts(item.from_version, item.installed_version, item.phase, item.error_code) }));
  const assignments: Item[] = sheet.assignments.map((item, index) => ({ key: item.print_server_id || `assignment-${index}`, primary: item.venue_name || item.venue_id || t('notProvided'), secondary: item.status, date: item.revoked_at || item.enrolled_at || item.created_at, facts: facts(item.print_server_id, item.revoked_reason, item.software_version) }));
  const audit: Item[] = sheet.audit.map((item, index) => ({ key: item.id || `audit-${index}`, primary: item.action || t('notProvided'), secondary: item.status, date: item.created_at, facts: facts(item.venue_name, item.reason, item.error, item.print_server_id) }));

  function historySection(id: string, title: string, items: Item[], emptyReason?: string | null, lead?: string) {
    return <section className="stock-sheet-section" aria-labelledby={`stock-${id}`} data-testid={`stock-sheet-${id}`}>
      <h2 id={`stock-${id}`}>{t(title)}</h2>
      {lead && <p className="stock-sheet-lead">{lead}</p>}
      {items.length ? <ol className="stock-sheet-records">{items.map(item => <li key={item.key}>
        <div className="stock-sheet-record-head"><strong>{item.primary}</strong>{item.secondary && <span>{item.secondary}</span>}</div>
        {item.date && <time dateTime={item.date}>{date(item.date)}</time>}
        {!!item.facts?.length && <div className="stock-sheet-record-facts">{item.facts.filter(Boolean).map((fact, index) => <span key={`${item.key}-${index}`} className="ps-mono">{fact}</span>)}</div>}
      </li>)}</ol> : <p className="stock-sheet-empty">{reason(emptyReason)}</p>}
    </section>;
  }

  return <div className="stock-sheet" data-testid="inventory-device-sheet">
    {!compact && <><header className="stock-sheet-header"><div><p className="stock-sheet-eyebrow">{t('psm.sheetEyebrow')}</p><h1>{t('stockSheet.title')}</h1><p>{t('stockSheet.historyLead')}</p></div></header>
    <section className="stock-sheet-section" aria-label={t('psm.sheetEyebrow')}>
      <InventoryDeviceIdentity device={{ ...device, serial: device.serial || t('notProvided'), hostname: device.hostname || t('notProvided'), model: device.model || t('notProvided'), arch: device.arch || t('notProvided'), venue_id: sheet.link.venue_id, venue_name: sheet.link.venue_name }} />
    </section></>}
    <div className="stock-sheet-grid">
      {!compact && <section className="stock-sheet-section" aria-labelledby="stock-link"><h2 id="stock-link">{t('stockSheet.link')}</h2>
        {sheet.link.state === 'none' ? <p className="stock-sheet-empty">{reason(sheet.link.reason)}</p> : <dl className="dev-facts"><div><dt>{t('stockSheet.venue')}</dt><dd>{sheet.link.venue_name || t('stockSheet.noCurrentVenue')}</dd></div><div><dt>{t('stockSheet.server')}</dt><dd className="ps-mono">{sheet.link.print_server_id || t('notProvided')}</dd></div><div><dt>{t('stockSheet.status')}</dt><dd>{(PS_LINK_STATES as readonly string[]).includes(sheet.link.state) ? <PsLinkStateBadge state={sheet.link.state as PsLinkState}/> : sheet.link.state}</dd></div></dl>}
      </section>}
      {!compact && <section className="stock-sheet-section" aria-labelledby="stock-firmware"><h2 id="stock-firmware">{t('stockSheet.firmware')}</h2>
        {sheet.firmware.last_reported_version ? <dl className="dev-facts"><div><dt>{t('stockSheet.lastReported')}</dt><dd className="ps-mono">{sheet.firmware.last_reported_version}</dd></div><div><dt>{t('stockSheet.lastSeen')}</dt><dd>{date(sheet.firmware.last_seen_at)}</dd></div></dl> : <p className="stock-sheet-empty">{reason(sheet.firmware.reason)}</p>}
        {!sheet.firmware.is_current && sheet.firmware.last_reported_version && <p className="stock-sheet-lead">{t('stockSheet.historical')}</p>}
      </section>}
    </div>
    <section className="stock-sheet-section" id="ps469-wifi" aria-labelledby="stock-credentials"><h2 id="stock-credentials">{t('stockSheet.credentials')}</h2>
      <dl className="dev-credential-grid">
        <div className="dev-credential-field dev-credential-full"><dt>{t('dev.ssid')}</dt><dd className="ps-mono dev-credential-value">{wifi?.ssid || reason(sheet.credentials.wifi_reason)}</dd></div>
        <div className="dev-credential-field"><dt>{t('dev.psk')}</dt><dd className="dev-secret">{wifi ? <><span className="ps-mono dev-credential-value" tabIndex={showPsk ? 0 : -1}>{showPsk ? wifi.psk : '••••••••••'}</span><button className="icon-button" type="button" aria-label={t(showPsk ? 'stockSheet.hide' : 'stockSheet.reveal')} aria-pressed={showPsk} onClick={() => setShowPsk(value => !value)}>{showPsk ? <EyeOff size={16}/> : <Eye size={16}/>}</button></> : reason(sheet.credentials.wifi_reason)}</dd></div>
        <div className="dev-credential-field"><dt>{t('dev.adminCode')}</dt><dd className="dev-secret">{adminCode ? <><span className="ps-mono dev-credential-value" tabIndex={showCode ? 0 : -1}>{showCode ? adminCode.code : '•••••-•••••'}</span><button className="icon-button" type="button" aria-label={t(showCode ? 'stockSheet.hide' : 'stockSheet.reveal')} aria-pressed={showCode} onClick={() => setShowCode(value => !value)}>{showCode ? <EyeOff size={16}/> : <Eye size={16}/>}</button></> : reason(sheet.credentials.admin_code_reason)}</dd></div>
        {wifi?.applied_at && <div className="dev-credential-field"><dt>{t('dev.ssid')} · {t('stockSheet.confirmedAt')}</dt><dd>{date(wifi.applied_at)}</dd></div>}
        {adminCode?.applied_at && <div className="dev-credential-field"><dt>{t('dev.adminCode')} · {t('stockSheet.confirmedAt')}</dt><dd>{date(adminCode.applied_at)}</dd></div>}
      </dl>
      {sheet.credentials.pending_change && <p className="stock-sheet-lead">{t('stockSheet.pendingHidden')}</p>}
    </section>
    <section className="stock-sheet-section" aria-labelledby="stock-label"><h2 id="stock-label">{t('stockSheet.label')}</h2>
      {label ? <><p className="stock-sheet-lead">{t('dev.label.lead')} {t('dev.label.printHint')}</p><div className="staff-actions dev-label-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void labelAction('preview')}><Eye size={15}/>{t('stockSheet.preview')}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void labelAction('download')}><Download size={15}/>{t('stockSheet.download')}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void labelAction('print')}><Printer size={15}/>{t('stockSheet.print')}</button>
      </div></> : <p className="stock-sheet-empty">{sheet.label.missing.length ? sheet.label.missing.map(reason).join(' ') : t('stockSheet.labelUnavailable')}</p>}
      {busy && <p role="status">{t('ps.working')}</p>}{labelError && <p role="alert">{t('stockSheet.labelError')}</p>}
      {preview && preview.identity === labelIdentity && label && <figure className="dev-label-preview"><img src={preview.url} alt={t('dev.label.previewAlt')} width={590} height={354}/><figcaption>{t('dev.label.printHint')}</figcaption><button type="button" className="button button-secondary" onClick={() => setPreview(null)}><EyeOff size={15}/>{t('stockSheet.hidePreview')}</button></figure>}
    </section>
    <div className="stock-sheet-grid">
      {historySection('printers', 'stockSheet.printers', printers, sheet.printers.reason)}
      {historySection('scans', 'stockSheet.scans', scans, sheet.scans.reason)}
      {historySection('jobs', 'stockSheet.jobs', jobs, sheet.jobs.reason, `${t('stockSheet.count')}: ${sheet.jobs.total}`)}
      <section className="stock-sheet-section" aria-labelledby="stock-cert"><h2 id="stock-cert">{t('stockSheet.cert')}</h2>
        {sheet.cert.status === 'none' ? <p className="stock-sheet-empty">{reason(sheet.cert.reason)}</p> : <dl className="dev-facts"><div><dt>{t('stockSheet.status')}</dt><dd>{sheet.cert.status}</dd></div><div><dt>{t('ps.hostname')}</dt><dd className="ps-mono">{sheet.cert.hostname}</dd></div><div><dt>{t('stockSheet.date')}</dt><dd>{date(sheet.cert.not_after)}</dd></div></dl>}
      </section>
      {historySection('operations', 'stockSheet.operations', operations)}
      {historySection('ota', 'stockSheet.ota', ota)}
      {historySection('assignments', 'stockSheet.assignments', assignments)}
      {historySection('audit', 'stockSheet.audit', audit)}
    </div>
  </div>;
}
