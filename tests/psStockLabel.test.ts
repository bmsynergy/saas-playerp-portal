import { describe,it,expect,vi } from 'vitest';
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
import { supabase } from '../src/lib/supabase';
import { getStockLabel } from '../src/lib/psStock';
const label = {device_id:'fixture',serial:'PS-TEST1234',ssid:'Test',psk:'0123456789',admin_code:'TEST1-TEST2',local_address:'http://10.77.0.1',wifi_qr:'WIFI:T:WPA;S:Test;P:0123456789;;'};
describe('stock label confirmed maintenance code',()=>{
 it('projects only human credentials returned by the authorized RPC',async()=>{
  vi.mocked(supabase.rpc).mockResolvedValue({data:{ok:true,label:{...label,token:'pst_fake',service_key:'technical'}},error:null} as any);
  expect(await getStockLabel('fixture')).toEqual(label);
  expect(supabase.rpc).toHaveBeenCalledWith('ps_admin_stock_label',{p_device_id:'fixture'});
 });
 it('rejects missing/unconfirmed and technical credentials instead of a partial label',async()=>{
  for(const admin_code of [null,undefined,'','pst_fake','pse_fake','sb_secret_fake','sb_publishable_fake','PRIVATE KEY']){
   vi.mocked(supabase.rpc).mockResolvedValue({data:{ok:true,label:{...label,admin_code}},error:null} as any);
   await expect(getStockLabel('fixture')).rejects.toThrow();
  }
  vi.mocked(supabase.rpc).mockResolvedValue({data:{ok:false,error:'device_not_confirmed'},error:null} as any);
  await expect(getStockLabel('fixture')).rejects.toThrow();
 });
});
