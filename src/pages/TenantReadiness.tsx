import { useState, type FormEvent } from 'react';
import '../tenant-onboarding.css';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, CircleAlert, ClipboardCheck, Lock, Pencil, Save, X } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';
import { useAuth } from '../hooks/useAuth';
import { errorCode } from '../lib/errors';
import { changedFields, getReadiness, onboardingErrorKey, updateTenantInfo, validTimezone, type ReadinessItem, type VenueFields } from '../lib/tenantOnboarding';

const DONE = ['complete', 'accepted', 'verified', 'configured'];
const WARN = ['invite_failed', 'onboarding_incomplete', 'pending_verification', 'partial', 'invited', 'incomplete'];

// Readiness checklist: calculated by the backend, read-only here. It never activates
// the venue; POS operations (hours, taxes, workstations…) are only shown, not edited.
export function TenantReadinessPanel({ venueId, canManage }: { venueId: string; canManage: boolean }) {
  const { t } = useLocale(); const { session } = useAuth();
  const data = useQuery({ queryKey: ['tenant-readiness', session?.user.id, venueId], queryFn: ({ signal }) => getReadiness(venueId, signal), refetchInterval: 60_000 });
  return <section className="detail-panel readiness-panel" aria-labelledby="readiness-title">
    <div className="section-heading"><div><p className="eyebrow">{t('readiness.eyebrow')}</p><h2 id="readiness-title">{t('readiness.title')}</h2></div>
      {data.data ? <span className={`status-badge readiness-${data.data.lifecycle}`}><span className="badge-dot"/>{t(`readiness.lifecycle.${data.data.lifecycle}`)}</span> : <span className="section-icon"><ClipboardCheck size={20}/></span>}</div>
    {data.isPending ? <p className="nt-lead"><span className="spinner"/> {t('loadingTitle')}</p>
      : data.isError ? <div className="form-error" role="alert">{t(errorCode(data.error))} <button type="button" className="text-link" onClick={() => void data.refetch()}>{t('retry')}</button></div>
      : <>
        <p className="nt-lead">{t(`readiness.lifecycleLead.${data.data.lifecycle}`)}</p>
        <ul className="readiness-list">{data.data.items.map(item => <ReadinessRow key={item.key} item={item} venueId={venueId} canManage={canManage}/>)}</ul>
        <p className="nt-lead readiness-billing">{t('readiness.billing').replace('{plan}', data.data.billing.plan_name ?? t('notProvided')).replace('{status}', data.data.billing.status ?? t('notProvided'))}</p>
      </>}
  </section>;
}

function ReadinessRow({ item, venueId, canManage }: { item: ReadinessItem; venueId: string; canManage: boolean }) {
  const { t } = useLocale();
  const tone = DONE.includes(item.state) ? 'done' : WARN.includes(item.state) ? 'warn' : 'todo';
  const Icon = tone === 'done' ? CheckCircle2 : tone === 'warn' ? CircleAlert : Circle;
  const detail: string[] = [];
  if (item.key === 'basic_info' && item.missing?.length) detail.push(`${t('readiness.missing')}: ${item.missing.map(m => t(`readiness.field.${m}`)).join(', ')}`);
  if (item.key === 'owner_access') detail.push(t('readiness.owners').replace('{accepted}', String(item.owners_accepted ?? 0)).replace('{total}', String(item.owners_total ?? 0)));
  if (item.key === 'operations') detail.push(t('readiness.operationsCounts').replace('{ws}', String(item.workstations_active ?? 0)).replace('{ps}', String(item.print_servers_active ?? 0))
    + ' · ' + t(item.operating_hours_set ? 'readiness.hoursSet' : 'readiness.hoursMissing') + ' · ' + t(item.tax_settings_set ? 'readiness.taxSet' : 'readiness.taxMissing'));
  if (item.key === 'operations' && item.terminal_readers === 'not_tracked_here') detail.push(t('readiness.readersNotTracked'));
  if (item.key === 'domain' && typeof item.domains_total === 'number' && typeof item.domains_verified === 'number') detail.push(t('readiness.domainsCount').replace('{verified}', String(item.domains_verified)).replace('{total}', String(item.domains_total)));
  const where = item.managed_in === 'pos' ? 'readiness.where.pos' : item.managed_in === 'admin_legacy' ? 'readiness.where.legacy' : null;
  const link = canManage && item.key === 'owner_access' ? `/admin/tenants/${encodeURIComponent(venueId)}/users`
    : canManage && item.key === 'operations' ? `/admin/tenants/${encodeURIComponent(venueId)}/print-servers` : null;
  return <li className={`readiness-item readiness-${tone}`} data-readiness={item.key}>
    <Icon size={20} aria-hidden="true"/>
    <div><strong>{t(`readiness.item.${item.key}`)}</strong><span className="readiness-state">{t(`readiness.state.${item.state}`)}{item.required_for_ready ? '' : ` · ${t('readiness.optional')}`}</span>
      {detail.map(d => <small key={d}>{d}</small>)}
      {where && <small className="readiness-where"><Lock size={12} aria-hidden="true"/>{t(where)}</small>}
      {link && <Link className="text-link" to={link}>{t(item.key === 'owner_access' ? 'readiness.manageUsers' : 'readiness.managePrintServers')}</Link>}
    </div>
  </li>;
}

