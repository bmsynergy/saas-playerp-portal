import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {getAdminDeviceSheet,projectAdminDeviceSheet} from '../src/lib/psAdminDeviceSheet';
import fixture from './fixtures/admin-device-stock.json';
const id=fixture.device_id;
beforeEach(()=>vi.resetAllMocks());
describe('staff inventory sheet boundary',()=>{
  it('preserves historical records and confirmed credentials while excluding pending secrets',()=>{
    const s=projectAdminDeviceSheet(fixture,id);
    expect(s.jobs.total).toBe(7);expect(s.assignments[0].status).toBe('revoked');expect(s.scans.items).toHaveLength(1);
    expect(s.credentials.wifi?.psk).toBe('0123456782');expect(s.label.ready).toBe(true);
    expect(JSON.stringify(s)).not.toContain('MUST-NOT-PROJECT');
  });
  it('rejects mismatched root, nested device and label identities',()=>{
    expect(()=>projectAdminDeviceSheet(fixture,'other')).toThrow();
    expect(()=>projectAdminDeviceSheet({...fixture,device:{...fixture.device,id:'other'}},id)).toThrow();
    expect(()=>projectAdminDeviceSheet({...fixture,label:{...fixture.label,label:{...fixture.label.label,device_id:'other'}}},id)).toThrow();
  });
  it('does not show unconfirmed values or make their label printable',()=>{
    const s=projectAdminDeviceSheet({...fixture,credentials:{...fixture.credentials,wifi:{...fixture.credentials.wifi,applied_at:null},admin_code:{...fixture.credentials.admin_code,applied_at:null}}},id);
    expect(s.credentials.wifi).toBeNull();expect(s.credentials.admin_code).toBeNull();expect(s.label.ready).toBe(false);expect(s.label.label).toBeNull();
  });
  it('binds reads to device ID, supports cancellation, and propagates access denial',async()=>{
    const signal=new AbortController().signal;
    const abortSignal=vi.fn().mockResolvedValue({data:fixture});mocks.rpc.mockReturnValue({abortSignal});
    await getAdminDeviceSheet(id,signal);expect(mocks.rpc).toHaveBeenCalledWith('ps_admin_device_sheet',{p_device_id:id});expect(abortSignal).toHaveBeenCalledWith(signal);
    mocks.rpc.mockResolvedValue({error:{code:'42501'}});await expect(getAdminDeviceSheet(id)).rejects.toMatchObject({code:'42501'});
  });
});
