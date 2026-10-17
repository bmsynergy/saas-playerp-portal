import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
import { projectAdminDeviceDetail, setAdminDeviceChannel, updateAdminDevice, validateAdminDevice } from '../src/lib/psAdminDevice';
import { getPanelOta } from '../src/lib/ota';
import { splitEditions, blockerKey, channelSelectionValid, defaultEditionId, editionReasonKey, firmwareHeadline, projectAdminOtaExtras, shortSha, showValidateButton, updateReasonKey, validationErrorKey, type CanaryValidation } from '../src/lib/psOtaDevice';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';

const SHA = 'e0784589' + 'a'.repeat(52) + 'b95c';
const SHA2 = 'f'.repeat(64);
// Shape of the real DEV case (PS in «lab ps», 0.3.23 installed from lab target, not Canary-confirmed, updater 1.0.0).
const realUpdate = () => ({
  current_version: '0.3.23', latest_stable: null, candidate: { edition_id: 'a0dd09df-0000', version: '0.3.23', model: 'rpi4-2gb', arch: 'arm64', ring: 'lab', general_eligible: false, eligibility_reason: 'canary_not_confirmed', admitted: true, admitted_ring: 'lab' },
  newest_signed: null, effective_ring: 'lab', can_update: false, update_available: false, reason: 'up_to_date', active_update: null,
  channel: { ring: 'lab', groups: [{ id: 'g-lab', name: 'lab ps', ring: 'lab' }], options: [{ ring: 'lab', groups: [{ id: 'g-lab', name: 'lab ps' }] }, { ring: 'canary', groups: [{ id: 'g-can', name: 'canary ps' }] }, { ring: 'general', groups: [] }], can_change: true, blocked_reason: null },
  editions: [{ edition_id: 'a0dd09df-0000', version: '0.3.23', sha256: SHA, signed_at: '2026-10-10', enabled_rings: ['lab', 'canary'], lab_only: false, canary_confirmed_at: null, class_ring: 'lab', installed: true, selectable: false, reason: 'not_newer' }],
  canary_validation: { status: 'pending', edition: { edition_id: 'a0dd09df-0000', version: '0.3.23', sha256: SHA, signed_at: '2026-10-10' }, receipt_target_id: '112921c6-0000', receipt_ring: 'lab', target: null,
    can_validate: false, blockers: ['channel_not_canary'], updater_version: '1.0.0', updater_supports_validation: false },
  general_requirements: { edition: { edition_id: 'a0dd09df-0000', version: '0.3.23' }, eligible: false, items: [
    { key: 'canary_channel', met: false, action: 'change_channel' }, { key: 'updater_1_1', met: false, action: 'install_updater' },
    { key: 'canary_validated', met: false, action: 'validate' }, { key: 'general_enabled', met: false, action: 'open_firmwares', href: 'https://evil.example/' }] },
});
const sheet = (update: Record<string, unknown> = realUpdate()) => ({ ok: true, device: { id: 'device', serial: 'PS-JHG77BM7', hostname: 'ps', model: 'rpi4-2gb', arch: 'arm64', status: 'active', legacy: false, venue_id: 'v' }, update, delete: { allowed: false, blockers: [] } });
const canary = (patch: Partial<CanaryValidation>): CanaryValidation => ({ ...projectAdminOtaExtras(realUpdate()).canary!, ...patch });
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('PE-473 admin OTA projection', () => {
  it('projects the real case: lab channel, installed edition not selectable, Canary validation pending and blocked', () => {
    const ota = projectAdminDeviceDetail(sheet()).update.ota;
    expect(ota.channel).toMatchObject({ ring: 'lab', groups: [{ name: 'lab ps', ring: 'lab' }], can_change: true });
    expect(ota.editions?.[0]).toMatchObject({ version: '0.3.23', installed: true, selectable: false, reason: 'not_newer', enabled_rings: ['lab', 'canary'] });
    expect(ota.canary).toMatchObject({ status: 'pending', can_validate: false, blockers: ['channel_not_canary'], updater_supports_validation: false, receipt_ring: 'lab' });
    expect(defaultEditionId(ota.editions)).toBeNull();
  });
  it('hides the new blocks when the backend does not send the keys yet', () => {
    const u = realUpdate() as Record<string, unknown>;
    for (const k of ['channel', 'editions', 'canary_validation', 'general_requirements']) delete u[k];
    expect(projectAdminDeviceDetail(sheet(u)).update.ota).toEqual({ channel: null, editions: null, canary: null, general: null });
    expect(projectAdminOtaExtras({ channel: { ring: 'beta' }, canary_validation: { status: 'weird' }, general_requirements: { items: 'x' } })).toEqual({ channel: null, editions: null, canary: null, general: null });
  });
  it('never links requirements outside the Firmwares route and never trusts can_validate with blockers', () => {
    const ota = projectAdminOtaExtras(realUpdate());
    expect(ota.general?.items.find(i => i.key === 'general_enabled')?.href).toBe('/admin/print-servers/firmwares');
    expect(projectAdminOtaExtras({ ...realUpdate(), canary_validation: { ...realUpdate().canary_validation, can_validate: true } }).canary?.can_validate).toBe(false);
    expect(shortSha(SHA)).toBe('e0784589…b95c');
  });
  it('shows selectable and installed editions first and folds the rest; a missing sha256 never allows validation', () => {
    const base = realUpdate().editions[0];
    const eds = projectAdminOtaExtras({ editions: [{ ...base, edition_id: 'n', version: '0.3.24', installed: false, selectable: true, reason: null }, base, { ...base, edition_id: 'old', version: '0.3.21', installed: false }] }).editions!;
    expect(splitEditions(eds).main.map(e => e.edition_id)).toEqual(['n', 'a0dd09df-0000']);
    expect(splitEditions(eds).other.map(e => e.edition_id)).toEqual(['old']);
    const c = realUpdate().canary_validation;
    expect(projectAdminOtaExtras({ canary_validation: { ...c, blockers: [], can_validate: true, edition: { ...c.edition, sha256: null } } }).canary).toMatchObject({ can_validate: false, edition: { sha256: null } });
    expect(projectAdminOtaExtras({ canary_validation: { ...c, blockers: [], can_validate: true } }).canary?.can_validate).toBe(true);
  });
});