const KEYS: (keyof VenueFields)[] = ['name', 'email', 'phone', 'address', 'city', 'state', 'timezone'];
const fromVenue = (v: OwnerVenue): VenueFields => ({ name: v.name, email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '', city: v.city ?? '', state: v.state ?? '', timezone: v.timezone ?? '' });

// Editable record (super_admin): starts from the real values and sends only what
// changed through the existing update_tenant_info. Postal code is not shown because
// the current read does not return it, so it is never overwritten blindly.
export function TenantInfoEditor({ venue, onSaved }: { venue: OwnerVenue; onSaved: () => void }) {
  const { t } = useLocale(); const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VenueFields>(fromVenue(venue));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const open = () => { setForm(fromVenue(venue)); setError(null); setSaved(false); setEditing(true); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) { setError('tenantEdit.error.invalidName'); return; }
    if (form.timezone.trim() && !validTimezone(form.timezone.trim())) { setError('tenantNew.error.invalidTimezone'); return; }
    const fields = changedFields(fromVenue(venue), form);
    if (!Object.keys(fields).length) { setEditing(false); return; }
    setBusy(true); setError(null);
    try {
      await updateTenantInfo(venue.id, fields);
      setEditing(false); setSaved(true); onSaved();
      void queryClient.invalidateQueries({ queryKey: ['tenant-readiness'] }); void queryClient.invalidateQueries({ queryKey: ['tenant-readiness-list'] }); void queryClient.invalidateQueries({ queryKey: ['directory'] });
    } catch (e) { setError(onboardingErrorKey(e)); } finally { setBusy(false); }
  };
  if (!editing) return <div className="tenant-edit-bar">{saved && <span className="staff-notice" role="status">{t('tenantEdit.saved')}</span>}<button type="button" className="button button-secondary" onClick={open}><Pencil size={16}/>{t('tenantEdit.edit')}</button></div>;
  return <section className="detail-panel" aria-labelledby="tenant-edit-title">
    <div className="section-heading"><div><p className="eyebrow">{t('venues')}</p><h2 id="tenant-edit-title">{t('tenantEdit.title')}</h2></div></div>
    {error && <div className="form-error" role="alert">{t(error)}</div>}
    <form className="nt-form" onSubmit={save} noValidate>
      {KEYS.map(k => <label key={k} className="field"><span>{t(k === 'name' ? 'tenantNew.name' : k === 'state' ? 'tenantNew.state' : k)}{k === 'name' ? ' *' : ''}</span><div className="field-control"><input value={form[k]} disabled={busy} type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}/></div></label>)}
      <p className="nt-lead nt-wide">{t('tenantEdit.posNote')}</p>
      <div className="nt-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(false)} disabled={busy}><X size={16}/>{t('tenantNew.cancel')}</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <span className="spinner"/> : <Save size={16}/>}{t('tenantEdit.save')}</button></div>
    </form>
  </section>;
}
