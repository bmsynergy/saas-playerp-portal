import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Clock3, Printer, Server } from 'lucide-react';
import { psErrorKey } from '../lib/printServerApi';
import { deviceName, type VenueDevice, type VenueDevices } from '../lib/psVenueDevices';
import { relativeTime } from '../lib/printFleet';
import { useLocale } from '../locales';
import { fleetStateClass } from './PrintFleetPage';
import { PsLinkStateBadge } from '../components/PsLinkStateBadge';
import { reportedOr } from '../lib/psLink';

type Props = {
  data: VenueDevices;
  hrefFor: (device: VenueDevice) => string;
  // Set when an RPC answered selection_required: the page asks to choose, it never picks one.
  choose?: boolean;
  onAssignPrinter?: (printerId: string, printServerId: string) => Promise<void>;
  extra?: ReactNode;
};

export function deviceState(device: Pick<VenueDevice, 'print_server_id' | 'online' | 'status'>): keyof typeof fleetStateClass {
  if (!device.print_server_id) return 'pending';
  return device.online ? 'online' : 'offline';
}

export function VenuePrintServersPage({ data, hrefFor, choose = false, onAssignPrinter, extra }: Props) {
  const { t, locale } = useLocale();
  const selectedId=new URLSearchParams(useLocation().search).get('selected');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const now = Date.now();
  const active = data.devices.filter(device => device.print_server_id);
  const dateFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  async function assign(printerId: string, label: string) {
    const psId = selected[printerId];
    const target = active.find(device => device.print_server_id === psId);
    if (!onAssignPrinter || !psId || !target || busy) return;
    setBusy(true); setResult(null);
    try {
      await onAssignPrinter(printerId, psId);
      setResult({ ok: true, text: t('psm.assigned.ok').replace('{name}', label).replace('{ps}', deviceName(target)) });
    } catch (error) { setResult({ ok: false, text: t(psErrorKey(error)) }); }
    finally { setBusy(false); }
  }

  return <div className="page-stack staff-page" data-testid="venue-print-servers">
    <section className="staff-panel" aria-labelledby="venue-ps-title">
      <div className="section-heading venue-ps-heading"><div><p className="eyebrow">{t('psm.venueEyebrow')}</p><h2 id="venue-ps-title">{t(choose ? 'psm.chooseTitle' : 'psm.venueTitle')}</h2></div><div className="venue-ps-heading-actions"><span className="count-pill">{data.devices.length}</span>{extra}</div></div>
      <p className="staff-panel-lead">{t(choose ? 'psm.chooseLead' : 'psm.venueLead')}</p>
      {choose && <div className="staff-notice" role="status" data-testid="ps-selection-required"><AlertTriangle size={18}/><span>{t('ps.error.selectionRequired')}</span></div>}
      {data.devices.length === 0 ? <div className="staff-empty" data-testid="venue-ps-empty"><Server size={27}/><strong>{t('psm.venueEmpty')}</strong></div> : <div className="staff-table-wrap"><table className="staff-table ps-fleet-table"><thead><tr><th>{t('psm.col.device')}</th><th>{t('psm.col.serial')}</th><th>{t('psm.col.connection')}</th><th>{t('psm.col.firmware')}</th><th>{t('lastSignal')}</th><th>{t('psm.col.printers')}</th><th>{t('staff.actions')}</th></tr></thead><tbody>{data.devices.map(device => {
        // PE-462: identity from the link and facts as reported by the device ("Pending" when absent).
        const l = device.link; const lastSeen = l ? l.reported.last_seen_at : device.last_seen_at;
        const state = deviceState(device); const relative = relativeTime(lastSeen, now, locale);
        return <tr key={device.id} data-testid={`venue-ps-row-${device.id}`} data-state={state} data-link-state={l?.state} data-selected={String(selectedId===(l?.device_id??device.inventory_device_id??device.id))}>
          <td data-label={t('psm.col.device')} className="staff-identity">{l ? <><strong>{l.display_name}</strong><small>{l.model_label ?? l.model} · {t('ps.hostname')}: {reportedOr(l.reported.hostname, t('psLink.pending'))}</small></> : <><strong>{deviceName(device)}</strong>{device.hostname && device.hostname !== deviceName(device) && <small>{device.hostname}</small>}</>}</td>
          <td data-label={t('psm.col.serial')}><span className="ps-mono">{l?.serial || device.serial || t('notProvided')}</span></td>
          <td data-label={t('psm.col.connection')}><div className="ps469-list-states">{l && <PsLinkStateBadge state={l.state}/>}<span className={`server-status ${fleetStateClass[state]}`}><span className="badge-dot"/>{state === 'pending' ? t('psm.status.pending') : t(`ps.state.${state}`)}</span></div></td>
          <td data-label={t('psm.col.firmware')}><span className="version-text">{l ? reportedOr(l.reported.firmware_version, t('psLink.pending')) : device.software_version || t('notProvided')}</span></td>
          <td data-label={t('lastSignal')}>{relative && lastSeen ? <span className="ps-signal"><span className="staff-date"><Clock3 size={14}/>{relative}</span><small className="ps-sub">{dateFormatter.format(new Date(lastSeen))}</small></span> : <span className="staff-self-note">{t(l ? 'psLink.pending' : 'ps.never')}</span>}</td>
          <td data-label={t('psm.col.printers')}><span className="staff-role"><Printer size={15}/>{device.printers_total}</span></td>
          <td data-label={t('staff.actions')}><Link className="staff-action-link" data-testid={`venue-ps-open-${device.id}`} to={hrefFor(device)}>{t('psm.openSheet')}<span className="sr-only"> {deviceName(device)}</span><ArrowRight size={14}/></Link></td>
        </tr>;
      })}</tbody></table></div>}
    </section>

    {data.unassigned_printers.length > 0 && <section className="staff-panel" aria-labelledby="venue-ps-unassigned-title" data-testid="venue-ps-unassigned">
      <div className="section-heading"><div><p className="eyebrow">{t('ps.printers.eyebrow')}</p><h2 id="venue-ps-unassigned-title">{t('psm.unassignedPrinters')}</h2></div><span className="count-pill">{data.unassigned_printers.length}</span></div>
      <p className="staff-panel-lead">{t('psm.unassignedPrintersLead')}</p>
      <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite">{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>
      <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>{t('ps.printers.name')}</th><th>{t('ps.printers.mac')}</th>{data.can_manage && onAssignPrinter && active.length > 0 && <th>{t('psm.assignTo')}</th>}</tr></thead><tbody>{data.unassigned_printers.map(printer => <tr key={printer.id} data-testid={`venue-ps-unassigned-${printer.id}`}>
        <td data-label={t('ps.printers.name')} className="staff-identity"><strong>{printer.label || t('notProvided')}</strong><small>{printer.model || t('ps.scan.unknownModel')}{printer.location ? ` · ${printer.location}` : ''}</small></td>
        <td data-label={t('ps.printers.mac')}><span className="ps-mono">{printer.mac_address || t('notProvided')}</span></td>
        {data.can_manage && onAssignPrinter && active.length > 0 && <td data-label={t('psm.assignTo')}><div className="staff-actions">
          <select aria-label={`${t('psm.assignTo')}: ${printer.label}`} value={selected[printer.id] ?? ''} disabled={busy} onChange={event => setSelected(current => ({ ...current, [printer.id]: event.target.value }))}>
            <option value="">—</option>{active.map(device => <option key={device.print_server_id!} value={device.print_server_id!}>{deviceName(device)}{device.serial ? ` (${device.serial})` : ''}</option>)}
          </select>
          <button type="button" className="staff-action-link" data-testid={`venue-ps-assign-${printer.id}`} disabled={busy || !selected[printer.id]} onClick={() => void assign(printer.id, printer.label)}><Check size={14}/>{t('psm.assignSubmit')}</button>
        </div></td>}
      </tr>)}</tbody></table></div>
    </section>}
  </div>;
}
