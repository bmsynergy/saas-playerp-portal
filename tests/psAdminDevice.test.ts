import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
import { adminDeviceErrorKey, createAdminDevice, deleteAdminDevice, getAdminDeviceDetail, projectAdminDeviceDetail, projectDeviceModels, projectDeviceModelCatalog, projectAdminDeviceManage, projectAdminVenues, moveAdminDevice, searchAdminVenues, updateAdminDevice } from '../src/lib/psAdminDevice';
const fixture = () => ({ ok: true, device: { id: 'device', serial: 'PS-12345678', hostname: 'ps', model: 'rpi4-2gb', arch: 'arm64', status: 'stock', legacy: false, venue_id: null },
  update: { current_version: '0.3.1', latest_stable: { edition_id: 'stable', version: '0.3.2', model: 'rpi4-2gb', arch: 'arm64' }, candidate: { edition_id: 'stable', version: '0.3.2', model: 'rpi4-2gb', arch: 'arm64', ring: 'general', general_eligible: true, eligibility_reason: 'general', admitted: true, admitted_ring: 'general' }, effective_ring: 'general', can_update: true, update_available: true, reason: null, active_update: null }, delete: { allowed: true, blockers: [] as string[] } });
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe('PE-432 admin device contracts', () => {
  it('projects the model catalogue without a hardcoded hardware choice', () => {
    expect(projectDeviceModels({ ok: true, models: [{ model: 'new-model', label: 'New model', archs: ['armhf','arm64'], default_arch: 'armhf', active:true, is_default:false, secret: 'hidden' }] })).toEqual([{ model: 'new-model', label: 'New model', archs: ['armhf','arm64'], default_arch: 'armhf', active:true, is_default:false }]);
    expect(() => projectDeviceModels({ok:true,models:[{model:'bad',label:'Bad',archs:['armhf'],default_arch:'arm64'}]})).toThrow();
  });
  it('does not expose credentials or offer incompatible or already active updates', () => {
    const f=fixture(); const result=projectAdminDeviceDetail({...f, wifi_psk:'secret', device:{...f.device,admin_code:'secret'}});
    expect(JSON.stringify(result)).not.toContain('secret'); expect(result.update.update_available).toBe(true);
    f.update.candidate.arch='armhf'; expect(projectAdminDeviceDetail(f).update.update_available).toBe(false);
    expect(projectAdminDeviceDetail({...fixture(),update:{...fixture().update,active_update:{deployment_id:'dep',status:'in_progress',phase:'verifying',progress:64}}}).update).toMatchObject({update_available:false,active_update:{stage:'verifying',progress:64}});
    expect(projectAdminDeviceDetail({...fixture(),update:{current_version:null,latest_stable:null,update_available:false,reason:'no_stable_release',active_update:null}}).update.latest_stable).toBeNull();
  });
  it('fails closed for assignment or deletion blockers, even with an inconsistent allowed flag', () => {
    for (const device of [{venue_id:'venue'}, {status:'assigned'}, {legacy:true}, {print_server_id:'ps'}]) expect(projectAdminDeviceDetail({...fixture(),device:{...fixture().device,...device}}).delete.allowed).toBe(false);
    const f=fixture(); f.delete.blockers=['active_operation']; expect(projectAdminDeviceDetail(f).delete.allowed).toBe(false);
  });
  it('uses the generic create contract and maps optional activation response', async () => {
    mocks.rpc.mockResolvedValue({data:{ok:true,device:{id:'new',serial:'PS-NEW'},assignment:{enrollment_code:'once',expires_at:null,replaces_device_id:'old'}}});
    expect(await createAdminDevice({model:'new-model',arch:'armhf',label:' Desk ',venue_id:'venue'})).toEqual({device:{id:'new',serial:'PS-NEW'},assignment:{code:'once',expires_at:null,replaces:true}});
    expect(mocks.rpc).toHaveBeenCalledWith('ps_admin_device_create',{p_model:'new-model',p_arch:'armhf',p_label:'Desk',p_venue_id:'venue',p_notes:null});
  });
  it('sends the exact serial and preserves backend refusal instead of reporting deletion', async () => {
    mocks.rpc.mockResolvedValue({data:{ok:false,error:'delete_blocked',blockers:['active_operation']}});
    await expect(deleteAdminDevice('device','PS-12345678')).rejects.toMatchObject({key:'adminDevice.error.delete_blocked'});
    expect(mocks.rpc).toHaveBeenCalledWith('ps_admin_device_delete',{p_device_id:'device',p_confirm_serial:'PS-12345678'});
    expect(adminDeviceErrorKey({code:'42501'})).toBe('accessDenied');
  });
  it('requests one device with the displayed edition and the signed-in user session', async () => {
    mocks.getSession.mockResolvedValue({data:{session:{access_token:'user-session'}}});
    mocks.rpc.mockResolvedValue({data:fixture()});
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,deployment_id:'deployment'}),{status:200})); vi.stubGlobal('fetch',fetch);
    expect(await updateAdminDevice('device','stable','0.3.1')).toEqual({deployment_id:'deployment'});
    const [url,request]=fetch.mock.calls[0]; expect(url).toMatch(/functions\/v1\/ps-ota-admin$/); expect(JSON.parse(request.body)).toEqual({action:'update_device',device_id:'device',edition_id:'stable',expected_installed_version:'0.3.1'});
    expect(request.headers.Authorization).toBe('Bearer user-session');
    fetch.mockResolvedValue(new Response(JSON.stringify({ok:false,error:'edition_not_latest_stable'}),{status:409}));
    await expect(updateAdminDevice('device','stable','0.3.1')).rejects.toMatchObject({key:'adminDevice.error.edition_not_latest_stable'});
  });
  it('does not mutate without a session and forwards cancellation to reads', async () => {
    mocks.getSession.mockResolvedValue({data:{session:null}}); const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(updateAdminDevice('device','stable','0.3.1')).rejects.toMatchObject({code:'sessionExpired'}); expect(fetch).not.toHaveBeenCalled();
    const signal=new AbortController().signal,abortSignal=vi.fn().mockResolvedValue({data:fixture()}); mocks.rpc.mockReturnValue({abortSignal});
    await getAdminDeviceDetail('device',signal); expect(abortSignal).toHaveBeenCalledWith(signal);
  });
});


