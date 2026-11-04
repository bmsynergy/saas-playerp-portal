import type { SubdomainCheck } from '../lib/platformSubdomain';
import { useLocale } from '../locales';

type State = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error';

export function PlatformSubdomainField({ value, onChange, state, check, disabled = false, id = 'platform-subdomain' }: {
  value: string; onChange: (value: string) => void; state: State; check: SubdomainCheck | null; disabled?: boolean; id?: string;
}) {
  const { t } = useLocale();
  const reason = check?.reason === 'reserved' ? 'reserved' : check?.reason === 'invalid_format' ? 'invalid' : check?.reason === 'taken' ? 'unavailable' : null;
  const statusKey = check?.reason === 'current' ? 'current' : reason ?? state;
  return <div className="field platform-subdomain-field">
    <label htmlFor={id}>{t('subdomain.label')} *</label>
    <div className="field-control"><input id={id} type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" value={value} disabled={disabled}
      aria-invalid={state === 'invalid' || state === 'unavailable' || undefined} aria-describedby={`${id}-hint ${id}-status`} onChange={event => onChange(event.target.value)} /></div>
    <small className="field-hint" id={`${id}-hint`}>{t('subdomain.hint')}</small>
    <div className={`platform-subdomain-status platform-subdomain-${state}`} id={`${id}-status`} role="status" aria-live="polite">
      {value ? t(`subdomain.status.${statusKey}`) : t('subdomain.status.idle')}
    </div>
    {check?.domain && <div className="platform-subdomain-address"><span>{t('subdomain.address')}</span><strong>{check.domain}</strong><small>{check.environment_state === 'pending_relocation' ? t('subdomain.pendingRelocation') : t('subdomain.addressPreview')}</small></div>}
  </div>;
}
