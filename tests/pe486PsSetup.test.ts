import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'u1', email: 'fixture@example.test' } }, loading: false, recovery: false, invitation: false, expire: vi.fn() }) }));
vi.mock('../src/locales', async () => { const { es } = await import('../src/locales/es'); return { useLocale: () => ({ locale: 'es', setLocale: vi.fn(), t: (k: string) => (es as Record<string, string>)[k] ?? k }) }; });
import live from '../docs/evidence/pe469/live-contract.json';
import { initialInstallKits, listInstallKits, type InstallKit } from '../src/lib/firmware';
import { pickBootableImage, setupProgress, shaCommand, type SetupInput } from '../src/lib/psSetup';
import { projectResolvedDevice, type ResolvedDevice } from '../src/lib/psResolvedDevice';
import { PsDeviceSetup, downloadBootableImage } from '../src/components/PsDeviceSetup';
import type { AdminDeviceDetail } from '../src/lib/psAdminDevice';
import type { PortalAccess } from '../src/lib/types';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const SHA = 'ab'.repeat(32), PATH = '/admin/print-servers/devices/x';
const kit = (id: string, kind: InstallKit['kind'], created_at: string | null): InstallKit => ({ id, kind, release_id: 'rel-1', release_version: '0.3.21', release_sha256: null, profile: 'prod',
  file_name: `playerp-ps-${id}.img.xz`, sha256: SHA, bytes: 524288000, base_image_name: 'raspios-bookworm-arm64-lite.img.xz', base_image_url: null, base_image_sha256: null, built_from_commit: null, created_at });
const base = (o: Partial<SetupInput> = {}): SetupInput => ({ preparation: 'not_started', prepared: false, online: false, ring: null, ...o });
const states = (input: SetupInput) => Object.fromEntries(setupProgress(input).steps.map(s => [s.key, s.state]));
const superAdmin: PortalAccess = { is_platform_staff: true, can_manage_staff: true, can_view_tenants: true, platform_role: 'super_admin', owner_venues: [] };
const support: PortalAccess = { is_platform_staff: true, can_manage_staff: false, can_view_tenants: false, platform_role: 'support', owner_venues: [] };
const owner: PortalAccess = { ...support, is_platform_staff: false, platform_role: null, owner_venues: [] };

function device(link: Partial<ResolvedDevice['link']>, online: boolean | null): ResolvedDevice {
  const r = live.resolved[0] as unknown as Record<string, unknown>;
  const d = projectResolvedDevice(structuredClone(r), String(r.requested_id));
  return { ...d, link: { ...d.link, ...link }, runtime: online === null ? null : { ...d.runtime!, online } };
}
const detail = (ring: 'lab' | 'canary' | 'general' | null) => ({ update: { effective_ring: ring, ota: { channel: ring ? { ring, revision: 1 } : null } } }) as unknown as AdminDeviceDetail;
function render(access: PortalAccess, d: ResolvedDevice, opts: { kits?: InstallKit[]; ring?: 'lab' | 'canary' | 'general' | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['access', 'u1', PATH], access);
  if (opts.kits) qc.setQueryData(['ps-install-kits', 'u1'], opts.kits);
  if (opts.ring !== undefined) qc.setQueryData(['ps-admin-device', 'u1', d.device_id], detail(opts.ring));
  const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, { initialEntries: [PATH] }, createElement(PsDeviceSetup, { device: d }))));
  return { html, qc };
}
const stepState = (html: string, key: string) => html.match(new RegExp(`data-testid="ps-setup-step-${key}" data-state="([a-z]+)"`))?.[1];

beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }); });

describe('PE-486 setup step states (server data only)', () => {
  it('new device: local steps and prepare current, nothing else started', () => {
    expect(states(base())).toEqual({ download: 'current', flash: 'current', boot: 'current', prepare: 'current', link: 'pending', online: 'pending', channel: 'pending' });
    expect(setupProgress(base())).toMatchObject({ done: 0, total: 4, codeExpired: false });
  });
  it('code_issued: prepare done, link current', () => {
    expect(states(base({ preparation: 'code_issued' }))).toMatchObject({ prepare: 'done', link: 'current', online: 'pending', download: 'current' });
    expect(setupProgress(base({ preparation: 'code_issued' })).done).toBe(1);
  });
  it('prepared: link done, online current, local steps done', () => {
    for (const input of [base({ preparation: 'prepared' }), base({ preparation: 'code_issued', prepared: true })])
      expect(states(input)).toEqual({ download: 'done', flash: 'done', boot: 'done', prepare: 'done', link: 'done', online: 'current', channel: 'pending' });
  });
  it('online with a known channel: everything done', () => {
    const p = setupProgress(base({ preparation: 'prepared', prepared: true, online: true, ring: 'canary' }));
    expect(p.steps.every(s => s.state === 'done')).toBe(true); expect(p.done).toBe(4);
    expect(states(base({ preparation: 'prepared', prepared: true, online: true }))).toMatchObject({ online: 'done', channel: 'current' });
    expect(states(base({ preparation: 'prepared', prepared: true, ring: 'general' }))).toMatchObject({ channel: 'pending' });
  });
  it('code_expired: prepare in error, link pending', () => {
    const p = setupProgress(base({ preparation: 'code_expired' }));
    expect(p.codeExpired).toBe(true); expect(states(base({ preparation: 'code_expired' }))).toMatchObject({ prepare: 'error', link: 'pending' }); expect(p.done).toBe(0);
  });
});