describe('PE-473 validation state is separate from up to date', () => {
  it('installed == candidate with pending validation is not shown as up to date', () => {
    const c = projectAdminOtaExtras(realUpdate()).canary;
    expect(firmwareHeadline('0.3.23', c, 'up_to_date')).toEqual({ key: 'otaDevice.headline.pending', version: '0.3.23' });
    expect(en['otaDevice.headline.pending'].replace('{version}', '0.3.23')).toBe('Installed 0.3.23 · Canary validation pending');
    expect(es['otaDevice.headline.pending'].replace('{version}', '0.3.23')).toBe('Instalada 0.3.23 · Validación Canary pendiente');
    expect(en['otaDevice.headline.pending']).not.toBe(en['otaDevice.headline.up_to_date']);
    expect(updateReasonKey('up_to_date', c)).toBe('otaDevice.reason.up_to_date_unvalidated');
  });
  it('confirmed, failed, in progress and not needed', () => {
    expect(firmwareHeadline('0.3.23', canary({ status: 'confirmed' }), 'up_to_date')?.key).toBe('otaDevice.headline.confirmed');
    expect(firmwareHeadline('0.3.23', canary({ status: 'failed' }), 'up_to_date')?.key).toBe('otaDevice.headline.failed');
    expect(firmwareHeadline('0.3.23', canary({ status: 'in_progress' }), 'up_to_date')?.key).toBe('otaDevice.headline.in_progress');
    expect(firmwareHeadline('0.3.23', canary({ status: 'not_needed' }), 'up_to_date')?.key).toBe('otaDevice.headline.up_to_date');
    expect(firmwareHeadline('0.3.23', null, 'up_to_date')?.key).toBe('otaDevice.headline.up_to_date');
    expect(updateReasonKey('up_to_date', canary({ status: 'confirmed' }))).toBe('adminDevice.reason.up_to_date');
  });
  it('shows the validate button for pending/failed regardless of version comparison', () => {
    expect(showValidateButton(canary({ status: 'pending' }))).toBe(true);
    expect(showValidateButton(canary({ status: 'failed', edition: { edition_id: 'x', version: '9.9.9', sha256: SHA2, signed_at: null } }))).toBe(true);
    expect(showValidateButton(canary({ status: 'confirmed' }))).toBe(false);
    expect(showValidateButton(canary({ status: 'in_progress' }))).toBe(false);
    expect(showValidateButton(null)).toBe(false);
  });
});

