import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: string) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = 'playerp.locale';

function initialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* Private browsing can disable storage. */ }
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem(storageKey, locale); } catch { /* Continue without persistence. */ }
  }, [locale]);
  const value = useMemo<LocaleContextValue>(() => ({
    locale, setLocale,
    t: (key) => (locale === 'es' ? es : en)[key as keyof typeof en] ?? en[key as keyof typeof en] ?? key,
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale requires LocaleProvider');
  return context;
}
