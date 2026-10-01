import { useLocale } from '../locales';

export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  return <div className="language-switch" role="group" aria-label={t('language')}>
    <button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
    <button type="button" className={locale === 'es' ? 'selected' : ''} aria-pressed={locale === 'es'} onClick={() => setLocale('es')}>ES</button>
  </div>;
}
