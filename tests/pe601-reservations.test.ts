import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/lib/supabase',()=>({supabase:{}}));
import {projectStockReservedCredentials} from '../src/lib/psStock';
import {en} from '../src/locales/en';
import {es} from '../src/locales/es';
const pending={ok:true,device_id:'fixture',serial:'PS-FIXTURE',status:'reserved_pending_confirmation',confirmed_by_device:false,state:'file_issued',next_step:'boot_device_and_configure_wifi',label_ready:false,reserved:{ssid:'Setup-Fixture',psk:'test-password',admin_code:'test-maintenance'},confirmed_at:null,file:{file_id:'file',sha256:'a'.repeat(64),issued_at:'2026-11-07',expires_at:'2026-12-07'}};
describe('Reserved credentials admin contract',()=>{
 it('projects human credentials only and preserves pending state without promoting label',()=>{
  const result=projectStockReservedCredentials({...pending,technical:'pse_synthetic',reserved:{...pending.reserved,private_key:'private'}},'fixture');
  expect(result.reserved).toEqual(pending.reserved);expect(result.label_ready).toBe(false);expect(result.confirmed_at).toBeNull();expect(JSON.stringify(result)).not.toMatch(/private|pse_/);
 });
 it('rejects forbidden, other device, partial or inconsistent confirmation and technical values',()=>{
  for(const raw of [{ok:false,error:'forbidden'},{...pending,device_id:'other'},{...pending,reserved:{ssid:'a'}},{...pending,label_ready:true},{...pending,confirmed_by_device:true},{...pending,reserved:{...pending.reserved,psk:'pst_synthetic'}}]) expect(()=>projectStockReservedCredentials(raw,'fixture')).toThrow();
 });
 it('accepts device confirmation independently of full stock validation',()=>{
  const result=projectStockReservedCredentials({...pending,status:'confirmed_by_device',confirmed_by_device:true,state:'enrolled_pending_confirmation',confirmed_at:{wifi:'2026-11-07',admin_code:'2026-11-07'}},'fixture');
  expect(result.label_ready).toBe(false);expect(result.confirmed_by_device).toBe(true);
 });
 it('supports both next steps without wired instructions in stock/setup translations',()=>{
  for(const locale of [es,en]){
   const strings=locale as Record<string,string>;
   expect(strings['psStock.next.boot_device_and_configure_wifi']).toBeTruthy();
   expect(strings['psStock.next.boot_device_with_ethernet']).toBe(strings['psStock.next.boot_device_and_configure_wifi']);
   for(const [key,value] of Object.entries(strings).filter(([k])=>k.startsWith('psStock.')||k.startsWith('psSetup.')))expect(value,key).not.toMatch(/ethernet/i);
  }
 });
});
