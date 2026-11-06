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
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
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
  const canOpen = Boolean(current?.public_url && current.operational && current.environment_state === 'live' && current.serving_state === 'verified');
  const mainStatus = current?.address_state === 'ambiguous' ? t('subdomain.state.ambiguous')
    : canOpen ? t('subdomain.status.available')
    : current?.address_state === 'disabled' || current?.serving_state === 'disabled' ? t('subdomain.state.disabled')
    : current?.domain ? t('subdomain.notAvailableYet') : t('subdomain.state.not_configured');
  const copyDomain = async (domain: string) => {
    try {
      await navigator.clipboard.writeText(domain);
      setCopiedDomain(domain); setCopyError(false);
    } catch { setCopiedDomain(null); setCopyError(true); }
  };

  return <section className="detail-panel platform-subdomain-panel" aria-labelledby="platform-subdomain-heading">
    <div className="section-heading"><h2 id="platform-subdomain-heading">{t('subdomain.panelTitle')}</h2><Globe2 size={23} aria-hidden="true" /></div>
    {loading && !address ? <p role="status">{t('loadingTitle')}</p> : null}
    {error && <div className="form-error" role="alert">{t(error)}</div>}
    {success && <div className="platform-subdomain-success" role="status"><CheckCircle2 size={18}/>{t(success === 'current' ? 'subdomain.alreadyCurrent' : 'subdomain.savedPending')}</div>}
    {address && current && <>
      <div className="platform-subdomain-current">
        <span className="platform-subdomain-label">{t('subdomain.currentAddress')}</span>
        <strong className="platform-subdomain-address">{current.domain ?? t('subdomain.noAddress')}</strong>
        <span className={`platform-subdomain-status${canOpen ? ' is-available' : ''}`}>{mainStatus}</span>
        {!canOpen && current.domain && current.address_state !== 'ambiguous' && current.address_state !== 'disabled' && current.serving_state !== 'disabled' && <p className="platform-subdomain-help">{t('subdomain.pendingHelp')}</p>}
      </div>
      <div className="platform-subdomain-actions">
        {current.domain && <button type="button" className="button button-secondary" onClick={() => void copyDomain(current.domain!)}>{t('subdomain.copy')}</button>}
        {canOpen && <a className="button button-secondary" href={current.public_url!} target="_blank" rel="noopener noreferrer">{t('subdomain.openSite')}</a>}
        {canEdit && !editing && current.address_state !== 'ambiguous' && <button type="button" className="button button-secondary" onClick={startEdit}>{t('subdomain.edit')}</button>}
      </div>
      <p className="platform-subdomain-copy-feedback" role="status" aria-live="polite">{copyError ? t('subdomain.copyError') : copiedDomain ? t('subdomain.copied') : null}</p>
      {address.aliases.length > 0 && <details className="platform-subdomain-aliases"><summary><span>{t('subdomain.aliases')}</span><span className="platform-subdomain-count">{address.aliases.length}</span></summary><ul>{address.aliases.map(item => <li key={item.domain}><div className="platform-subdomain-alias-info"><strong>{item.domain}</strong><span>{item.status === 'verified' ? t('subdomain.aliasReserved') : stateKey(item.status)}</span></div><button type="button" className="button button-secondary" onClick={() => void copyDomain(item.domain)}>{t('subdomain.copy')}</button></li>)}</ul><p>{t('subdomain.aliasNote')}</p></details>}
      {current.address_state === 'ambiguous' && <div className="platform-subdomain-warning" role="status"><p>{t('subdomain.ambiguous')}</p><ul>{current.candidates.map(candidate => <li key={candidate}>{candidate}</li>)}</ul></div>}
      {error && address && <div className="nt-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => void reload()}><RefreshCw size={17}/>{t('subdomain.reload')}</button></div>}
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
