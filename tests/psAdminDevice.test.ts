import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
import { adminDeviceErrorKey, createAdminDevice, deleteAdminDevice, getAdminDeviceDetail, projectAdminDeviceDetail, projectDeviceModels, updateAdminDevice } from '../src/lib/psAdminDevice';
const fixture = () => ({ ok: true, device: { id: 'device', serial: 'PS-12345678', hostname: 'ps', model: 'rpi4-2gb', arch: 'arm64', status: 'stock', legacy: false, venue_id: null },
  update: { current_version: '0.3.1', latest_stable: { edition_id: 'stable', version: '0.3.2', model: 'rpi4-2gb', arch: 'arm64' }, update_available: true, reason: null, active_update: null }, delete: { allowed: true, blockers: [] as string[] } });
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe('PE-432 admin device contracts', () => {
  it('projects the model catalogue without a hardcoded hardware choice', () => {
    expect(projectDeviceModels({ ok: true, models: [{ model: 'new-model', label: 'New model', archs: ['armhf','arm64'], default_arch: 'armhf', secret: 'hidden' }] })).toEqual([{ model: 'new-model', label: 'New model', archs: ['armhf','arm64'], default_arch: 'armhf' }]);
    expect(() => projectDeviceModels({ok:true,models:[{model:'bad',label:'Bad',archs:['armhf'],default_arch:'arm64'}]})).toThrow();
  });
  it('does not expose credentials or offer incompatible or already active updates', () => {
    const f=fixture(); const result=projectAdminDeviceDetail({...f, wifi_psk:'secret', device:{...f.device,admin_code:'secret'}});
    expect(JSON.stringify(result)).not.toContain('secret'); expect(result.update.update_available).toBe(true);
    f.update.latest_stable.arch='armhf'; expect(projectAdminDeviceDetail(f).update.update_available).toBe(false);
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
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,deployment_id:'deployment'}),{status:200})); vi.stubGlobal('fetch',fetch);
    expect(await updateAdminDevice('device','stable')).toEqual({deployment_id:'deployment'});
    const [url,request]=fetch.mock.calls[0]; expect(url).toMatch(/functions\/v1\/ps-ota-admin$/); expect(JSON.parse(request.body)).toEqual({action:'update_device',device_id:'device',edition_id:'stable'});
    expect(request.headers.Authorization).toBe('Bearer user-session');
    fetch.mockResolvedValue(new Response(JSON.stringify({ok:false,error:'edition_not_latest_stable'}),{status:409}));
    await expect(updateAdminDevice('device','stable')).rejects.toMatchObject({key:'adminDevice.error.edition_not_latest_stable'});
  });
  it('does not mutate without a session and forwards cancellation to reads', async () => {
    mocks.getSession.mockResolvedValue({data:{session:null}}); const fetch=vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(updateAdminDevice('device','stable')).rejects.toMatchObject({code:'sessionExpired'}); expect(fetch).not.toHaveBeenCalled();
    const signal=new AbortController().signal,abortSignal=vi.fn().mockResolvedValue({data:fixture()}); mocks.rpc.mockReturnValue({abortSignal});
    await getAdminDeviceDetail('device',signal); expect(abortSignal).toHaveBeenCalledWith(signal);
  });
});
