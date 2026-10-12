import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
import {projectOverview} from '../src/lib/ota';
describe('OTA device hardware models',()=>{
 it('joins hardware by server identity, never by hostname or list order',()=>{
  const overview={ok:true,keys:[],releases:[],groups:[],deployments:[],audit:[],devices:[{print_server_id:'server-a',hostname:'same'},{print_server_id:'server-b',hostname:'same'},{print_server_id:'legacy'}]};
  const result=projectOverview(overview,[{print_server_id:'server-b',model:'model-b'},{print_server_id:null,model:'unassigned'},{print_server_id:'server-a',model:'model-a'}]);
  expect(result.devices.map(d=>d.model)).toEqual(['model-a','model-b',null]);
 });
});
