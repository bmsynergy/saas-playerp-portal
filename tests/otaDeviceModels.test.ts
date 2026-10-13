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

describe('OTA overview without automatic audit',()=>{
 const overview={ok:true,keys:[],releases:[],groups:[],devices:[],deployments:[]};
 it('accepts explicit audit omission from DEV and projects an empty list',()=>{
  expect(projectOverview({...overview,audit_included:false}).audit).toEqual([]);
 });
 it('keeps legacy audit responses compatible',()=>{
  expect(projectOverview({...overview,audit:[{action:'ps_ota_deployed'}]}).audit[0].action).toBe('ps_ota_deployed');
 });
 it('rejects missing or malformed audit without the omission contract',()=>{
  expect(()=>projectOverview(overview)).toThrow();
  expect(()=>projectOverview({...overview,audit_included:false,audit:{}})).toThrow();
 });
});
