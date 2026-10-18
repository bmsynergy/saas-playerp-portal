import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), navigations: [] as string[] }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'u1', email: 'fixture@example.test' } }, loading: false, recovery: false, invitation: false, expire: vi.fn() }) }));
vi.mock('../src/locales', async () => { const { es } = await import('../src/locales/es'); return { useLocale: () => ({ locale: 'es', setLocale: vi.fn(), t: (k: string) => (es as Record<string, string>)[k] ?? k }) }; });
// Record the guard's redirect target instead of navigating (static render runs no effects).
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), Navigate: ({ to }: { to: string }) => { mocks.navigations.push(to); return null; } }));
import { getInstallKitDownload, listInstallKits, type FirmwareRelease, type InstallKit } from '../src/lib/firmware';
import { FirmwareInstallKit } from '../src/components/FirmwareInstallKit';
import { PrintFirmwaresPage } from '../src/pages/PrintFirmwaresPage';
import App from '../src/App';
import { EMPTY_LIST_FILTERS } from '../src/lib/adminLists';
import type { PortalAccess } from '../src/lib/types';

const SHA = 'ab'.repeat(32), BASE_SHA = 'cd'.repeat(32), PATH = '/admin/print-servers/firmwares';
const kit: InstallKit = { id: 'kit-1', release_id: 'rel-1', release_version: '0.3.20', release_sha256: 'ef'.repeat(32), profile: 'prod', file_name: 'playerp-ps-0.3.20-prod-kit.zip',
  sha256: SHA, bytes: 3145728, base_image_name: 'raspios-bookworm-arm64-lite.img.xz', base_image_url: 'https://example.test/base.img.xz', base_image_sha256: BASE_SHA,
  built_from_commit: 'abc1234', created_at: '2026-10-01T10:00:00Z' };
const release = (id: string): FirmwareRelease => ({ id, version: id === 'rel-1' ? '0.3.20' : '0.3.19', revision: null, model: 'rpi4-2gb', arch: 'arm64', notes: null, filename: `${id}.zip`,
  size_bytes: 1048576, sha256: '12'.repeat(32), status: 'ready', errors: [], entries: 3, created_at: null, uploaded_by_email: null, installed_count: 0, lifecycle: null });
const venue = { id: 'v1', name: 'Venue', slug: null, city: null, state: null, address: null, phone: null, email: null, timezone: null, is_active: true, is_owner: true };
const superAdmin: PortalAccess = { is_platform_staff: true, can_manage_staff: true, can_view_tenants: true, platform_role: 'super_admin', owner_venues: [] };
const owner: PortalAccess = { is_platform_staff: false, can_manage_staff: false, can_view_tenants: false, platform_role: null, owner_venues: [venue] };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function client(access: PortalAccess, kits?: InstallKit[], withPage = true, retryOnMount = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount } } });
  qc.setQueryData(['access', 'u1', PATH], access);
  if (withPage) qc.setQueryData(['ps-ota-page', 'u1', 'firmwares', null, { ...EMPTY_LIST_FILTERS }, 25, 1, 0], { items: [release('rel-1'), release('rel-2')], total: 2, limit: 25, offset: 0, aggregates: { population: 'all', by_status: {}, target_by_status: {}, target_count: 0 } });
  if (kits) qc.setQueryData(['ps-install-kits', 'u1'], kits);
  return qc;
}
const render = (qc: QueryClient, node: ReactNode) => renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, { initialEntries: [PATH] }, node)));
function findByTestId(node: unknown, id: string): ReactElement<Record<string, unknown>> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const found = findByTestId(child, id); if (found) return found; } return null; }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.props?.['data-testid'] === id) return el;
  return findByTestId(el.props?.children, id);
}

beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); mocks.navigations.length = 0; mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }); });

describe('PE-485 install kit API (edge ps-firmware-admin, network mocked)', () => {
  it('kit_list goes through the edge, never a direct RPC/table read', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ ok: true, kits: [kit] })); vi.stubGlobal('fetch', fetch);
    await expect(listInstallKits()).resolves.toEqual([kit]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/functions\/v1\/ps-firmware-admin$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer synthetic' } });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'kit_list' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('kit_download sends the kit id and returns the signed URL', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ ok: true, url: 'https://signed.example.test/kit', filename: kit.file_name, sha256: SHA, bytes: 3145728, expires_in: 300 })); vi.stubGlobal('fetch', fetch);
    await expect(getInstallKitDownload('kit-1')).resolves.toEqual({ url: 'https://signed.example.test/kit', filename: kit.file_name, sha256: SHA, bytes: 3145728, expires_in: 300 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'kit_download', id: 'kit-1' });
  });
  it.each([[401, 'sessionExpired'], [403, 'accessDenied']])('maps HTTP %s like the existing download', async (status, key) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: '42501' }), { status })));
    await expect(listInstallKits()).rejects.toMatchObject({ code: key });
  });
  it('without a session no request is made', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } }); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(getInstallKitDownload('kit-1')).rejects.toMatchObject({ code: 'sessionExpired' }); expect(fetch).not.toHaveBeenCalled();
  });
});

