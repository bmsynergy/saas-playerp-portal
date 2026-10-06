import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Copy, Cpu, Plus, Send, X } from 'lucide-react';
import { assignDevice, createDevice, revokeDevice, type InventoryDevice } from '../lib/psDevice';
import { psErrorKey } from '../lib/printServerApi';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { PrintServersTabs } from './PrintFirmwaresPage';

// Platform inventory of Print Server units (PE-384). Serial and hostname are issued by the
// platform; assigning issues a one-use activation code that is shown once and stored only as a
// hash. Every assignment, replacement and revocation is audited by the backend.
type Props = { devices: InventoryDevice[]; venues: OwnerVenue[]; onChanged: () => Promise<unknown> };
type Result = { ok: boolean; text: string };

export function PrintDevicesPage({ devices, venues, onChanged }: Props) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [code, setCode] = useState<{ serial: string; venue: string; code: string; expires_at: string | null; replaces: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const date = useMemo(() => { const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); return (v: string | null) => v ? f.format(new Date(v)) : t('notProvided'); }, [locale, t]);
  const sortedVenues = useMemo(() => [...venues].sort((a, b) => a.name.localeCompare(b.name)), [venues]);

  async function run<T>(fn: () => Promise<T>, ok: (value: T) => string | null) {
    setBusy(true); setResult(null);
    try { const value = await fn(); const text = ok(value); if (text) setResult({ ok: true, text }); }
    catch (error) { const key = psErrorKey(error); setResult({ ok: false, text: t(key) === key ? t('dev.error.other') : t(key) }); }
    finally { setBusy(false); await onChanged(); }
  }

  return <div className="page-stack staff-page" data-testid="devices-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('inv.title')}</h1><p>{t('inv.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Cpu size={30}/></div></div>
    <PrintServersTabs/>
    <section className="servers-panel" aria-labelledby="inv-list-title">
      <div className="section-heading"><div><p className="eyebrow">{t('inv.eyebrow')}</p><h2 id="inv-list-title">{t('inv.listTitle')}</h2></div>
        <button type="button" className="button button-primary" data-testid="inv-create" disabled={busy} onClick={() => void run(() => createDevice('rpi4-2gb'), v => t('inv.created').replace('{serial}', String((v.device as { serial?: string })?.serial ?? '')))}><Plus size={16}/>{t('inv.create')}</button></div>
      <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="inv-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>
      {devices.length === 0 ? <div className="inline-empty">{t('inv.empty')}</div> : <div className="table-scroll"><table className="servers-table fw-table"><thead><tr><th scope="col">{t('dev.serial')}</th><th scope="col">{t('ps.hostname')}</th><th scope="col">{t('fw.model')}</th><th scope="col">{t('state')}</th><th scope="col">{t('inv.venue')}</th><th scope="col"><span className="sr-only">{t('staff.actions')}</span></th></tr></thead><tbody>
        {devices.map(d => <tr key={d.id} data-testid={`inv-row-${d.serial}`} data-status={d.status}>
          <td data-label={t('dev.serial')}><strong className="ps-mono">{d.serial}</strong></td>
          <td data-label={t('ps.hostname')}><span className="fw-cell">{d.hostname}</span></td>
          <td data-label={t('fw.model')}>{d.model === 'rpi4-2gb' ? 'Raspberry Pi 4 2GB' : d.model}</td>
          <td data-label={t('state')}><span className="fw-cell"><span>{t(`dev.deviceStatus.${d.status}`)}{d.legacy ? ` · ${t('dev.legacy')}` : ''}</span>{d.print_server_id && <small className="ps-sub">{d.software_version ?? t('notProvided')} · {d.online ? t('ps.state.online') : t('ps.state.offline')}</small>}</span></td>
          <td data-label={t('inv.venue')}>{d.venue_id ? <Link className="text-link" to={`/admin/print-servers/${encodeURIComponent(d.venue_id)}`}>{d.venue_name ?? d.venue_id}</Link> : t('inv.unassigned')}</td>
          <td data-label={t('staff.actions')}>{!d.legacy && d.status !== 'retired' && <div className="inv-actions">
            <select aria-label={t('inv.chooseVenue')} value={assignTo[d.id] ?? ''} disabled={busy} data-testid={`inv-venue-${d.serial}`} onChange={e => setAssignTo(s => ({ ...s, [d.id]: e.target.value }))}><option value="">{t('inv.chooseVenue')}</option>{sortedVenues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <button type="button" className="button button-secondary" data-testid={`inv-assign-${d.serial}`} disabled={busy || !assignTo[d.id]} onClick={() => { const venueId = assignTo[d.id]; const venue = venues.find(v => v.id === venueId)?.name ?? venueId; void run(() => assignDevice(d.id, venueId), v => { setCode({ serial: d.serial, venue, ...v }); setCopied(false); return null; }); }}><Send size={15}/>{t(d.status === 'assigned' ? 'inv.reassign' : 'inv.assign')}</button>
            {d.status === 'assigned' && <button type="button" className="button button-secondary ps-danger" data-testid={`inv-revoke-${d.serial}`} disabled={busy} onClick={() => { if (window.confirm(t('inv.revokeConfirm').replace('{serial}', d.serial))) void run(() => revokeDevice(d.id, false), () => t('inv.revoked')); }}><X size={15}/>{t('inv.revoke')}</button>}
          </div>}</td>
        </tr>)}
      </tbody></table></div>}
    </section>
    {code && <section className="staff-panel inv-code" role="alertdialog" aria-labelledby="inv-code-title" data-testid="inv-code">
      <div className="section-heading"><div><p className="eyebrow">{t('inv.codeEyebrow')}</p><h2 id="inv-code-title">{t('inv.codeTitle').replace('{serial}', code.serial).replace('{venue}', code.venue)}</h2></div></div>
      <p className="owner-section-lead">{t(code.replaces ? 'inv.codeReplaces' : 'inv.codeHint')} {t('inv.codeExpires').replace('{time}', date(code.expires_at))}</p>
      <p className="ps-mono fw-hash inv-code-value" data-testid="inv-code-value">{code.code}</p>
      <div className="staff-actions"><button type="button" className="button button-secondary" onClick={() => { void navigator.clipboard?.writeText(code.code).then(() => setCopied(true)); }}><Copy size={15}/>{t(copied ? 'inv.copied' : 'inv.copy')}</button><button type="button" className="button button-primary" data-testid="inv-code-close" onClick={() => setCode(null)}><Check size={15}/>{t('inv.codeDone')}</button></div>
    </section>}
  </div>;
}
