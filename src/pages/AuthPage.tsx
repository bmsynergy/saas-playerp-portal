import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useLocale } from '../locales';
import type { UiError } from '../lib/types';
import { Brand } from '../components/Brand';

type Props = { mode: 'login' | 'forgot' | 'password'; onSubmit: (email: string, password: string) => Promise<void>; error: UiError | null; busy: boolean; success: boolean; recovery?: boolean; invitation?: boolean; embedded?: boolean };

export function AuthPage({ mode, onSubmit, error, busy, success, recovery = false, invitation = false, embedded = false }: Props) {
  const { locale, setLocale, t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<UiError | null>(null);
  const isLogin = mode === 'login';
  const isForgot = mode === 'forgot';
  const key = isLogin ? 'login' : isForgot ? 'forgot' : invitation ? 'invitation' : 'password';
  const MainTag = embedded ? 'section' : 'main';

  useEffect(() => {
    if (success) { setPassword(''); setConfirmation(''); }
  }, [success]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if ((mode !== 'password' && !email.trim()) || (mode !== 'forgot' && !password) || (mode === 'password' && !confirmation)) {
      setLocalError('requiredFields'); return;
    }
    if (mode !== 'password' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError('invalidEmail'); return;
    }
    if (mode === 'password') {
      if (password.length < 12) { setLocalError('weakPassword'); return; }
      if (password !== confirmation) { setLocalError('passwordMismatch'); return; }
    }
    await onSubmit(email.trim(), password);
  }

  return <div className={`auth-layout ${embedded ? 'auth-embedded' : ''}`}>
    {!embedded && <div className="auth-side">
      <div className="auth-side-content">
        <Link to="/auth/login" className="brand auth-brand"><Brand inverse /></Link>
        <div className="auth-side-message"><span className="auth-side-eyebrow"><span/> {t('workspace')}</span><h2>{t('tagline')}.</h2><p>{t('securityNote')}</p></div>
        <div className="auth-side-decoration" aria-hidden="true"><span/><span/><span/></div>
      </div>
      <span className="auth-side-footer">© {new Date().getFullYear()} PlayERP</span>
    </div>}
    <MainTag className="auth-main">
      {!embedded && <div className="auth-top"><div className="language-switch" role="group" aria-label={t('language')}><button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button><button type="button" className={locale === 'es' ? 'selected' : ''} aria-pressed={locale === 'es'} onClick={() => setLocale('es')}>ES</button></div></div>}
      <div className="auth-content">{!embedded && <div className="auth-mobile-brand"><Brand /></div>}
        <div className="auth-icon"><ShieldCheck size={24} strokeWidth={1.7}/></div>
        <p className="eyebrow">{t(`${key}Eyebrow`)}</p><h1>{t(`${key}Title`)}</h1><p className="auth-lead">{t(`${key}Lead`)}</p>
        {success ? <div className="auth-success" role="status"><div className="success-icon"><CheckCircle2 size={25}/></div><h2>{t(isForgot ? 'resetSentTitle' : invitation ? 'invitationSavedTitle' : 'passwordSavedTitle')}</h2><p>{t(isForgot ? 'resetSentBody' : invitation ? 'invitationSavedBody' : 'passwordSavedBody')}</p><Link className="button button-primary button-wide" to={isForgot ? '/auth/login' : '/auth/complete'}>{t(isForgot ? 'backToSignIn' : 'continuePortal')}<ArrowRight size={18}/></Link></div> : <>
          {(error || localError) && <div className="form-error" role="alert"><LockKeyhole size={18}/><span>{t(localError || error || 'genericError')}</span></div>}
          <form className="auth-form" onSubmit={submit} noValidate>
            {mode !== 'password' && <label className="field"><span>{t('emailLabel')}</span><div className="field-control"><Mail size={19}/><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('emailPlaceholder')} disabled={busy}/></div></label>}
            {mode !== 'forgot' && <label className="field"><span>{t(isLogin ? 'passwordLabel' : 'newPasswordLabel')}</span><div className="field-control"><LockKeyhole size={19}/><input type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t(isLogin ? 'passwordPlaceholder' : 'newPasswordPlaceholder')} disabled={busy}/><button className="password-eye" type="button" aria-label={t(showPassword ? 'hidePassword' : 'showPassword')} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>}
            {mode === 'password' && <label className="field"><span>{t('confirmPasswordLabel')}</span><div className="field-control"><LockKeyhole size={19}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={t('confirmPasswordPlaceholder')} disabled={busy}/></div></label>}
            {isLogin && <div className="form-inline"><Link to="/auth/forgot">{t('forgotPassword')}</Link></div>}
            <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>{t(busy ? isLogin ? 'signingIn' : isForgot ? 'sendingReset' : 'savingPassword' : isLogin ? 'signIn' : isForgot ? 'sendReset' : 'savePassword')}<ArrowRight size={18}/></button>
          </form>
          {!isLogin && <div className="auth-back"><Link to={recovery && mode === 'password' ? '/auth/forgot' : '/auth/login'}>{t(recovery && mode === 'password' ? 'forgotPassword' : 'backToSignIn')}</Link></div>}
        </>}
      </div>
      {!embedded && <div className="auth-bottom"><ShieldCheck size={16}/>{t('securityNote')}</div>}
    </MainTag>
  </div>;
}