describe('PE-473 translated reasons and errors', () => {
  it('maps edition reasons, blockers and validation failures, showing unknown codes', () => {
    for (const r of ['not_newer', 'ring_disabled', 'edition_lab_only', 'lab_build', 'canary_not_confirmed', 'edition_not_signed', 'update_in_progress', 'device_not_active']) expect(en[editionReasonKey(r).key as keyof typeof en]).toBeTruthy();
    expect(editionReasonKey('brand_new')).toEqual({ key: 'otaDevice.edition.reason.unknown', code: 'brand_new' });
    expect(blockerKey('channel_not_canary')).toEqual({ key: 'otaDevice.blocker.channel_not_canary', code: null });
    expect(validationErrorKey('health_failed:local_api_down')).toEqual({ key: 'otaDevice.validationError.health.local_api_down', code: null });
    expect(validationErrorKey('health_failed:disk_full')).toEqual({ key: 'otaDevice.validationError.health_failed', code: 'disk_full' });
    expect(validationErrorKey('updater_unsupported').key).toBe('otaDevice.validationError.updater_unsupported');
    expect(validationErrorKey('something_new')).toEqual({ key: 'otaDevice.validationError.unknown', code: 'something_new' });
    for (const c of ['updater_unsupported', 'artifact_mismatch', 'no_install_receipt', 'queue_busy', 'expired', 'validation_evidence_mismatch', 'health_failed:local_api_down']) {
      const k = validationErrorKey(c).key as keyof typeof en; expect(en[k]).toBeTruthy(); expect(es[k]).toBeTruthy(); expect(es[k]).not.toBe(en[k]);
    }
    for (const key of Object.keys(en).filter(k => k.startsWith('otaDevice.'))) expect(es[key as keyof typeof en]).toBeTruthy();
  });
  it('validates channel selections against the offered options', () => {
    const ch = projectAdminOtaExtras(realUpdate()).channel!;
    expect(channelSelectionValid(ch, 'canary', 'g-can')).toBe(true);
    expect(channelSelectionValid(ch, 'lab', 'g-lab')).toBe(false);
    expect(channelSelectionValid(ch, 'canary', null)).toBe(false);
    expect(channelSelectionValid(ch, 'canary', 'g-lab')).toBe(false);
    expect(channelSelectionValid(ch, 'general', null)).toBe(true);
  });
});

