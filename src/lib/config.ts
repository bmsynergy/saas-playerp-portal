// Injected by Vite after environment and public-key validation.
declare const __PORTAL_CONFIG__: {
  environment: string; url: string; publicKey: string; authStorageKey: string; auxiliaryPrefix: string;
};
const config = __PORTAL_CONFIG__;
// A DEV artifact accidentally mounted on the production host must fail closed.
if (typeof window !== 'undefined' && window.location.hostname === 'portal.playerp.net' &&
    (config.environment !== 'prod' || config.url !== 'https://uzzchmvinutuoygtziie.supabase.co')) {
  throw new Error('Portal production configuration required');
}
export const SUPABASE_URL = config.url;
export const SUPABASE_PUBLIC_KEY = config.publicKey;
export const AUTH_STORAGE_KEY = config.authStorageKey;
export const AUXILIARY_STORAGE_PREFIX = config.auxiliaryPrefix;
