import { useState } from 'react';
import { Bot, Building2, Check, Info, Power, PowerOff, UserRoundX } from 'lucide-react';
import { useLocale } from '../locales';
import { PortalDialog } from '../components/PortalDialog';
import type { McpAdminOverview, McpAdminTenant, McpAdminVenue } from '../lib/mcp';

// PE-458: /admin/mcp. A super_admin switches MCP per tenant (= owner account) and per venue.
// Precedence: effective = pilot ∧ tenant ∧ venue. The backend enforces it on every MCP access and audits each change.
type Pending = { kind: 'tenant'; tenant: McpAdminTenant; enable: boolean } | { kind: 'venue'; venue: McpAdminVenue; enable: boolean };
type Props = {
  data: McpAdminOverview;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onTenant: (ownerId: string, enable: boolean, reason: string) => Promise<void>;
  onVenue: (venueId: string, enable: boolean, reason: string) => Promise<void>;
};

export function McpEffectiveBadge({ efectivo, motivo }: { efectivo: boolean; motivo: string }) {
  const { t } = useLocale();
  return <span className={`status-badge mcp-badge ${efectivo ? 'status-active' : motivo === 'tenant_desactivado' || motivo === 'sede_desactivada' ? 'status-inactive' : 'status-unknown'}`} data-testid="mcp-effective">
    <span className="badge-dot"/>{t(efectivo ? 'mcp.effective.on' : 'mcp.effective.off')} · {t(`mcp.reason.${motivo}`)}
  </span>;
}

