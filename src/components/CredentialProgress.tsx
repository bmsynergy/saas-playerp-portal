import { AlertTriangle, Check, Clock3, RefreshCw } from 'lucide-react';
import type { CredentialProgressView } from '../lib/psCredentialOperation';
import { useLocale } from '../locales';
import './credential-progress.css';

type Props = {
  operation: CredentialProgressView;
  compact?: boolean;
  onRetry?: () => void;
  reconcileHref?: string;
  onReconcile?: () => void;
};

const waitingPhases = new Set<CredentialProgressView['phase']>(['sending', 'accepted', 'pending', 'offline', 'received']);
const credentialErrors = new Set(['no_device_credentials', 'wifi_not_confirmed', 'admin_code_not_confirmed']);
const safeErrors: Record<string, string> = {
  'dev.error.device_not_assigned': 'dev.error.device_not_assigned',
  device_not_assigned: 'dev.error.device_not_assigned',
  'dev.error.device_offline': 'dev.progress.error.device_offline',
  'dev.progress.requestRejectedUnknown': 'dev.progress.requestRejectedUnknown',
  'ps.error.noActivePrintServer': 'ps.error.noActivePrintServer',
  'ps.error.printServerNotFound': 'ps.error.printServerNotFound',
  'ps.error.venueNotFound': 'ps.error.venueNotFound',
  no_device_credentials: 'dev.error.no_device_credentials',
  wifi_not_confirmed: 'dev.error.wifi_not_confirmed',
  admin_code_not_confirmed: 'dev.error.admin_code_not_confirmed',
  no_active_print_server: 'dev.error.no_active_print_server',
  operation_pending: 'dev.progress.error.operation_pending',
  rotation_pending: 'dev.progress.error.operation_pending',
  device_offline: 'dev.progress.error.device_offline',
  apply_failed: 'dev.progress.error.apply_failed',
  wifi_apply_failed: 'dev.progress.error.wifi_apply_failed',
  admin_code_apply_failed: 'dev.progress.error.admin_code_apply_failed',
  timeout: 'dev.progress.error.timeout',
  expired: 'dev.progress.error.expired',
  cancelled: 'dev.progress.error.cancelled',
  invalid_value: 'dev.progress.error.invalid_value',
  unsupported: 'dev.progress.error.unsupported',
  internal_error: 'dev.progress.error.internal_error',
  'dev.error.apply_failed': 'dev.progress.error.apply_failed',
  'dev.error.wifi_apply_failed': 'dev.progress.error.wifi_apply_failed',
  'dev.error.admin_code_apply_failed': 'dev.progress.error.admin_code_apply_failed',
  'dev.error.timeout': 'dev.progress.error.timeout',
  'dev.error.expired': 'dev.progress.error.expired',
  'dev.error.cancelled': 'dev.progress.error.cancelled',
  'dev.error.invalid_value': 'dev.progress.error.invalid_value',
  'dev.error.unsupported': 'dev.progress.error.unsupported',
  'dev.error.internal_error': 'dev.progress.error.internal_error',
  accessDenied: 'dev.progress.error.accessDenied',
  sessionExpired: 'dev.progress.error.sessionExpired',
  networkError: 'dev.progress.error.networkError',
  'dev.error.no_device_credentials': 'dev.error.no_device_credentials',
  'dev.error.wifi_not_confirmed': 'dev.error.wifi_not_confirmed',
  'dev.error.admin_code_not_confirmed': 'dev.error.admin_code_not_confirmed',
};
const safeReasons: Record<string, string> = {
  awaiting_device: 'dev.progress.wait.awaiting_device',
  device_offline: 'dev.progress.wait.device_offline',
  ota_active: 'dev.progress.wait.ota_active',
  reboot_pending: 'dev.progress.wait.reboot_pending',
  wifi_change: 'dev.progress.wait.wifi_change',
  printing: 'dev.progress.wait.printing',
  safety_check_unavailable: 'dev.progress.wait.safety_check_unavailable',
  bridge_unavailable: 'dev.progress.wait.bridge_unavailable',
  other: 'dev.progress.wait.other',
  applying: 'dev.progress.wait.applying',
};

export function CredentialProgress({ operation, compact = false, onRetry, reconcileHref, onReconcile }: Props) {
  const { t, locale } = useLocale();
  const waiting = waitingPhases.has(operation.phase);
  const isCredentialError = !!operation.errorKey && credentialErrors.has(operation.errorKey.replace(/^dev\.error\./, ''));
  const formatDate = (value: string | null) => {
    if (!value) return t('notProvided');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? t('notProvided') : new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  };
  const errorKey = operation.errorKey ? safeErrors[operation.errorKey] : undefined;
  const reasonKey = operation.waitReason ? safeReasons[operation.waitReason] : undefined;

  return <section
    className={`credential-progress credential-progress-${operation.phase}${compact ? ' credential-progress-compact' : ''}`}
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid={`${compact ? 'dev-rotation-dialog-status' : 'dev-rotation-status'}-${operation.kind}`}
    data-phase={operation.phase}
    data-command-id={operation.commandId ?? undefined}
  >
    <div className="credential-progress-head">
      <span className="credential-progress-icon" aria-hidden="true">
        {waiting ? <span className="credential-progress-spinner"/> : operation.phase === 'applied' ? <Check size={17}/> : <AlertTriangle size={17}/>}
      </span>
      <div className="credential-progress-heading">
        <strong>{t(`dev.progress.kind.${operation.kind}`)}</strong>
        <span>{t(`dev.progress.phase.${operation.phase}`)}</span>
      </div>
    </div>
    <p className="credential-progress-message">
      {operation.phase === 'failed' || operation.phase === 'rejected'
        ? t(errorKey ?? 'dev.progress.rotationErrorUnknown')
        : t(`dev.progress.description.${operation.phase}`)}
    </p>
    {operation.already && <p className="credential-progress-note">{t('dev.progress.existingOrder')}</p>}
    {waiting && <p className="credential-progress-note"><Clock3 size={14} aria-hidden="true"/>{t(reasonKey ?? 'dev.progress.wait.unknown')}</p>}
    {waiting && <p className="credential-progress-note">{t('dev.progress.wait.durationUnknown')}</p>}
    {operation.previousKept && operation.phase !== 'applied' && <p className="credential-progress-note">{t('dev.progress.previousKept')}</p>}
    {(operation.phase === 'failed' || operation.phase === 'rejected') && <p className="credential-progress-note">{t(`dev.progress.action.${operation.phase}`)}</p>}
    {operation.phase === 'uncertain' && <p className="credential-progress-note">{t('dev.progress.action.uncertain')}</p>}
    {isCredentialError && <p className="credential-progress-note">{t('dev.progress.credentialsStep')}</p>}
    <dl className="credential-progress-dates">
      <div><dt>{t('dev.progress.requestedAt')}</dt><dd>{formatDate(operation.requestedAt)}</dd></div>
      <div><dt>{t('dev.progress.updatedAt')}</dt><dd>{formatDate(operation.updatedAt)}</dd></div>
    </dl>
    {((operation.canCheckStatus && onRetry) || (isCredentialError && reconcileHref)) && <div className="credential-progress-actions">
      {operation.canCheckStatus && onRetry && <button type="button" className="button button-secondary" onClick={onRetry}><RefreshCw size={15} aria-hidden="true"/>{t('dev.progress.checkStatus')}</button>}
      {isCredentialError && reconcileHref && <a className="button button-secondary" href={reconcileHref} onClick={onReconcile}>{t('dev.progress.reconcileLink')}</a>}
    </div>}
  </section>;
}
