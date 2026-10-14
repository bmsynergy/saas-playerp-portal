import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROD_URL, resolvePortalConfig, verifyPublicKey } from '../build/portal-config';
import * as dev from '../build/dev-defaults';

const anon = (overrides = {}) => [
  Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role: 'anon', ref: 'uzzchmvinutuoygtziie', iss: 'supabase', exp: 4102444800, ...overrides })).toString('base64url'),
  'test-signature-not-a-real-key',
].join('.');
const prod = (publicKey = anon()) => ({ SUPABASE_URL: PROD_URL, SUPABASE_PUBLIC_KEY: publicKey });
afterEach(() => { vi.doUnmock('../src/lib/config'); vi.unstubAllGlobals(); vi.resetModules(); });

describe('portal environment isolation', () => {
  it('preserves the legacy DEV project and storage names', () => {
    expect(resolvePortalConfig({})).toEqual({ environment: 'dev', url: dev.SUPABASE_URL,
      publicKey: dev.SUPABASE_PUBLIC_KEY, authStorageKey: dev.AUTH_STORAGE_KEY, auxiliaryPrefix: 'playerp.portal.' });
  });
  it('requires explicit PROD configuration without falling back to DEV', () => {
    for (const env of [{}, { SUPABASE_URL: PROD_URL }, { SUPABASE_PUBLIC_KEY: anon() },
      { ...prod(), SUPABASE_URL: dev.SUPABASE_URL }, { ...prod(), PORTAL_ENV: 'dev' },
      { ...prod(), PORTAL_ENV: 'staging' }]) expect(() => resolvePortalConfig(env, 'prod')).toThrow();
  });
  it('rejects privileged, foreign, expired and malformed keys', () => {
    for (const key of ['sb_secret_test', anon({ role: 'service_role' }), anon({ ref: 'another-project' }),
      anon({ exp: 1 }), anon({ iss: 'other' }), 'invalid', dev.SUPABASE_PUBLIC_KEY]) {
      expect(() => resolvePortalConfig(prod(key), 'prod')).toThrow();
    }
  });
  it('isolates PROD names and supports explicit env selection', () => {
    const config = resolvePortalConfig({ ...prod(), PORTAL_ENV: 'prod' });
    expect(config.authStorageKey).toBe('playerp.portal.prod.auth');
    expect(config.auxiliaryPrefix).toBe('playerp.portal.prod.');
    expect(() => resolvePortalConfig(prod(), 'development')).toThrow();
  });
  it('requires online attribution of opaque publishable keys and signed anon keys', async () => {
    for (const key of ['sb_publishable_test', anon()]) {
      const config = resolvePortalConfig(prod(key), 'prod');
      const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ external: {} })));
      await verifyPublicKey(config, request);
      expect(request.mock.calls[0][0]).toBe(`${PROD_URL}/auth/v1/settings`);
      expect(request.mock.calls[0][1].headers).toEqual({ apikey: key });
      await expect(verifyPublicKey(config, vi.fn().mockResolvedValue(new Response('', { status: 401 })))).rejects.toThrow();
      await expect(verifyPublicKey(config, vi.fn().mockRejectedValue(new Error('offline')))).rejects.toThrow();
    }
  });
  it('does not consume or clear DEV recovery, invitation, venue or scope state from PROD', async () => {
    vi.resetModules();
    vi.doMock('../src/lib/config', () => ({ AUXILIARY_STORAGE_PREFIX: 'playerp.portal.prod.' }));
    const local = new Map([['playerp.portal.venue.owner', 'dev'], ['playerp.portal.prod.venue.owner', 'prod']]);
    const session = new Map([['playerp.portal.recovery', '1'], ['playerp.portal.invitation', '1'], ['playerp.portal.scope.owner', 'admin']]);
    const storage = (map: Map<string, string>) => new Proxy({
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k),
    }, { ownKeys: () => [...map.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
    vi.stubGlobal('localStorage', storage(local)); vi.stubGlobal('sessionStorage', storage(session));
    const state = await import('../src/lib/storage');
    const access = await import('../src/lib/access');
    expect(state.recoveryPending()).toBe(false); expect(state.invitationPending()).toBe(false);
    expect(access.preferredScope('owner')).toBeNull();
    state.recoveryPending(true); state.invitationPending(true); access.chooseScope('owner', 'owner');
    expect(session.get('playerp.portal.prod.recovery')).toBe('1');
    expect(session.get('playerp.portal.prod.invitation')).toBe('1');
    expect(access.preferredScope('owner')).toBe('owner');
    state.recoveryPending(false); state.invitationPending(false); access.clearScopes(); state.clearVenueSelection();
    expect([...local]).toEqual([['playerp.portal.venue.owner', 'dev']]);
    expect([...session]).toEqual([['playerp.portal.recovery', '1'], ['playerp.portal.invitation', '1'], ['playerp.portal.scope.owner', 'admin']]);
  });
});
