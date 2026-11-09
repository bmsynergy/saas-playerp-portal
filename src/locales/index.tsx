import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: string) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = 'playerp.locale';

function initialLocale(): Locale {
  const lang = new URLSearchParams(window.location.search).get('lang');
  if (lang === 'en' || lang === 'es') return lang;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* Private browsing can disable storage. */ }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    // An explicit language in an invitation/recovery URL must not undo a later
    // user choice on reload. Preserve the route, router state and auth fragment.
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', next);
      window.history.replaceState(window.history.state, '', url);
    }
    updateLocale(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem(storageKey, locale); } catch { /* Continue without persistence. */ }
  }, [locale]);
  const value = useMemo<LocaleContextValue>(() => ({
    locale, setLocale,
    t: (key) => (locale === 'es' ? es : en)[key as keyof typeof en] ?? en[key as keyof typeof en] ?? key,
  }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale requires LocaleProvider');
  return context;
}
