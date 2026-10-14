import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { formatAdminCode, normalizeAdminCode, validAdminCode, projectDeviceSheet, projectLegacyContext, reconcileLegacy, deviceSheetPollInterval } from '../src/lib/psDevice';
const raw = { ok:true, venue_id:'fixture', device_id:'fixture', serial:'PS-FIXTURE', legacy:true, print_server_id:'fixture', print_server_status:'active', ca_der_sha256:'a'.repeat(64), wifi_confirmed:false, admin_code_confirmed:false };
beforeEach(() => { mocks.rpc.mockReset().mockImplementation(async (name:string) => ({data:name.endsWith('_context') ? raw : {ok:true}})); });
describe('PE-439 current representations and exact legacy', () => {
  for (const value of ['ABCDE23456','abcde23456','ABCDE-23456','abcde-23456','ABCD-E234-56','abcd-e234-56']) it(`normalizes known representation ${value}`, async () => {
    expect(normalizeAdminCode(value)).toBe('ABCDE23456');
    expect(formatAdminCode(value)).toBe('ABCDE-23456');
    await reconcileLegacy(projectLegacyContext(raw),'admin_code',{admin_code:value},true,'a'.repeat(12));
    expect(mocks.rpc).toHaveBeenLastCalledWith('ps_admin_legacy_credentials_reconcile',expect.objectContaining({p_values:{admin_code:'ABCDE23456'}}));
  });
  for (const value of ['aB-!', 'LeGa-cY-9!','AB-CDE23456','abc-de23456','TY15F-F3583','X'.repeat(64)]) it(`preserves legacy fixture exactly (${value.length} chars)`, async () => {
    expect(validAdminCode(value)).toBe(true);
    expect(normalizeAdminCode(value)).toBe(value); expect(formatAdminCode(value)).toBe(value);
    await reconcileLegacy(projectLegacyContext(raw),'admin_code',{admin_code:value},true,'a'.repeat(12));
    expect(mocks.rpc).toHaveBeenLastCalledWith('ps_admin_legacy_credentials_reconcile',expect.objectContaining({p_values:{admin_code:value}}));
    const sheet=projectDeviceSheet({ok:true,credentials_version:1,can_read_credentials:true,wifi:{admin_code:value,admin_code_applied_at:'2026-01-01T00:00:00Z'}});
    expect(sheet.appliedAdminCode?.code).toBe(value);
  });
  for (const value of ['abc','x'.repeat(65),' code','code ','ab cd','ab\ncd','abcd\n','abcd\r','ABCDE23456\n','aébcd']) it('rejects invalid legacy without repairing or sending',async()=>{
    expect(validAdminCode(value)).toBe(false);expect(normalizeAdminCode(value)).toBe(value);expect(formatAdminCode(value)).toBe(value);
    await expect(reconcileLegacy(projectLegacyContext(raw),'admin_code',{admin_code:value},true,'a'.repeat(12))).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('presentation never transforms the stored current secret',()=>{
    const sheet=projectDeviceSheet({ok:true,credentials_version:1,can_read_credentials:true,wifi:{admin_code:'ABCDE23456',admin_code_applied_at:'2026-01-01T00:00:00Z'}});
    expect(formatAdminCode(sheet.appliedAdminCode!.code)).toBe('ABCDE-23456');expect(sheet.appliedAdminCode!.code).toBe('ABCDE23456');
  });
  it('polls only local recovery or pending credentials, certificates, enrollment',()=>{
    const sheet=projectDeviceSheet({ok:true});
    expect(deviceSheetPollInterval(undefined,false)).toBe(false);
    expect(deviceSheetPollInterval(sheet,false)).toBe(false);
    expect(deviceSheetPollInterval(sheet,true)).toBe(10000);
    for(const field of ['rotations','cert_operations'] as const) for(const status of ['pending','applied','failed'] as const) {
      expect(deviceSheetPollInterval({...sheet,[field]:[{command_id:'test',kind:'wifi',status,requested_at:null,completed_at:null,error_code:null}]},false)).toBe(status==='pending'?10000:false);
    }
    expect(deviceSheetPollInterval({...sheet,enroll:{state:'pending',wifi:'pending',admin_code:'pending',wifi_error:null,admin_code_error:null,acked_at:null}},false)).toBe(10000);
  });
});