describe('PE-486 kit kind', () => {
  it('kit_list projection defaults an absent or unknown kind to initial_install', async () => {
    const raw = { id: 'k', release_id: 'r', sha256: SHA, file_name: 'f.zip' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, kits: [raw, { ...raw, id: 'k2', kind: 'weird' }, { ...raw, id: 'k3', kind: 'bootable_image', storage_bucket: 'private' }] }), { status: 200 })));
    const kits = await listInstallKits();
    expect(kits.map(k => k.kind)).toEqual(['initial_install', 'initial_install', 'bootable_image']);
    expect(kits[2]).not.toHaveProperty('storage_bucket');
  });
  it('the Firmwares page keeps only initial install kits; Setup picks the newest bootable image', () => {
    const kits = [kit('a', 'initial_install', '2026-10-10T00:00:00Z'), kit('b', 'bootable_image', '2026-10-01T00:00:00Z'), kit('c', 'bootable_image', '2026-10-12T00:00:00Z'), kit('d', 'bootable_image', null)];
    expect(initialInstallKits(kits).map(k => k.id)).toEqual(['a']);
    expect(pickBootableImage(kits)?.id).toBe('c');
    expect(pickBootableImage([kits[0]])).toBeNull();
    expect(shaCommand('x.img.xz')).toBe('shasum -a 256 x.img.xz');
  });
});

describe('PE-486 PsDeviceSetup', () => {
  it('super_admin sees steps, full SHA-256, verification command, troubleshooting and limits — never a pse_ code', () => {
    const d = device({ prepared: false, state: 'pendiente_preparacion', preparation: { state: 'code_issued', code_expires_at: null, prepared_at: null } }, null);
    const { html } = render(superAdmin, d, { kits: [kit('img', 'bootable_image', '2026-10-12T00:00:00Z'), kit('zip', 'initial_install', '2026-10-13T00:00:00Z')], ring: null });
    expect(html).toContain('Setup del Print Server'); expect(html).toContain('id="ps-setup"');
    expect(html).toContain(`data-testid="ps-setup-sha">${SHA}</code>`); expect(html).toContain('shasum -a 256 playerp-ps-img.img.xz'); expect(html).not.toContain('playerp-ps-zip');
    expect(html).toContain('data-testid="ps-setup-download"'); expect(html).toContain('500.0 MB'); expect(html).toContain('0.3.21'); expect(html).toContain('raspios-bookworm-arm64-lite.img.xz');
    expect(html).toContain('1 de 4 comprobaciones del servidor');
    expect(stepState(html, 'prepare')).toBe('done'); expect(stepState(html, 'link')).toBe('current'); expect(stepState(html, 'download')).toBe('current');
    expect(html).toContain(`PlayERP-Setup-${d.serial.replace(/^PS-/, '')}`);
    expect(html).toContain('href="#ps469-preparation"'); expect(html).toContain('href="#ps469-firmware"');
    expect(html).toContain('data-testid="ps-setup-troubleshooting"'); expect(html).toContain('data-testid="ps-setup-limits"'); expect(html).not.toContain('data-testid="ps-setup-error"');
    expect(html).not.toMatch(/pse_[A-Za-z0-9]/);
  });
  it('code_expired shows the recovery alert', () => {
    const { html } = render(superAdmin, device({ prepared: false, preparation: { state: 'code_expired', code_expires_at: null, prepared_at: null } }, null), { kits: [], ring: null });
    expect(html).toMatch(/role="alert" data-testid="ps-setup-error"/); expect(html).toContain('El código pse_ caducó.'); expect(html).toContain('el anterior deja de valer');
    expect(stepState(html, 'prepare')).toBe('error'); expect(html).toContain('data-testid="ps-setup-no-image"');
  });
  it('online device with a channel: all checks done and the channel label is shown', () => {
    const { html } = render(superAdmin, device({ prepared: true, preparation: { state: 'prepared', code_expires_at: null, prepared_at: null }, reported: { firmware_version: '0.3.21', hostname: null, last_seen_at: '2026-10-18T10:00:00Z' } }, true), { kits: [], ring: 'canary' });
    expect(html).toContain('4 de 4 comprobaciones del servidor'); expect(stepState(html, 'channel')).toBe('done');
    expect(html).toContain('data-testid="ps-setup-channel"'); expect(html).toContain('Canary'); expect(html).toContain('0.3.21');
    expect(html).not.toContain('ps-setup-open-preparation'); expect(html).not.toContain('admin-device-change-channel');
  });
  it.each([['owner', owner], ['support staff', support]])('%s gets nothing and no admin call is made', async (_, access) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { html, qc } = render(access, device({}, true));
    expect(html).toBe('');
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(qc.getQueryCache().getAll().filter(q => q.state.fetchStatus !== 'idle')).toEqual([]);
  });
  it('"Descargar imagen" asks kit_download for the signed URL and clicks a transient <a download>', async () => {
    const a = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() }, appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => a), body: { appendChild } });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, url: 'https://signed.example.test/img', filename: 'ps.img.xz', sha256: SHA, bytes: 1, expires_in: 300 }), { status: 200 })); vi.stubGlobal('fetch', fetch);
    await downloadBootableImage(kit('img', 'bootable_image', null));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'kit_download', id: 'img' });
    expect(a).toMatchObject({ href: 'https://signed.example.test/img', download: 'ps.img.xz' }); expect(appendChild).toHaveBeenCalledWith(a); expect(a.click).toHaveBeenCalledOnce(); expect(a.remove).toHaveBeenCalledOnce();
  });
  it('a 403 on download maps to the translated access error, never backend text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'raw backend detail' }), { status: 403 })));
    await expect(downloadBootableImage(kit('img', 'bootable_image', null))).rejects.toMatchObject({ code: 'accessDenied' });
  });
  it('every Setup key exists in both locales', () => {
    const keys = Object.keys(es).filter(k => k.startsWith('psSetup.'));
    expect(keys.length).toBeGreaterThan(40); for (const k of keys) expect(en).toHaveProperty([k]);
  });
});
