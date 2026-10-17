import {describe,it,expect,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/supabase',()=>({supabase:{rpc}}));
import {matchesUtcDay,utcBounds,EMPTY_LIST_FILTERS} from '../src/lib/adminLists';
import {getOtaPage,projectOtaPage} from '../src/lib/ota';
import {eventDetail,eventPhase} from '../src/lib/otaPresentation';
import {getPrinterJobs} from '../src/lib/printServerApi';
import {en} from '../src/locales/en';
import {es} from '../src/locales/es';
describe('PE-409 calendar filters and read contracts',()=>{
 it('includes the entire end day in UTC, independent of DST, and refuses reversed days',()=>{
  expect(utcBounds('2026-03-08','2026-03-08')).toEqual({p_from:'2026-03-08T00:00:00.000Z',p_to:'2026-03-09T00:00:00.000Z'});
  expect(matchesUtcDay('2026-03-08T23:59:59.999Z','2026-03-08','2026-03-08')).toBe(true);
  expect(matchesUtcDay('2026-03-09T00:00:00Z','2026-03-08','2026-03-08')).toBe(false);
  expect(matchesUtcDay(null,'2026-03-08','')).toBe(false);
  expect(()=>utcBounds('2026-03-09','2026-03-08')).toThrow('invalid_range');
 });
 it('sends filters and offsets to OTA server before pagination and preserves returned totals',async()=>{
  rpc.mockResolvedValue({data:{ok:true,total:167,limit:25,offset:50,aggregates:{population:'filtered_deployments',target_by_status:{committed:130}},items:[]},error:null});
  const result=await getOtaPage('deployments',{...EMPTY_LIST_FILTERS,query:' build ',status:'committed',ring:'lab',from:'2026-10-11',to:'2026-10-11'},25,50,null);
  expect(rpc).toHaveBeenLastCalledWith('ps_ota_admin_deployments_page',{p_limit:25,p_offset:50,p_query:'build',p_status:'committed',p_ring:'lab',p_from:'2026-10-11T00:00:00.000Z',p_to:'2026-10-12T00:00:00.000Z'});
  expect(result.total).toBe(167);expect(result.aggregates.target_by_status.committed).toBe(130);
 });
 it('constrains targets/events by their parent and audits by action',async()=>{
  for(const [kind,parent,param] of [['targets','deployment','p_deployment_id'],['events','target','p_target_id']] as const){
   await getOtaPage(kind,EMPTY_LIST_FILTERS,10,10,parent);expect(rpc.mock.lastCall?.[1][param]).toBe(parent);
  }
  await getOtaPage('audit',{...EMPTY_LIST_FILTERS,status:'ps_ota_deployed'},10,0,null);
  expect(rpc.mock.lastCall?.[1]).toMatchObject({p_action:'ps_ota_deployed'});expect(rpc.mock.lastCall?.[1]).not.toHaveProperty('p_status');
 });
 it('retains the original technical detail and errors with unknown phases',()=>{
  const detail={updater_version:'1.0.0',error:'health check failed'};
  const e=projectOtaPage('events',{ok:true,total:1,limit:25,offset:0,items:[{id:123,phase:'Future Phase!',error_code:'health_failed',detail}],aggregates:{}}).items[0];
  expect(e.phase).toBe('Future Phase!');expect(e.error_code).toBe('health_failed');expect(JSON.parse(e.detail!)).toEqual(detail);
  expect(eventDetail(e.detail).human).toBe('health check failed');
  expect(eventDetail('{"updater_version":"1.0.0"}')).toEqual({human:null,technical:true});
  expect(eventDetail('Disk is full').human).toBe('Disk is full');
  for(const locale of [en,es]){const t=(k:string)=>(locale as Record<string,string>)[k]??k;expect(eventPhase(t,'Future Phase!')).toBe(t('list.unknownPhase')+': Future Phase!');}
 });
 it('keeps queue venue/printer scope while passing complete-day filters',async()=>{
  rpc.mockResolvedValue({data:{ok:true,total:0,limit:10,offset:0,jobs:[]},error:null});
  await getPrinterJobs('venue-A','printer-A',10,0,{query:'test',status:'failed',from:'2026-10-11',to:'2026-10-11'});
  expect(rpc.mock.lastCall).toEqual(['ps_panel_printer_jobs',{p_venue_id:'venue-A',p_printer_id:'printer-A',p_limit:10,p_offset:0,p_query:'test',p_status:'failed',p_from:'2026-10-11T00:00:00.000Z',p_to:'2026-10-12T00:00:00.000Z'}]);
 });
});
