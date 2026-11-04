import { useEffect, useRef, useState, type FormEvent } from 'react';
import '../tenant-onboarding.css';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, MailWarning, RefreshCw, RotateCcw, Send, UserRound } from 'lucide-react';
import { useLocale } from '../locales';
import {
  clearDraft, createTenant, emptyTenantForm, invalidFields, loadDraft, onboardingErrorKey, onboardingStatus, OnboardingError,
  resendOwnerInvite, saveDraft, slugify, type OnboardingRequest, type TenantForm,
} from '../lib/tenantOnboarding';

type Step = 0 | 1 | 2 | 3;
const newKey = () => crypto.randomUUID();

// New tenant: venue → initial owner → review → result. The request key is created
// once per wizard and reused on every retry, so a retry never duplicates a venue.
export function NewTenantPage({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const { t, locale } = useLocale();
  const draft = useRef(loadDraft(userId)).current;
  const [form, setForm] = useState<TenantForm>(draft?.form ?? emptyTenantForm(locale));
  const [requestKey, setRequestKey] = useState(draft?.request_key ?? newKey());
  const [submitted, setSubmitted] = useState(draft?.submitted ?? false);
  const [slugTouched, setSlugTouched] = useState(!!draft?.form.slug);
  const [step, setStep] = useState<Step>(draft?.submitted ? 3 : 0);
  const [errors, setErrors] = useState<(keyof TenantForm)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnboardingRequest | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { saveDraft(userId, { request_key: requestKey, form, submitted }); }, [userId, requestKey, form, submitted]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  // After a reload, recover the state of a request that was already sent.
  useEffect(() => {
    if (!draft?.submitted) return;
    setBusy(true);
    onboardingStatus(draft.request_key).then(setResult).catch(e => { if (onboardingErrorKey(e) === 'tenantNew.error.notFound') { setSubmitted(false); setStep(2); } else setError(onboardingErrorKey(e)); }).finally(() => setBusy(false));
  }, [draft]);

  const set = (key: keyof TenantForm, value: string) => setForm(f => {
    const next = { ...f, [key]: value };
    if (key === 'name' && !slugTouched) next.slug = slugify(value);
    return next;
  });
  const next = (from: 0 | 1) => (event: FormEvent) => {
    event.preventDefault();
    const bad = invalidFields(form, from); setErrors(bad);
    if (!bad.length) setStep((from + 1) as Step);
  };
  const run = async (fn: () => Promise<OnboardingRequest>) => {
    setBusy(true); setError(null);
    try { const r = await fn(); setResult(r); setSubmitted(true); setStep(3); onCreated(); }
    catch (e) {
      setError(onboardingErrorKey(e));
      if (e instanceof OnboardingError && e.request) { setResult(e.request); setSubmitted(true); setStep(3); }
      else if (e instanceof OnboardingError && e.key.startsWith('tenantNew.error.') && e.key !== 'tenantNew.error.notFound') {
        // A validation/conflict response can precede creation of the request.
        // Confirm absence before offering edits; never abandon an ambiguous send.
        try { setResult(await onboardingStatus(requestKey)); setStep(3); }
        catch (statusError) {
          if (onboardingErrorKey(statusError) === 'tenantNew.error.notFound') {
            setSubmitted(false); setResult(null); setStep(2);
          }
        }
      }
    } finally { setBusy(false); }
  };
  const submit = () => {
    // Persist before the request leaves the browser, including when its response
    // is lost or the tab reloads while the backend is still provisioning.
    if (!saveDraft(userId, { request_key: requestKey, form, submitted: true })) {
      setError('tenantNew.error.storage'); return;
    }
    setSubmitted(true); setStep(3);
    return run(() => createTenant(form, requestKey));
  };
  const refresh = () => run(async () => {
    try { return await onboardingStatus(requestKey); }
    catch (e) {
      if (onboardingErrorKey(e) === 'tenantNew.error.notFound') { setSubmitted(false); setStep(2); }
      throw e;
    }
  });
  // A key is replaced only once the previous request is known not to have created a venue.
  const startOver = (keepData: boolean) => {
    clearDraft(userId); setRequestKey(newKey()); setSubmitted(false); setResult(null); setError(null);
    if (!keepData) { setForm(emptyTenantForm(locale)); setSlugTouched(false); }
    setStep(0);
  };
  const conflict = error === 'tenantNew.error.conflict' || error === 'tenantNew.error.duplicateSlug';

  const field = (key: keyof TenantForm, label: string, opts: { type?: string; required?: boolean; hint?: string; auto?: string } = {}) => {
    const invalid = errors.includes(key);
    return <label className="field"><span>{t(label)}{opts.required ? ' *' : ''}</span>
      <div className="field-control"><input type={opts.type ?? 'text'} autoComplete={opts.auto} value={form[key]} disabled={busy} aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `nt-${key}-err` : undefined}
        onChange={e => { if (key === 'slug') { setSlugTouched(true); set(key, e.target.value.toLowerCase()); } else set(key, e.target.value); }}/></div>
      {opts.hint && !invalid && <small className="field-hint">{t(opts.hint)}</small>}
      {invalid && <small className="field-error" id={`nt-${key}-err`}>{t(`tenantNew.invalid.${key}`)}</small>}
    </label>;
  };
  const steps = ['tenantNew.stepVenue', 'tenantNew.stepOwner', 'tenantNew.stepReview', 'tenantNew.stepResult'];

  return <div className="page-stack new-tenant-page">
    <Link className="back-link" to="/admin/tenants"><ArrowLeft size={17}/>{t('backToDirectory')}</Link>
    <div className="page-heading"><div><p className="eyebrow">{t('staffArea')}</p><h1>{t('tenantNew.title')}</h1><p>{t('tenantNew.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Building2 size={28}/></div></div>
    <ol className="nt-steps" aria-label={t('tenantNew.progress')}>{steps.map((s, i) => <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{i + 1}</span>{t(s)}</li>)}</ol>
    <section className="detail-panel nt-panel" aria-labelledby="nt-heading">
      <h2 id="nt-heading" ref={heading} tabIndex={-1}>{t(steps[step])}</h2>
      {error && <div className="form-error" role="alert">{t(error)}</div>}
      {step === 0 && <form className="nt-form" onSubmit={next(0)} noValidate>
        {field('name', 'tenantNew.name', { required: true })}
        {field('slug', 'tenantNew.slug', { required: true, hint: 'tenantNew.slugHint' })}
        {field('timezone', 'timezone', { required: true, hint: 'tenantNew.timezoneHint' })}
        {field('email', 'email', { type: 'email', auto: 'off' })}
        {field('phone', 'phone', { type: 'tel', auto: 'off' })}
        {field('address', 'address')}
        {field('city', 'city')}
        {field('state', 'tenantNew.state')}
        <div className="nt-actions"><Link className="button button-secondary" to="/admin/tenants">{t('tenantNew.cancel')}</Link><button type="submit" className="button button-primary">{t('tenantNew.next')}<ArrowRight size={17}/></button></div>
      </form>}
      {step === 1 && <form className="nt-form" onSubmit={next(1)} noValidate>
        <p className="nt-lead nt-wide">{t('tenantNew.ownerLead')}</p>
        {field('owner_email', 'tenantNew.ownerEmail', { type: 'email', required: true, auto: 'off' })}
        {field('owner_first_name', 'tenantNew.ownerFirstName', { required: true, auto: 'off' })}
        {field('owner_last_name', 'tenantNew.ownerLastName', { required: true, auto: 'off' })}
        <label className="field"><span>{t('staff.emailLanguage')}</span><select value={form.locale} onChange={e => set('locale', e.target.value)}><option value="es">Español</option><option value="en">English</option></select></label>
        <div className="nt-actions"><button type="button" className="button button-secondary" onClick={() => setStep(0)}><ArrowLeft size={17}/>{t('tenantNew.back')}</button><button type="submit" className="button button-primary">{t('tenantNew.next')}<ArrowRight size={17}/></button></div>
      </form>}
      {step === 2 && <div className="nt-review">
        <dl className="dev-facts">
          <div><dt>{t('tenantNew.name')}</dt><dd>{form.name}</dd></div><div><dt>{t('tenantNew.slug')}</dt><dd>{form.slug}</dd></div>
          <div><dt>{t('timezone')}</dt><dd>{form.timezone}</dd></div><div><dt>{t('email')}</dt><dd>{form.email || t('notProvided')}</dd></div>
          <div><dt>{t('phone')}</dt><dd>{form.phone || t('notProvided')}</dd></div><div><dt>{t('address')}</dt><dd>{[form.address, form.city, form.state].filter(Boolean).join(', ') || t('notProvided')}</dd></div>
          <div><dt>{t('tenantNew.ownerEmail')}</dt><dd>{form.owner_email}</dd></div><div><dt>{t('tenantNew.ownerName')}</dt><dd>{form.owner_first_name} {form.owner_last_name}</dd></div>
        </dl>
        <p className="nt-lead">{t('tenantNew.reviewNote')}</p>
        <div className="nt-actions">
          <button type="button" className="button button-secondary" onClick={() => setStep(1)} disabled={busy}><ArrowLeft size={17}/>{t('tenantNew.back')}</button>
          {conflict ? <button type="button" className="button button-secondary" onClick={() => { startOver(true); }}><RotateCcw size={17}/>{t('tenantNew.editAndRetry')}</button> : null}
          <button type="button" className="button button-primary" onClick={() => void submit()} disabled={busy}>{busy ? <span className="spinner"/> : <Send size={17}/>}{t(busy ? 'tenantNew.creating' : 'tenantNew.create')}</button>
        </div>
      </div>}
      {step === 3 && <ResultView result={result} busy={busy} onRetry={() => void submit()} onResend={() => void run(() => resendOwnerInvite(requestKey))}
        onRefresh={() => void refresh()} onNew={() => startOver(false)} onEdit={() => startOver(true)}/>}
    </section>
  </div>;
}

function ResultView({ result, busy, onRetry, onResend, onRefresh, onNew, onEdit }: { result: OnboardingRequest | null; busy: boolean; onRetry: () => void; onResend: () => void; onRefresh: () => void; onNew: () => void; onEdit: () => void }) {
  const { t } = useLocale();
  if (!result) return busy ? <p className="nt-lead"><span className="spinner"/> {t('loadingTitle')}</p> : <div><p className="nt-lead">{t('tenantNew.recovering')}</p><div className="nt-actions"><button type="button" className="button button-secondary" onClick={onRefresh}><RefreshCw size={17}/>{t('tenantNew.refresh')}</button><button type="button" className="button button-primary" onClick={onRetry}><RotateCcw size={17}/>{t('tenantNew.retry')}</button></div></div>;
  const venueLink = result.venue_id ? <Link className="button button-primary" to={`/admin/tenants/${encodeURIComponent(result.venue_id)}`}><Building2 size={17}/>{t('tenantNew.openTenant')}</Link> : null;
  if (result.status === 'completed') return <div className="nt-result nt-ok" role="status">
    <CheckCircle2 size={26}/><div><strong>{t('tenantNew.done')}</strong><p>{t(result.email_kind === 'recovery' ? 'tenantNew.doneExistingAccount' : result.email_kind === 'invite' ? 'tenantNew.doneInvited' : 'tenantNew.doneRecovered').replace('{email}', result.owner_email ?? '')}</p><p>{t('tenantNew.doneInactive')}</p></div>
    <div className="nt-actions">{venueLink}<button type="button" className="button button-secondary" onClick={onNew}>{t('tenantNew.another')}</button></div>
  </div>;
  if (result.status === 'invite_failed') return <div className="nt-result nt-warn" role="alert">
    <MailWarning size={26}/><div><strong>{t('tenantNew.inviteFailed')}</strong><p>{t('tenantNew.inviteFailedLead')}</p></div>
    <div className="nt-actions"><button type="button" className="button button-primary" onClick={onResend} disabled={busy}><Send size={17}/>{t('tenantNew.resend')}</button>{venueLink}</div>
  </div>;
  if (result.status === 'failed') return <div className="nt-result nt-warn" role="alert">
    <MailWarning size={26}/><div><strong>{t('tenantNew.failed')}</strong><p>{t('tenantNew.failedLead')}</p></div>
    <div className="nt-actions"><button type="button" className="button button-primary" onClick={onRetry} disabled={busy}><RotateCcw size={17}/>{t('tenantNew.retry')}</button><button type="button" className="button button-secondary" onClick={onEdit} disabled={busy}>{t('tenantNew.editAndRetry')}</button></div>
  </div>;
  return <div className="nt-result" role="status"><UserRound size={26}/><div><strong>{t('tenantNew.inProgress')}</strong><p>{t('tenantNew.inProgressLead')}</p></div>
    <div className="nt-actions"><button type="button" className="button button-primary" onClick={onRetry} disabled={busy}><RotateCcw size={17}/>{t('tenantNew.retry')}</button><button type="button" className="button button-secondary" onClick={onRefresh} disabled={busy}><RefreshCw size={17}/>{t('tenantNew.refresh')}</button></div>
  </div>;
}