describe('PE-485 firmwares page kit block', () => {
  it('renders the kit only for the matching release with full SHA-256, base image and the non-OTA warning', () => {
    const html = render(client(superAdmin, [kit]), createElement(PrintFirmwaresPage));
    expect(html).toContain('Kit de instalación inicial');
    expect(html).toContain('data-testid="fw-kit-kit-1"');
    expect(html).toContain(`data-testid="fw-kit-sha-kit-1">${SHA}</dd>`);
    expect(html).toContain(BASE_SHA); expect(html).toContain(kit.base_image_name!); expect(html).toContain(kit.file_name); expect(html).toContain('>prod<'); expect(html).toContain('3.0 MB');
    expect(html).toContain('Instalación inicial desde SD vacía. No es una actualización OTA: descargarlo no firma, no promueve ni autoriza instalar nada.');
    expect(html).toContain('Descargar kit');
    const rel2 = html.slice(html.indexOf('data-testid="fw-row-rel-2"'));
    expect(rel2.slice(0, rel2.indexOf('</li>'))).not.toContain('fw-kit-');
  });
  it('a failed kit_list shows a small non-blocking error and the release list still renders', async () => {
    const qc = client(superAdmin, undefined, true, false); // keep the failed state visible in a static render
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await qc.prefetchQuery({ queryKey: ['ps-install-kits', 'u1'], queryFn: listInstallKits });
    const html = render(qc, createElement(PrintFirmwaresPage));
    expect(html).toContain('data-testid="fw-kit-list-error"');
    expect(html).toContain('data-testid="fw-row-rel-1"'); expect(html).not.toContain('fw-kit-kit-1');
  });
  it('"Descargar kit" calls kit_download and navigates to the signed URL', async () => {
    const assign = vi.fn(); vi.stubGlobal('window', { location: { assign } });
    const fetch = vi.fn().mockResolvedValue(ok({ ok: true, url: 'https://signed.example.test/kit', filename: kit.file_name, sha256: SHA, bytes: 1, expires_in: 300 })); vi.stubGlobal('fetch', fetch);
    const onError = vi.fn();
    const button = findByTestId(FirmwareInstallKit({ kit, t: k => k, onError }), 'fw-kit-download-kit-1');
    expect(button).not.toBeNull();
    (button!.props.onClick as () => void)();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://signed.example.test/kit'));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'kit_download', id: 'kit-1' });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('PE-485 guard: tenant owner opening the firmwares URL', () => {
  // Minimal browser globals PortalShell reads during render.
  beforeEach(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), localStorage: { getItem: () => null, setItem() {} }, location: { assign: vi.fn() } }));
  it('is redirected by the existing admin guard and no admin read is made or even prepared', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const qc = client(owner, undefined, false);
    const html = render(qc, createElement(App));
    expect(mocks.navigations).toEqual(['/']);
    expect(html).not.toContain('firmwares-page'); expect(html).not.toContain('fw-kit');
    const keys = qc.getQueryCache().getAll().map(q => q.queryKey[0]);
    expect(keys).not.toContain('ps-install-kits'); expect(keys).not.toContain('ps-ota-page');
    await Promise.resolve();
    expect(mocks.rpc).not.toHaveBeenCalled(); // neither ps_firmware_page/ps_firmware_list
    expect(fetch).not.toHaveBeenCalled(); // nor ps-firmware-admin kit_list
  });
  it('control: a super_admin passes the same guard and the page registers the kit_list query', () => {
    const qc = client(superAdmin, [kit]);
    const html = render(qc, createElement(App));
    expect(mocks.navigations).toEqual([]);
    expect(html).toContain('firmwares-page'); expect(html).toContain('fw-kit-kit-1');
    expect(qc.getQueryCache().find({ queryKey: ['ps-install-kits', 'u1'] })).toBeDefined();
  });
});