describe('PE-473 actions', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  beforeEach(() => mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'staff-jwt' } } }));
  it('set_channel and validate_device send the contract bodies with the staff JWT', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok({ ok: true, changed: true, channel: {} })).mockResolvedValueOnce(ok({ ok: true, deployment_id: 'd', target_id: 't', edition_id: 'e', version: '0.3.23', signed: 1 }));
    vi.stubGlobal('fetch', fetch);
    expect(await setAdminDeviceChannel('device', 'canary', 'g-can', 'lab')).toEqual({ changed: true });
    expect(await validateAdminDevice('device', 'a0dd09df-0000', '0.3.23')).toEqual({ target_id: 't' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'set_channel', device_id: 'device', channel: 'canary', group_id: 'g-can', expected_channel: 'lab' });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: 'validate_device', device_id: 'device', edition_id: 'a0dd09df-0000', expected_installed_version: '0.3.23' });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer staff-jwt');
  });
  it('general drops the group and errors are translated', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ ok: false, error: 'channel_changed' }, 409)); vi.stubGlobal('fetch', fetch);
    await expect(setAdminDeviceChannel('device', 'general', 'g-lab', 'lab')).rejects.toMatchObject({ key: 'adminDevice.error.channel_changed' });
    expect(JSON.parse(fetch.mock.calls[0][1].body).group_id).toBeNull();
    fetch.mockResolvedValue(ok({ ok: false, error: 'channel_not_canary' }, 409));
    await expect(validateAdminDevice('device', 'e', '0.3.23')).rejects.toMatchObject({ key: 'adminDevice.error.channel_not_canary' });
    fetch.mockResolvedValue(ok({ ok: false, error: 'brand_new_error' }, 409));
    await expect(validateAdminDevice('device', 'e', '0.3.23')).rejects.toMatchObject({ key: 'adminDevice.error.other' });
    fetch.mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(setAdminDeviceChannel('device', 'canary', 'g-can', 'lab')).rejects.toMatchObject({ code: 'accessDenied' });
    for (const k of ['channel_changed', 'group_required', 'group_ring_mismatch', 'unknown_group', 'invalid_channel', 'edition_not_selectable', 'channel_not_canary', 'canary_ring_disabled', 'edition_lab_only', 'lab_build', 'edition_not_signed', 'edition_not_installed', 'already_confirmed', 'incompatible_device', 'update_in_progress', 'unknown_device', 'device_not_active'])
      expect(es[`adminDevice.error.${k}` as keyof typeof en]).toBeTruthy();
  });
  it('update_device accepts a selectable non-candidate edition and translates edition_not_selectable', async () => {
    const u = realUpdate();
    u.editions = [{ ...u.editions[0], edition_id: 'newer', version: '0.3.24', sha256: SHA2, installed: false, selectable: true, reason: null }, ...u.editions];
    mocks.rpc.mockResolvedValue({ data: sheet(u) });
    const fetch = vi.fn().mockResolvedValue(ok({ ok: true, deployment_id: 'dep' })); vi.stubGlobal('fetch', fetch);
    expect(await updateAdminDevice('device', 'newer', '0.3.23')).toEqual({ deployment_id: 'dep' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'update_device', device_id: 'device', edition_id: 'newer', expected_installed_version: '0.3.23' });
    await expect(updateAdminDevice('device', 'a0dd09df-0000', '0.3.23')).rejects.toMatchObject({ key: 'adminDevice.updateChanged' });
    fetch.mockResolvedValue(ok({ ok: false, error: 'edition_not_selectable', reason: 'ring_disabled' }, 409));
    await expect(updateAdminDevice('device', 'newer', '0.3.23')).rejects.toMatchObject({ key: 'otaDevice.edition.reason.ring_disabled' });
  });
});

describe('PE-473 owner receives no internal controls', () => {
  it('the owner OTA projection drops channel, editions, validation and requirements', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, print_servers: [{ print_server_id: 'ps', model: 'rpi4-2gb', arch: 'arm64', installed_version: '0.3.23', status: 'none',
      update: { device_id: 'device', update_available: false, can_update: false, reason: 'no_general_update', ...Object.fromEntries(['channel', 'editions', 'canary_validation', 'general_requirements'].map(k => [k, (realUpdate() as Record<string, unknown>)[k]])) } }] } });
    const [panel] = await getPanelOta('venue');
    const json = JSON.stringify(panel);
    for (const leak of ['channel', 'editions', 'canary', 'general_requirements', 'lab ps', 'a0dd09df']) expect(json).not.toContain(leak);
  });
  it('owner components do not import the admin OTA blocks', () => {
    for (const file of ['src/components/PrintServerOtaBlock.tsx', 'src/lib/ota.ts'])
      expect(readFileSync(file, 'utf8')).not.toMatch(/psOtaDevice|DeviceOtaBlocks|DeviceAdminSummary/);
    // The admin summary is only mounted for admin scope and platform admins.
    expect(readFileSync('src/components/PrintServerDevicePanel.tsx', 'utf8')).toMatch(/adminScope && data\.is_platform_admin && data\.device && <div id="ps469-firmware"><DeviceAdminSummary/);
  });
});
