import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, FileQuestion, LockKeyhole, PackageOpen, RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';

type Props = { kind: 'loading' | 'error' | 'denied' | 'empty' | 'notFound'; onRetry?: () => void; message?: string; allowHome?: boolean };

export function StateView({ kind, onRetry, message, allowHome = true }: Props) {
  const { t } = useLocale();
  const copy = {
    loading: ['loadingTitle', 'loadingBody'], error: ['errorTitle', 'errorBody'], denied: ['deniedTitle', 'deniedBody'],
    empty: ['emptyTitle', 'emptyBody'], notFound: ['notFoundTitle', 'notFoundBody'],
  }[kind];
  const Icon = { loading: RefreshCw, error: AlertCircle, denied: LockKeyhole, empty: PackageOpen, notFound: FileQuestion }[kind];
  return <section className={`state-view state-${kind}`} aria-live={kind === 'loading' ? 'polite' : 'assertive'}>
    <div className="state-icon" aria-hidden="true">{kind === 'loading' ? <span className="spinner"/> : <Icon size={28} strokeWidth={1.7}/>}</div>
    <h1>{t(copy[0])}</h1><p>{message ? t(message) : t(copy[1])}</p>
    {kind === 'error' && onRetry && <button type="button" className="button button-primary" onClick={onRetry}><RefreshCw size={17}/>{t('retry')}</button>}
    {allowHome && (kind === 'denied' || kind === 'notFound') && <Link className="button button-secondary" to="/"><ArrowLeft size={17}/>{t('goHome')}</Link>}
  </section>;
}
