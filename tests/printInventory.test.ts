import { describe, expect, it } from 'vitest';
import { EMPTY_INVENTORY_FILTER as all, UNKNOWN_VERSION, UNASSIGNED_VENUE, filterInventory, projectInventory, summarizeInventory, type InventoryItem } from '../src/lib/printInventory';
const at='2026-10-02T17:00:00Z';
const item=(changes:Partial<InventoryItem>):InventoryItem=>({id:'a',device_id:'device',label:'Receipt PS',hostname:null,assignment:'assigned',venue_id:'venue-a',venue_name:'Harbor',last_venue_name:null,connection:'online',last_seen_at:at,last_report_at:at,firmware_version:'0.3.3',firmware_known:true,error_count:0,warning_count:0,printers_total:2,pending_jobs:0,last_issue_at:null,issues:[],...changes});
const items=[item({}),item({id:'b',venue_id:'venue-b',venue_name:'Garden',connection:'offline',firmware_version:'0.3.2',error_count:3,warning_count:1,last_issue_at:at}),item({id:'c',connection:'unknown',firmware_version:null,firmware_known:false,last_seen_at:null,last_report_at:null}),item({id:'d',assignment:'unassigned',venue_id:null,venue_name:null,connection:'unassigned',firmware_version:null,firmware_known:false,printers_total:null,pending_jobs:null})];
describe('Inventory snapshot and filtered denominators',()=>{
 it('separates unknown/offline/unassigned and counts affected devices, not error events',()=>{
  const s=summarizeInventory(items);expect(s).toMatchObject({total:4,online:1,offline:1,unknown:1,unassigned:1,with_errors:1,with_warnings:1,last_issue_at:at});
  expect(s.firmware).toEqual([{version:'0.3.2',count:1,pct:25},{version:'0.3.3',count:1,pct:25},{version:null,count:2,pct:50}]);
 });
 it('uses every filter for list and summaries, including unknown firmware and no venue',()=>{
  const selected=filterInventory(items,{...all,venue:'venue-a',version:UNKNOWN_VERSION,state:'unknown'});
  expect(selected.map(i=>i.id)).toEqual(['c']);expect(summarizeInventory(selected)).toMatchObject({total:1,unknown:1,firmware:[{version:null,count:1,pct:100}]});
  expect(filterInventory(items,{...all,venue:UNASSIGNED_VENUE}).map(i=>i.id)).toEqual(['d']);
  expect(filterInventory(items,{...all,state:'errors'}).map(i=>i.id)).toEqual(['b']);
  expect(filterInventory(items,{...all,state:'warnings'}).map(i=>i.id)).toEqual(['b']);
  expect(filterInventory(items,{...all,query:' garden ',version:'0.3.2'}).map(i=>i.id)).toEqual(['b']);
  expect(summarizeInventory(filterInventory(items,{...all,state:'online',version:UNKNOWN_VERSION}))).toMatchObject({total:0,firmware:[]});
 });
 it('projects only safe fields and preserves unavailable printer counts',()=>{
  const raw={contract_version:1,generated_at:at,online_window_seconds:180,summary:{total:9000},items:items.map(i=>({...i,credential_hash:'private',last_status:{note:'private'},issues:[{level:'warning',source:'job',code:'job_uncertain',count:1,at:null,payload_text:'private'}]}))};
  const result=projectInventory(raw);expect(JSON.stringify(result)).not.toContain('private');expect(result.items[3].pending_jobs).toBeNull();expect(summarizeInventory(result.items).total).toBe(4);
 });
 it('fails closed for incompatible, partial or malformed snapshots',()=>{
  const valid={contract_version:1,generated_at:at,online_window_seconds:180,items};
  for(const invalid of [{...valid,contract_version:2},{...valid,generated_at:'invalid'},{...valid,items:null},{...valid,items:[items[0],items[0]]},{...valid,items:[{...items[0],error_count:-1}]},{...valid,items:[{...items[0],assignment:'unassigned'}]}])expect(()=>projectInventory(invalid)).toThrow();
 });
});
