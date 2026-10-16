import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Save, Users } from 'lucide-react';
import { useBlocker } from 'react-router-dom';
import { useLocale } from '../locales';
import { mcpErrorKey, type McpEditorProps, type McpSave, type McpVenueDetail } from '../lib/mcp';
import { PortalDialog } from './PortalDialog';
import { McpEffectiveBadge } from '../pages/AdminMcpPage';

type Draft = { habilitado: boolean; owners: Record<string, boolean> };
function fromData(data: McpVenueDetail): Draft {
  return { habilitado: data.habilitado, owners: Object.fromEntries(data.owners.map(owner => [owner.owner_user_id, owner.habilitado])) };
}
function same(a: Draft, b: Draft) {
  return a.habilitado === b.habilitado && Object.keys(a.owners).length === Object.keys(b.owners).length
    && Object.keys(a.owners).every(id => a.owners[id] === b.owners[id]);
}
function operationId() {
  return crypto.randomUUID();
}
function sameSnapshot(a: McpVenueDetail, b: McpVenueDetail) {
  return a.venue_id === b.venue_id && a.revision === b.revision && a.rate.version === b.rate.version
    && a.rate.amount === b.rate.amount && a.rate.currency === b.rate.currency;
}

export function McpVenueEditor({ data, busy, error, onSave, onReload, onDirtyChange }: McpEditorProps) {
  const { locale, t } = useLocale();
  const [base, setBase] = useState(data);
  const [draft, setDraft] = useState<Draft>(() => fromData(data));
  const [dialog, setDialog] = useState(false);
  const [checked, setChecked] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const operation = useRef<{ key: string; id: string } | null>(null);
  const confirmedSnapshot = useRef<McpVenueDetail | null>(null);
  const switchesDirty = !same(draft, fromData(base));
  const dirty = switchesDirty || dialog;
  const busyNow = busy || saving;
  const blocker = useBlocker(dirty || busyNow);
  const onlyRestricting = switchesDirty && !(draft.habilitado && !base.habilitado)
    && base.owners.every(owner => !draft.owners[owner.owner_user_id] || owner.habilitado);
  const needsAcceptance = draft.habilitado && !base.acceptance.current && !onlyRestricting;
  const reconfirmation = base.habilitado && needsAcceptance && base.capabilities.can_accept;
  const canSave = base.capabilities.can_manage && (switchesDirty || reconfirmation) && !busyNow && (!needsAcceptance || base.capabilities.can_accept);
  const price = useMemo(() => {
    const amount = Number(base.rate.amount);
    return Number.isFinite(amount) ? `${base.rate.currency} ${new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}` : `${base.rate.currency} ${base.rate.amount}`;
  }, [base.rate.amount, base.rate.currency, locale]);

  useEffect(() => {
    if (data.venue_id !== base.venue_id) {
      confirmedSnapshot.current = null;
      setBase(data); setDraft(fromData(data)); setRemoteChanged(false); setLocalError(null); setSaved(false); operation.current = null;
    } else if (confirmedSnapshot.current && sameSnapshot(data, confirmedSnapshot.current)) {
      // The query may deliver the response from our own reload after this effect
      // was rendered with the old draft. The response is already the new base.
      return;
    } else if (data.revision < base.revision || data.rate.version < base.rate.version) {
      // A refetch can resolve before React delivers the new prop. Ignore the older
      // query snapshot so it cannot replace the freshly loaded tariff or revision.
      return;
    } else if (data.revision !== base.revision || data.rate.version !== base.rate.version || data.rate.amount !== base.rate.amount || data.rate.currency !== base.rate.currency) {
      if (switchesDirty || dialog) { setRemoteChanged(true); setChecked(false); }
      else { setBase(data); setDraft(fromData(data)); setRemoteChanged(false); operation.current = null; }
    } else if (!switchesDirty && !dialog) {
      setBase(data); setDraft(fromData(data));
    }
  // The current draft is intentionally retained when the parent refreshes data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    const confirmed = confirmedSnapshot.current;
    if (confirmed && sameSnapshot(base, confirmed) && sameSnapshot(data, confirmed)) confirmedSnapshot.current = null;
  }, [base, data]);

  useEffect(() => { onDirtyChange?.(dirty || busyNow); return () => onDirtyChange?.(false); }, [dirty, busyNow, onDirtyChange]);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (busyNow) { blocker.reset(); return; }
    if (window.confirm(t('mcp.discardConfirm'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, busyNow, t]);
  useEffect(() => {
    if (!dirty && !busyNow) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty, busyNow]);

  const change = (next: Draft) => { setDraft(next); setSaved(false); setLocalError(null); operation.current = null; };
  const cancel = () => { setDraft(fromData(base)); setLocalError(null); setSaved(false); setDialog(false); setChecked(false); operation.current = null; };
  const reload = async () => {
    if (dirty && !window.confirm(t('mcp.discardConfirm'))) return;
    try {
      const fresh = await onReload();
      confirmedSnapshot.current = fresh;
      setBase(fresh); setDraft(fromData(fresh)); setDialog(false); setChecked(false);
      setRemoteChanged(false); setLocalError(null); setSaved(false); operation.current = null;
    }
    catch (caught) { setLocalError(mcpErrorKey(caught)); }
  };
  const submit = async (accept: boolean) => {
    if (!canSave || remoteChanged) return;
    const payload: Omit<McpSave, 'operation_id'> = {
      venue_id: base.venue_id, expected_revision: base.revision, rate_version: base.rate.version,
      habilitado: draft.habilitado,
      owners: base.owners.map(owner => ({ owner_user_id: owner.owner_user_id, habilitado: draft.owners[owner.owner_user_id] ?? owner.habilitado })),
      accept_monthly: accept,
    };
    const key = JSON.stringify(payload);
    if (operation.current?.key !== key) operation.current = { key, id: operationId() };
    setSaving(true); setLocalError(null);
    try {
      const result = await onSave({ ...payload, operation_id: operation.current.id });
      confirmedSnapshot.current = result;
      setBase(result); setDraft(fromData(result)); setRemoteChanged(false); setDialog(false); setChecked(false); setSaved(true); operation.current = null;
    } catch (caught) {
      const code = mcpErrorKey(caught);
      setLocalError(code);
      if (code === 'mcp.error.conflict') setRemoteChanged(true);
    } finally { setSaving(false); }
  };
  const requestSave = () => {
    if (needsAcceptance) { setChecked(false); setDialog(true); }
    else void submit(false);
  };
  const pendingOwner = needsAcceptance && !base.capabilities.can_accept;
  return <div className="mcp-editor" data-testid="mcp-venue-editor">
    <div className="mcp-editor-title"><div><h3>{base.nombre}</h3><p className="mcp-muted">{t('mcp.editorLead')}</p></div><span className={`status-badge ${base.habilitado ? 'status-active' : 'status-inactive'}`}><span className="badge-dot" />{t(base.habilitado ? 'mcp.switch.on' : 'mcp.switch.off')}</span></div>
    <div className="mcp-editor-grid">
      <section className="mcp-editor-card" aria-labelledby="mcp-config-title"><h4 id="mcp-config-title">{t('mcp.configuration')}</h4>
        <label className="mcp-switch-row"><span><strong>{t('mcp.venueSwitch')}</strong><small>{t('mcp.venueSwitchHelp')}</small></span><input type="checkbox" role="switch" checked={draft.habilitado} disabled={!base.capabilities.can_manage || busyNow} onChange={e => change({ ...draft, habilitado: e.target.checked })} aria-label={t('mcp.venueSwitch')} /></label>
        <div className="mcp-owner-heading"><Users size={17} aria-hidden="true" /><strong>{t('mcp.owners')}</strong><span className="count-pill">{base.owners.length}</span></div>
        {base.owners.length === 0 ? <p className="inline-empty">{t('mcp.noOwners')}</p> : <ul className="mcp-owner-list">{base.owners.map(owner => <li key={owner.owner_user_id}><label className="mcp-switch-row"><span><strong>{owner.nombre || owner.email}</strong><small>{owner.email}</small></span><input type="checkbox" role="switch" checked={draft.owners[owner.owner_user_id] ?? owner.habilitado} disabled={!base.capabilities.can_manage || busyNow} onChange={e => change({ ...draft, owners: { ...draft.owners, [owner.owner_user_id]: e.target.checked } })} aria-label={t('mcp.ownerSwitch').replace('{name}', owner.nombre || owner.email)} /></label><McpEffectiveBadge efectivo={owner.efectivo} motivo={owner.motivo} /></li>)}</ul>}
      </section>
      <section className="mcp-editor-card" aria-labelledby="mcp-access-title"><h4 id="mcp-access-title">{t('mcp.effectiveTitle')}</h4><p className="mcp-muted">{t('mcp.effectiveHelp')}</p>
        <dl className="mcp-facts"><div><dt>{t('mcp.currentConfig')}</dt><dd>{t(base.habilitado ? 'mcp.switch.on' : 'mcp.switch.off')}</dd></div><div><dt>{t('mcp.monthlyRate')}</dt><dd>{price} / {t('mcp.month')}</dd></div><div><dt>{t('mcp.rateVersion')}</dt><dd>{base.rate.version}</dd></div><div><dt>{t('mcp.acceptance')}</dt><dd>{t(base.acceptance.current ? 'mcp.accepted' : 'mcp.pendingAcceptance')}</dd></div></dl>
        {pendingOwner && <div className="staff-notice" role="status">{t('mcp.ownerMustAccept')}</div>}
        {base.acceptance.accepted_at && <p className="mcp-muted">{t('mcp.acceptedAt').replace('{date}', new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium' }).format(new Date(base.acceptance.accepted_at)))}</p>}
      </section>
    </div>
    {remoteChanged && <div className="form-error" role="alert"><AlertTriangle size={18} /><span>{t('mcp.conflict')}</span><button className="button button-secondary" type="button" onClick={() => void reload()}>{t('mcp.reload')}</button></div>}
    {(localError || error) && <div className="form-error" role="alert">{t(localError || error || '')}</div>}
    {saved && <div className="staff-notice" role="status"><Check size={18} />{t('mcp.saved')}</div>}
    {switchesDirty && <p className="mcp-muted" role="status">{t('mcp.unsaved')}</p>}
    {base.capabilities.can_manage && <div className="mcp-editor-actions"><button type="button" className="button button-secondary" disabled={(!switchesDirty && !remoteChanged) || busyNow} onClick={cancel}>{t('mcp.cancel')}</button><button type="button" className="button button-primary" disabled={!canSave || remoteChanged} onClick={requestSave}><Save size={16} />{busyNow ? t('mcp.saving') : t(reconfirmation && !switchesDirty ? 'mcp.reconfirmRate' : 'mcp.save')}</button></div>}
    {dialog && <PortalDialog title={t('mcp.monthlyDialogTitle')} titleId="mcp-monthly-title" descriptionId="mcp-monthly-description" testId="mcp-monthly-dialog" onClose={() => { if (!busyNow) setDialog(false); }} dismissible={!busyNow}
      actions={<><button type="button" className="button button-secondary" disabled={busyNow} onClick={() => setDialog(false)}>{t('mcp.cancel')}</button><button type="button" className="button button-primary" disabled={!checked || busyNow || remoteChanged} onClick={() => void submit(true)}>{busyNow ? t('mcp.saving') : t('mcp.confirmSave')}</button></>}>
      <p id="mcp-monthly-description">{t('mcp.monthlyTerms').replace('{venue}', base.nombre).replace('{price}', price).replace('{version}', String(base.rate.version))}</p>
      <label className="mcp-consent-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={busyNow} />{t('mcp.expressAccept')}</label>
      {remoteChanged && <div className="form-error" role="alert"><span>{t('mcp.conflict')}</span><button type="button" className="button button-secondary" disabled={busyNow} onClick={() => void reload()}>{t('mcp.reload')}</button></div>}
      {(localError || error) && <div className="form-error" role="alert">{t(localError || error || '')}</div>}
    </PortalDialog>}
  </div>;
}