describe('PE-435 catalogue and Manage contracts', () => {
  const model = (name: string, active = true, is_default = false) => ({ model: name, label: name, archs: ['armhf', 'arm64'], default_arch: 'armhf', active, is_default });
  it('selects the explicit active default, not catalogue position; rejects an inconsistent default', () => {
    const data = { ok: true, default: { model: 'second', label: 'second', arch: 'armhf' }, models: [model('first'), model('second', true, true), model('inactive', false)] };
    expect(projectDeviceModelCatalog(data)).toMatchObject({ default: { model: 'second', arch: 'armhf' }, models: [{ model: 'first' }, { model: 'second' }] });
    expect(projectDeviceModelCatalog({ ...data, default: null }).default).toBeNull();
    expect(() => projectDeviceModelCatalog({ ...data, default: { ...data.default, arch: 'arm64' } })).toThrow();
    expect(() => projectDeviceModelCatalog({ ...data, models: [model('second', false, true)] })).toThrow();
  });
  const manageable = () => ({ ...fixture(), actions: { assign: { allowed: true, reason: null }, move: { allowed: false, reason: 'device_not_assigned' }, unassign: { allowed: false, reason: 'device_not_assigned' }, delete: { allowed: true, confirm_with: 'serial' } } });
  it('requires both server action permission and deletion guards, and serial confirmation support', () => {
    const data = manageable();
    expect(projectAdminDeviceManage(data).actions.delete.allowed).toBe(false);
    data.device.status = 'retired';
    expect(projectAdminDeviceManage(data).actions.delete.allowed).toBe(true);
    expect(projectAdminDeviceManage({ ...data, delete: { allowed: true, blockers: ['active_operation'] } }).actions.delete.allowed).toBe(false);
    expect(projectAdminDeviceManage({ ...data, device: { ...data.device, venue_id: 'assigned' } }).actions.delete.allowed).toBe(false);
    expect(projectAdminDeviceManage({ ...data, actions: { ...data.actions, delete: { allowed: true } } }).actions.delete.allowed).toBe(false);
    expect(projectAdminDeviceManage({ ...data, actions: { ...data.actions, assign: { allowed: true, reason: 'blocked' } } }).actions.assign.allowed).toBe(false);
    expect(() => projectAdminDeviceManage({ ...data, actions: null })).toThrow();
  });
  it('moves with one atomic backend call and never follows rejection with revoke or delete', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, enrollment_code: 'one-time', expires_at: null, replaces_device_id: null } });
    expect(await moveAdminDevice('device', 'new-venue')).toEqual({ code: 'one-time', expires_at: null, replaces: false });
    expect(mocks.rpc).toHaveBeenCalledWith('ps_admin_device_move', { p_device_id: 'device', p_venue_id: 'new-venue' });
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: 'unknown_venue' } });
    await expect(moveAdminDevice('device', 'missing')).rejects.toMatchObject({ key: 'adminDevice.error.unknown_venue' });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['ps_admin_device_move', 'ps_admin_device_move']);
  });
  it('searches server-side and projects only visible venue fields, never device credentials', async () => {
    const response = { ok: true, venues: [{ id: 'venue', name: 'Park', slug: 'park', city: 'Ponce', state: 'PR', is_active: true, address: 'ignored', assigned_device: { id: 'device', serial: 'PS-1', secret: 'hidden' } }] };
    expect(projectAdminVenues(response)).toEqual([{ id: 'venue', name: 'Park', slug: 'park', city: 'Ponce', state: 'PR', is_active: true, assigned_device: { id: 'device', serial: 'PS-1' } }]);
    mocks.rpc.mockResolvedValue({ data: response });
    await searchAdminVenues(' Ponce ', 'venue');
    expect(mocks.rpc).toHaveBeenCalledWith('ps_admin_venue_search', { p_query: 'Ponce', p_limit: 20, p_include_venue_id: 'venue' });
  });
});


