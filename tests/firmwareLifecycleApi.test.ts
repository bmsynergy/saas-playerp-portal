import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
import { setFirmwareAvailability } from '../src/lib/firmware';
import { deployEdition, signEdition } from '../src/lib/ota';
const confirmation = { sha256: 'a'.repeat(64), version: '9.9.9', model: 'fixture-model', arch: 'arm64', revision: 'fixture' };
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic' } } }); });
describe('PE442 final HTTP/RPC consumer (all network writes mocked)', () => {
  it('sends only the current confirmation to the existing signer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, version: '9.9.9', key_id: 'fixture-public-key' })));
    vi.stubGlobal('fetch', fetch);
    await signEdition('fixture-release', confirmation);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'sign', release_id: 'fixture-release', confirmation });
  });
  it.each([['confirmation_required', 400, 'fw.lifecycle.error.confirmationRequired'], ['release_changed', 409, 'fw.lifecycle.error.releaseChanged']])('explains signature rejection %s', async (error, status, key) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error }), { status: Number(status) })));
    await expect(signEdition('fixture-release', confirmation)).rejects.toMatchObject({ key });
  });
  it.each([['ring_disabled', 'fw.lifecycle.error.ringDisabled'], ['edition_retired', 'fw.lifecycle.error.retired'], ['incompatible_device', 'fw.lifecycle.error.incompatible']])('explains stale deployment eligibility %s', async (error, key) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error }), { status: 400 })));
    await expect(deployEdition('fixture-edition', { group_id: 'fixture-empty-group' })).rejects.toMatchObject({ key });
  });
  it('retires via additive availability RPC, never destructive delete or a canary write', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true } });
    await setFirmwareAvailability('fixture-edition', ['lab'], true, 3);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('ps_ota_edition_availability_set', { p_edition_id: 'fixture-edition', p_enabled_rings: ['lab'], p_retired: true, p_expected_revision: 3 });
  });
  it.each([['availability_changed', 'fw.lifecycle.error.availabilityChanged'], ['deployment_in_progress', 'fw.lifecycle.reason.deployment_in_progress'], ['canary_not_confirmed', 'ota.error.canaryNotConfirmed'], ['lab_build', 'fw.lifecycle.reason.lab_build']])('explains availability rejection %s', async (error, key) => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, error, revision: 4, open_targets: 1 } });
    await expect(setFirmwareAvailability('fixture-edition', ['general'], false, 3)).rejects.toMatchObject({ key });
  });
});
