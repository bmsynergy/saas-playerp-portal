import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixture = vi.hoisted(() => ({ environment: 'dev', kits: [] as Record<string, unknown>[] }));
vi.mock('../src/lib/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/config')>();
  return { ...actual, config: { ...actual.config, get environment() { return fixture.environment; } } };
});
vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'fixture-user' } } }) }));
vi.mock('../src/locales', () => ({ useLocale: () => ({ locale: 'en', t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: string[] }) => ({
  data: queryKey[0] === 'ps-stock-status' ? {
    device_id: 'fixture-device', serial: 'PS-FIXTURE', model: 'rpi4-2gb', arch: 'arm64',
    stock: { state: 'not_prepared', checks: {}, reported: {} },
  } : queryKey[0] === 'ps-stock-kits' ? fixture.kits : queryKey[0] === 'ps-stock-firmwares' ? {
    complete: true, releases: [
      { id: 'compatible', status: 'ready', model: 'rpi4-2gb', arch: 'arm64', version: '0.3.28' },
      { id: 'old', status: 'ready', model: 'rpi4-2gb', arch: 'arm64', version: '0.3.26' },
      { id: 'wrong-arch', status: 'ready', model: 'rpi4-2gb', arch: 'armhf', version: '0.3.28' },
    ],
  } : null,
}) }));
import { PsStockPreparation } from '../src/components/PsStockPreparation';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const kit = (profile: string, release_id = 'compatible', created_at = '2026-11-08') => ({
  profile, release_id, kind: 'bootable_image', file_name: `${profile}-${release_id}.img`, sha256: 'fixture-sha', created_at,
});
const render = () => renderToStaticMarkup(createElement(PsStockPreparation, { deviceId: 'fixture-device', onChanged: async () => {} }));

describe('stock image environment isolation', () => {
  for (const environment of ['dev', 'prod']) {
    it(`selects only the compatible ${environment} image even when the other profile is newer`, () => {
      fixture.environment = environment;
      const other = environment === 'dev' ? 'prod' : 'dev';
      fixture.kits = [kit(environment), kit(other, 'compatible', '2026-11-09'), kit(environment, 'old'), kit(environment, 'wrong-arch')];
      const html = render();
      expect(html).toContain(`${environment}-compatible.img`);
      expect(html).not.toContain(`${other}-compatible.img`);
      expect(html).not.toContain(`${environment}-old.img`);
      expect(html).not.toContain(`${environment}-wrong-arch.img`);
      expect(html).toContain('data-testid="ps-stock-download-image"');
    });
    it(`does not fall back to the other profile or an incompatible image in ${environment}`, () => {
      fixture.environment = environment;
      fixture.kits = [kit(environment === 'dev' ? 'prod' : 'dev'), kit(environment, 'old'), kit(environment, 'wrong-arch')];
      const html = render();
      expect(html).toContain('psStock.imageUnavailable');
      expect(html).not.toContain('data-testid="ps-stock-download-image"');
    });
  }
  it('uses environment-neutral image text and explains production email retention in EN/ES', () => {
    for (const messages of [en, es]) for (const key of ['psStock.imageLead', 'psStock.imageUnavailable', 'psStock.emailDevRule'] as const) {
      expect(messages[key]).not.toMatch(/\bDEV\b/);
    }
    expect(en['psStock.emailDevRule']).toContain('In production, delivery emails are held without sending.');
    expect(es['psStock.emailDevRule']).toContain('En producción, los correos de entrega quedan retenidos sin envío.');
  });
});
