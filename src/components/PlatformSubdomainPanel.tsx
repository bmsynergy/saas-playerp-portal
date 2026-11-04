import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Globe2, RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';
import { checkSubdomain, confirmSubdomainChange, getVenueAddress, previewSubdomainChange, subdomainErrorKey, type SubdomainCheck } from '../lib/platformSubdomain';
import { PlatformSubdomainField } from './PlatformSubdomainField';

type Address = Awaited<ReturnType<typeof getVenueAddress>>;
type PreviewResult = Awaited<ReturnType<typeof previewSubdomainChange>>;
type Preview = NonNullable<PreviewResult['preview']>;
type CheckState = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error';

export function PlatformSubdomainPanel({ venueId, canEdit }: { venueId: string; canEdit: boolean }) {
  const { t } = useLocale();
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<'saved' | 'current' | null>(null);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [check, setCheck] = useState<SubdomainCheck | null>(null);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  const reload = async () => {
    setLoading(true); setError(null);
    try {
      const next = await getVenueAddress(venueId);
      setAddress(next);
    } catch (cause) { setError(subdomainErrorKey(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => { let active = true; setLoading(true); getVenueAddress(venueId).then(next => { if (active) setAddress(next); }).catch(cause => { if (active) setError(subdomainErrorKey(cause)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [venueId]);
  useEffect(() => {
    setCheck(null); setPreview(null);
    if (!editing || !label.trim()) { setCheckState('idle'); return; }
    let active = true; setCheckState('checking');
    const timer = window.setTimeout(() => {
      checkSubdomain(label, venueId).then(result => {
        if (!active) return;
        setCheck(result);
        setCheckState(result.available || result.reason === 'own_previous_address' ? 'available' : result.reason === 'invalid_format' || result.reason === 'reserved' ? 'invalid' : 'unavailable');
      }).catch(() => { if (active) setCheckState('error'); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [editing, label, venueId]);
  const current = address?.platform_subdomain;
  const checked = checkState === 'available' && check?.subdomain === label.trim().toLowerCase();
  const startEdit = () => { setLabel(''); setCheck(null); setCheckState('idle'); setPreview(null); setSuccess(null); setError(null); setEditing(true); };
  const openPreview = async () => {
    if (!checked || busy || submitLock.current) return;
    submitLock.current = true;
    setBusy(true); setError(null);
    try {
      const result = await previewSubdomainChange(venueId, label, current?.domain ?? null);
      if (result.preview) setPreview(result.preview);
      else if (result.reason === 'already_current') {
        const latest = await getVenueAddress(venueId);
        setAddress(latest); setEditing(false);
        if (latest.platform_subdomain.label === check?.subdomain) setSuccess('current');
        else setError('subdomain.error.stale');
      } else setError('subdomain.error.changed');
    } catch (cause) { setError(subdomainErrorKey(cause)); }
    finally { submitLock.current = false; setBusy(false); }
  };
  const confirm = async () => {
    if (!preview || busy || submitLock.current) return;
    submitLock.current = true; setBusy(true); setError(null);
    try {
      const result = await confirmSubdomainChange(venueId, label, preview.from);
      if (!result.changed && result.reason !== 'already_current') { setPreview(null); setError('subdomain.error.changed'); return; }
      // The mutation returns the authoritative address; a separate read confirms
      // the latest persisted state before showing success.
      const latest = await getVenueAddress(venueId);
      setAddress(latest); setPreview(null); setEditing(false);
      if (latest.platform_subdomain.label === check?.subdomain) setSuccess(result.changed ? 'saved' : 'current');
      else setError('subdomain.error.stale');
    } catch (cause) { setPreview(null); setError(subdomainErrorKey(cause)); }
    finally { submitLock.current = false; setBusy(false); }
  };
  const stateKey = (value: string | null | undefined) => value && ['verified', 'pending', 'pending_verification', 'disabled', 'none', 'live', 'pending_relocation', 'configured', 'not_configured', 'ambiguous'].includes(value) ? t(`subdomain.state.${value}`) : t('unknown');

  return <section className="detail-panel platform-subdomain-panel" aria-labelledby="platform-subdomain-heading">
    <div className="section-heading"><div><p className="eyebrow">{t('subdomain.platform')}</p><h2 id="platform-subdomain-heading">{t('subdomain.panelTitle')}</h2></div><Globe2 size={23} aria-hidden="true" /></div>
    {loading && !address ? <p role="status">{t('loadingTitle')}</p> : null}
    {error && <div className="form-error" role="alert">{t(error)}</div>}
    {success && <div className="platform-subdomain-success" role="status"><CheckCircle2 size={18}/>{t(success === 'current' ? 'subdomain.alreadyCurrent' : 'subdomain.savedPending')}</div>}
    {address && current && <>
      <div className="platform-subdomain-current">
        <span>{t('subdomain.currentAddress')}</span>
        {current.public_url && current.operational && current.environment_state === 'live' && current.serving_state === 'verified' ? <a href={current.public_url} target="_blank" rel="noopener noreferrer">{current.domain}</a> : <strong>{current.domain ?? t(`subdomain.state.${current.address_state}`)}</strong>}
        <small>{current.environment_state === 'pending_relocation' ? t('subdomain.pendingRelocation') : !current.operational ? t('subdomain.notOperational') : t('subdomain.operational')}</small>
      </div>
      <dl className="dev-facts platform-subdomain-facts">
        <div><dt>{t('subdomain.venueName')}</dt><dd>{address.venue_name}</dd></div>
        <div><dt>{t('subdomain.slug')}</dt><dd>{address.slug}</dd></div>
        <div><dt>{t('subdomain.environment')}</dt><dd>{address.environment.environment.toUpperCase()} · {stateKey(address.environment.base_status)}</dd></div>
        <div><dt>{t('subdomain.addressState')}</dt><dd>{stateKey(current.address_state)}</dd></div>
        <div><dt>{t('subdomain.servingState')}</dt><dd>{stateKey(current.serving_state)}</dd></div>
        <div><dt>{t('subdomain.venueState')}</dt><dd>{address.venue_state.is_active ? t('active') : t('inactive')} · {t(`subdomain.lifecycle.${address.venue_state.lifecycle}`)}</dd></div>
        <div><dt>{t('subdomain.externalPrimary')}</dt><dd>{address.external_primary?.domain ?? t('notProvided')}</dd></div>
      </dl>
      <p className="platform-subdomain-context">{t('subdomain.currentApp')} <a href={address.environment.current_app_url} target="_blank" rel="noopener noreferrer">{address.environment.current_app_url}</a> · {t('subdomain.currentPortal')} <a href={address.environment.current_portal_url} target="_blank" rel="noopener noreferrer">{address.environment.current_portal_url}</a></p>
      {address.aliases.length > 0 && <div className="platform-subdomain-aliases"><strong>{t('subdomain.aliases')}</strong><ul>{address.aliases.map(item => <li key={item.domain}>{item.domain} · {stateKey(item.status)}</li>)}</ul></div>}
      {current.address_state === 'ambiguous' && <div className="platform-subdomain-warning" role="status"><p>{t('subdomain.ambiguous')}</p><ul>{current.candidates.map(candidate => <li key={candidate}>{candidate}</li>)}</ul></div>}
      {error && address && <div className="nt-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => void reload()}><RefreshCw size={17}/>{t('subdomain.reload')}</button></div>}
      {canEdit && !editing && current.address_state !== 'ambiguous' && <div className="nt-actions"><button type="button" className="button button-secondary" onClick={startEdit}>{t('subdomain.edit')}</button></div>}
      {canEdit && editing && <div className="platform-subdomain-edit">
        <PlatformSubdomainField value={label} onChange={setLabel} state={checkState} check={check} disabled={busy} id={`platform-subdomain-${venueId}`} />
        {!preview ? <div className="nt-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>{t('subdomain.cancel')}</button><button type="button" className="button button-primary" disabled={!checked || busy} onClick={() => void openPreview()}>{busy ? <span className="spinner"/> : null}{t('subdomain.preview')}</button></div> : <div className="platform-subdomain-confirm" role="group" aria-label={t('subdomain.confirmTitle')}>
          <h3>{t('subdomain.confirmTitle')}</h3>
          <dl className="dev-facts"><div><dt>{t('subdomain.previous')}</dt><dd>{preview.from ?? t('notProvided')}</dd></div><div><dt>{t('subdomain.new')}</dt><dd>{preview.to}</dd></div></dl>
          <p>{t(`subdomain.effect.${preview.environment_state === 'pending_relocation' && preview.old_address_effect === 'previous_kept_as_alias_still_served' ? 'previous_kept_pending_environment' : preview.old_address_effect}`)}</p>
          <p>{preview.environment_state === 'pending_relocation' ? t('subdomain.pendingRelocation') : t('subdomain.newPending')}</p>
          <div className="nt-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => setPreview(null)}>{t('subdomain.cancel')}</button><button type="button" className="button button-primary" disabled={busy} onClick={() => void confirm()}>{busy ? <span className="spinner"/> : null}{t(busy ? 'subdomain.saving' : 'subdomain.confirm')}</button></div>
        </div>}
      </div>}
    </>}
    {!loading && !address && <button type="button" className="button button-secondary" onClick={() => void reload()}><RefreshCw size={17}/>{t('subdomain.retry')}</button>}
  </section>;
}
