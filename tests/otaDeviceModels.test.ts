import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
import {projectOverview} from '../src/lib/ota';
import {overview} from './fixtures/pe474';
describe('PE474 summary overview (no inventory join)',()=>{
 it('projects totals, bounded groups and no massive auxiliary lists',()=>{
  const p=projectOverview({...overview(),devices:[{secret:'no'}],releases:[{secret:'no'}],groups:[{id:'g',name:'Deployment',kind:'deployment',ring:'lab',member_count:2000,members:['secret']}]});
  expect(p.totals.devices).toBe(2000);expect(p.groups[0].member_count).toBe(2000);expect(p).not.toHaveProperty('devices');expect(p).not.toHaveProperty('releases');expect(JSON.stringify(p)).not.toContain('secret');
 });
 it('accepts explicit audit omission or bounded audit response',()=>{expect(projectOverview(overview()).audit).toEqual([]);expect(projectOverview({...overview(),audit:[{action:'ps_ota_deployed'}]}).audit[0].action).toBe('ps_ota_deployed');});
 it('rejects old versions, unbounded groups and malformed omission',()=>{expect(()=>projectOverview({...overview(),contract_version:1})).toThrow();expect(()=>projectOverview({...overview(),groups:Array(101).fill({})})).toThrow();expect(()=>projectOverview({...overview(),audit_included:false,audit:{}})).toThrow();});
});
