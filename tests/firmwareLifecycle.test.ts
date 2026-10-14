import { describe, expect, it } from 'vitest';
import { firmwareEditionLink, firmwareRingAvailable, projectFirmwareLifecycle } from '../src/lib/firmwareLifecycle';

const signed = () => ({
  contract_version: 1, edition_id: 'fixture-edition', edition_status: 'signed',
  signed_by: 'fixture-actor', signed_by_email: 'fixture@example.invalid', signed_at: '2026-10-14T00:00:00Z', key_id: 'fixture-public-key',
  canary_confirmed_at: null, lab_only: false, configuration: 'explicit', revision: 1,
  retired_at: null, retired_by: null, can_sign: false, sign_block_reason: null,
  can_manage: true, can_retire: true, retire_block_reason: null,
  rings: {
    lab: { enabled: false, eligible: true, reason: null },
    canary: { enabled: true, eligible: true, reason: null },
    general: { enabled: false, eligible: false, reason: 'canary_not_confirmed' },
  },
});

describe('PE442 server availability consumption (client projection only)', () => {
  it('does not infer enabled rings from signature, canary timestamp or classification', () => {
    const raw = signed();
    const value = projectFirmwareLifecycle(raw)!;
    expect(firmwareRingAvailable(value, 'lab')).toBe(false);
    expect(firmwareRingAvailable(value, 'canary')).toBe(true);
    expect(firmwareRingAvailable(value, 'general')).toBe(false);
    expect(firmwareRingAvailable(projectFirmwareLifecycle({ ...raw, canary_confirmed_at: '2026-10-14T00:00:00Z' }), 'general')).toBe(false);
    raw.rings.canary.eligible = false;
    expect(firmwareRingAvailable(projectFirmwareLifecycle(raw), 'canary')).toBe(false);
  });
  it('removes retired editions from all new selections while retaining identity and signature fields', () => {
    const value = projectFirmwareLifecycle({ ...signed(), retired_at: '2026-10-14T01:00:00Z', retired_by: 'fixture-actor' })!;
    expect(value.edition_id).toBe('fixture-edition');
    expect(value.key_id).toBe('fixture-public-key');
    expect(firmwareRingAvailable(value, 'canary')).toBe(false);
  });
  it.each([undefined, null, {}, { ...signed(), contract_version: 2 }, { ...signed(), revision: -1 },
    { ...signed(), can_manage: 'true' }, { ...signed(), rings: { lab: { enabled: true, eligible: true, reason: null } } },
    { ...signed(), key_id: null }, { ...signed(), retired_at: false }])('fails closed for missing or malformed metadata %#', value => {
    expect(projectFirmwareLifecycle(value)).toBeNull();
    expect(firmwareRingAvailable(projectFirmwareLifecycle(value), 'general')).toBe(false);
  });
  it('drops unknown response fields instead of caching or displaying them', () => {
    const projected = projectFirmwareLifecycle({ ...signed(), extra: 'untrusted', rings: { ...signed().rings, unknown: { enabled: true, eligible: true } } });
    expect(projected).not.toHaveProperty('extra');
    expect(projected?.rings).not.toHaveProperty('unknown');
  });
  it('links history by edition identity, never by version, and uses release only before signing', () => {
    expect(firmwareEditionLink('fixture-edition', 'fixture-release')).toBe('/admin/print-servers/firmwares?edition=fixture-edition');
    expect(firmwareEditionLink(null, 'fixture-release')).toBe('/admin/print-servers/firmwares?release=fixture-release');
    expect(firmwareEditionLink(null)).toBe('/admin/print-servers/firmwares');
  });
});