describe('PE-447 Retired deletion and separate retirement', () => {
  it('requires Retired even when an old server response claims stock or an unknown status can be deleted', () => {
    for (const status of ['stock', 'assigned', 'unknown']) expect(projectAdminDeviceDetail({ ...fixture(), device: { ...fixture().device, status } }).delete.allowed).toBe(false);
    const retired = { ...fixture(), device: { ...fixture().device, status: 'retired' } };
    expect(projectAdminDeviceDetail(retired).delete.allowed).toBe(true);
    for (const blocker of ['legacy_device', 'device_assigned', 'active_enrollment', 'active_deployment', 'active_operation', 'pending_credential_change']) {
      expect(projectAdminDeviceDetail({ ...retired, delete: { allowed: true, blockers: [blocker] } }).delete.allowed).toBe(false);
    }
  });
  it('only enables the existing retirement contract with its explicit serial confirmation and revoke reason', () => {
    const data = { ...fixture(), actions: { assign: { allowed: true }, move: { allowed: false }, unassign: { allowed: false }, delete: { allowed: false }, retire: { allowed: true, confirm_with: 'serial', revoke_reason: 'retired' } } };
    expect(projectAdminDeviceManage(data).actions.retire.allowed).toBe(true);
    expect(projectAdminDeviceManage({ ...data, actions: { ...data.actions, retire: { allowed: true } } }).actions.retire.allowed).toBe(false);
    expect(projectAdminDeviceManage({ ...data, device: { ...data.device, status: 'retired' } }).actions.retire.allowed).toBe(false);
  });
  it('keeps the refusal blockers and next step without exposing arbitrary server messages', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: 'delete_blocked', blockers: ['device_assigned', 'unsafe raw text'], messages: ['secret'], next_step: 'unassign' } });
    const err = await deleteAdminDevice('device', 'PS-12345678').catch(error => error);
    expect(err).toMatchObject({ key: 'adminDevice.error.delete_blocked', blockers: ['device_assigned'], nextStep: 'unassign' });
    expect(JSON.stringify(err)).not.toContain('secret');
  });
});