export function AdminMcpPage({ data, busy, error, notice, onTenant, onVenue }: Props) {
  const { locale, t } = useLocale();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const when = (v: string | null) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };
  const ask = (next: Pending) => { setPending(next); setReason(''); setLocalError(null); };
  async function confirm() {
    if (!pending || busy) return;
    const text = reason.trim();
    if (!text) { setLocalError('mcp.error.reasonRequired'); return; }
    try {
      if (pending.kind === 'tenant') await onTenant(pending.tenant.owner_user_id, pending.enable, text);
      else await onVenue(pending.venue.venue_id, pending.enable, text);
      setPending(null);
    } catch { /* The parent shows the localized error; keep the dialog for a retry. */ }
  }
  const pilot = data.piloto;

  return <div className="page-stack staff-page" data-testid="admin-mcp">
    <div className="page-heading"><div><p className="eyebrow">{t('mcp.eyebrow')}</p><h1>{t('mcp.adminTitle')}</h1><p>{t('mcp.adminLead')}</p></div><div className="heading-accent"><Bot size={30}/></div></div>
    {error && <div className="form-error" role="alert"><UserRoundX size={19}/><span>{t(error)}</span></div>}
    {notice && <div className="staff-notice" role="status"><Check size={18}/><span>{t(notice)}</span></div>}
    <section className="staff-panel mcp-legend" aria-labelledby="mcp-legend-title" data-testid="mcp-legend">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.legendEyebrow')}</p><h2 id="mcp-legend-title">{t('mcp.legendTitle')}</h2></div><span className="section-icon"><Info size={22}/></span></div>
      <ul className="mcp-legend-list">
        <li>{t('mcp.legend.formula')}</li>
        <li>{t('mcp.legend.tenant')}</li>
        <li>{t('mcp.legend.venue')}</li>
        <li>{t('mcp.legend.shared')}</li>
        <li>{t('mcp.legend.tokens')}</li>
        <li>{t('mcp.legend.pilot')} <strong>{pilot ? `${pilot.activo ? t('active') : t('inactive')} · ${pilot.entorno ?? '—'}` : t('inactive')}</strong></li>
      </ul>
    </section>
    <section className="staff-panel" aria-labelledby="mcp-tenants-title">
      <div className="section-heading"><div><p className="eyebrow">{t('mcp.tenantsEyebrow')}</p><h2 id="mcp-tenants-title">{t('mcp.tenantsTitle')}</h2></div><span className="count-pill">{data.tenants.length}</span></div>
      <div className="staff-table-wrap"><table className="staff-table mcp-table"><thead><tr><th>{t('mcp.col.tenantVenue')}</th><th>{t('mcp.col.switch')}</th><th>{t('mcp.col.effective')}</th><th>{t('staff.actions')}</th></tr></thead>
        {data.tenants.map(tenant => <tbody key={tenant.owner_user_id} data-testid={`mcp-tenant-${tenant.owner_user_id}`}>
          <tr className="mcp-tenant-row">
            <td data-label={t('mcp.col.tenantVenue')} className="staff-identity"><strong>{tenant.nombre || tenant.email}</strong><small>{t('mcp.tenantKind')} · {tenant.email}</small></td>
            <td data-label={t('mcp.col.switch')}><span className={`status-badge ${tenant.habilitado ? 'status-active' : 'status-inactive'}`}><span className="badge-dot"/>{t(tenant.habilitado ? 'mcp.switch.on' : 'mcp.switch.off')}</span>{when(tenant.cambiado_en) && <small className="mcp-changed">{when(tenant.cambiado_en)}{tenant.motivo ? ` · ${tenant.motivo}` : ''}</small>}</td>
            <td data-label={t('mcp.col.effective')}>{tenant.habilitado ? <span className="mcp-muted">{t('mcp.tenantPerVenue')}</span> : <span className="status-badge status-inactive"><span className="badge-dot"/>{t('mcp.tenantBlocksAll')}</span>}</td>
            <td data-label={t('staff.actions')}><button type="button" className={`button ${tenant.habilitado ? 'button-secondary' : 'button-primary'}`} disabled={busy} data-testid={`mcp-tenant-toggle-${tenant.owner_user_id}`} onClick={() => ask({ kind: 'tenant', tenant, enable: !tenant.habilitado })}>{tenant.habilitado ? <PowerOff size={16}/> : <Power size={16}/>}{t(tenant.habilitado ? 'mcp.disableTenant' : 'mcp.enableTenant')}</button></td>
          </tr>
          {tenant.sedes.map(venue => <tr key={`${tenant.owner_user_id}:${venue.venue_id}`} className="mcp-venue-row">
            <td data-label={t('mcp.col.tenantVenue')} className="staff-identity mcp-venue-cell"><strong><Building2 size={15}/> {venue.nombre}</strong><small>{t('mcp.venueKind')}{venue.owners > 1 ? ` · ${t('mcp.sharedWith').replace('{n}', String(venue.owners))}` : ''}</small></td>
            <td data-label={t('mcp.col.switch')}><span className={`status-badge ${venue.habilitada ? 'status-active' : 'status-inactive'}`}><span className="badge-dot"/>{t(venue.habilitada ? 'mcp.switch.on' : 'mcp.switch.off')}</span>{when(venue.cambiado_en) && <small className="mcp-changed">{when(venue.cambiado_en)}{venue.motivo_cambio ? ` · ${venue.motivo_cambio}` : ''}</small>}</td>
            <td data-label={t('mcp.col.effective')}><McpEffectiveBadge efectivo={venue.efectivo} motivo={venue.motivo}/></td>
            <td data-label={t('staff.actions')}><button type="button" className={`button ${venue.habilitada ? 'button-secondary' : 'button-primary'}`} disabled={busy} data-testid={`mcp-venue-toggle-${tenant.owner_user_id}-${venue.venue_id}`} onClick={() => ask({ kind: 'venue', venue, enable: !venue.habilitada })}>{venue.habilitada ? <PowerOff size={16}/> : <Power size={16}/>}{t(venue.habilitada ? 'mcp.disableVenue' : 'mcp.enableVenue')}</button></td>
          </tr>)}
        </tbody>)}
      </table></div>
    </section>
    {pending && <PortalDialog title={t(pending.kind === 'tenant' ? (pending.enable ? 'mcp.enableTenant' : 'mcp.disableTenant') : (pending.enable ? 'mcp.enableVenue' : 'mcp.disableVenue'))} titleId="mcp-confirm-title" onClose={() => !busy && setPending(null)} testId="mcp-confirm"
      actions={<><button type="button" className="button button-secondary" disabled={busy} onClick={() => setPending(null)}>{t('mcp.cancel')}</button><button type="button" className="button button-primary" disabled={busy} data-testid="mcp-confirm-submit" onClick={() => void confirm()}>{t('mcp.confirm')}</button></>}>
      <p>{pending.kind === 'tenant'
        ? `${t(pending.enable ? 'mcp.confirm.tenantOn' : 'mcp.confirm.tenantOff')} ${pending.tenant.nombre || pending.tenant.email}`
        : `${t(pending.enable ? 'mcp.confirm.venueOn' : 'mcp.confirm.venueOff')} ${pending.venue.nombre}${pending.venue.owners > 1 ? ` (${t('mcp.sharedWith').replace('{n}', String(pending.venue.owners))})` : ''}`}</p>
      <label className="field"><span>{t('mcp.reasonLabel')}</span><div className="field-control"><input type="text" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} data-testid="mcp-reason" placeholder={t('mcp.reasonPlaceholder')}/></div></label>
      {localError && <div className="form-error" role="alert"><span>{t(localError)}</span></div>}
    </PortalDialog>}
  </div>;
}
