import {describe,it,expect,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/supabase',()=>({supabase:{rpc}}));
import {getTargetEvents} from '../src/lib/ota';
describe('Complete deploy events',()=>{
 it('reads all events for one target without a page limit and preserves unknown phases',async()=>{
  const events=Array.from({length:137},(_,i)=>({id:i,phase:i===136?'Future Phase!':'committed',status:'committed',detail:{message:'Application healthy'},progress:100}));
  rpc.mockResolvedValue({data:{ok:true,events},error:null});
  const data=await getTargetEvents('target-current');
  expect(rpc).toHaveBeenCalledWith('ps_ota_target_events',{p_target_id:'target-current'});
  expect(data).toHaveLength(137);expect(data.at(-1)?.phase).toBe('Future Phase!');expect(data.at(-1)?.id).toBe('136');
 });
 it('does not show a failed read as an empty event list',async()=>{
  rpc.mockResolvedValue({data:{ok:false},error:null});await expect(getTargetEvents('target-current')).rejects.toThrow();
 });
});
