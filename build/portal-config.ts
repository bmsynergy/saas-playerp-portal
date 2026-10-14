import * as dev from './dev-defaults';

export const PROD_URL = 'https://uzzchmvinutuoygtziie.supabase.co';
export function resolvePortalConfig(env: Record<string, string | undefined>, mode = 'development') {
  const environment = env.PORTAL_ENV ?? (mode === 'prod' ? 'prod' : 'dev');
  if (!['dev', 'prod'].includes(environment) || (mode === 'prod' && environment !== 'prod')) {
    throw new Error('Invalid portal environment');
  }
  if (environment === 'dev') {
    if ((env.SUPABASE_URL && env.SUPABASE_URL !== dev.SUPABASE_URL) ||
        (env.SUPABASE_PUBLIC_KEY && env.SUPABASE_PUBLIC_KEY !== dev.SUPABASE_PUBLIC_KEY)) {
      throw new Error('DEV must preserve its existing project configuration');
    }
    return { environment, url: dev.SUPABASE_URL, publicKey: dev.SUPABASE_PUBLIC_KEY,
      authStorageKey: dev.AUTH_STORAGE_KEY, auxiliaryPrefix: 'playerp.portal.' };
  }
  const url = env.SUPABASE_URL;
  const publicKey = env.SUPABASE_PUBLIC_KEY;
  if (url !== PROD_URL || !publicKey) throw new Error('PROD requires its exact Supabase URL and a public key');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)) {
    try {
      const parts = publicKey.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (parts.length !== 3 || header.alg !== 'HS256' || !parts[2] ||
          claims.role !== 'anon' || claims.ref !== 'uzzchmvinutuoygtziie' ||
          claims.iss !== 'supabase' || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw new Error();
    } catch { throw new Error('PROD accepts only a publishable key or an unexpired anon key of its project'); }
  }
  return { environment, url, publicKey, authStorageKey: 'playerp.portal.prod.auth', auxiliaryPrefix: 'playerp.portal.prod.' };
}

// Opaque publishable keys cannot be attributed to a project by inspecting their text.
// Validate both key formats with the target Auth gateway, without a user session.
export async function verifyPublicKey(config: ReturnType<typeof resolvePortalConfig>, request = fetch) {
  if (config.environment !== 'prod') return;
  const response = await request(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publicKey }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('PROD public key rejected by the target Auth gateway');
  const settings = await response.json();
  if (!settings || typeof settings.external !== 'object') throw new Error('Unexpected PROD Auth settings response');
}
