import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { getMaintenanceVenueList, getMaintenanceVenueRuns, maintenanceRunFilters, getMaintenanceOverview, getMaintenanceRecipients, searchMaintenanceVenues, searchMaintenanceRecipients, setMaintenanceRecipient } from '../src/lib/maintenance';

describe('maintenance server contracts', () => {
  it('searches venues on the server and requests at most 25 rows', async () => {
    const data={total:133, summary:{venues:133}, venues:[]};
    rpc.mockResolvedValue({data,error:null});
    expect(await getMaintenanceVenueList(' QA-120 Sede 117 ',90,2)).toBe(data);
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_venue_list',{p_query:'QA-120 Sede 117',p_days:90,p_page:2,p_page_size:25});
    await getMaintenanceVenueList(' ',7,1);
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_venue_list',{p_query:null,p_days:7,p_page:1,p_page_size:25});
  });
  it('passes date, status, task, order and pagination to venue runs without client filtering',async()=>{
    const filters=maintenanceRunFilters(new URLSearchParams('from=2026-10-01&to=2026-11-03&status=problem&task=pos_card_stale&order=asc&page=3'));
    const data={total:70,nights:[],task_keys:['pos_card_stale']};
    rpc.mockResolvedValue({data,error:null});
    expect(await getMaintenanceVenueRuns('venue-045',filters)).toBe(data);
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_venue_runs',{p_venue_id:'venue-045',p_from:'2026-10-01',p_to:'2026-11-03',p_status:'problem',p_task:'pos_card_stale',p_order:'asc',p_page:3,p_page_size:25});
  });
  it('normalizes malformed URL filters and leaves default dates to the venue-local server clock',()=>{
    expect(maintenanceRunFilters(new URLSearchParams('from=2026-02-30&to=oops&status=stuck&order=invalid&page=-2'))).toEqual({from:'',to:'',status:'',task:'',order:'desc',page:1});
    expect(maintenanceRunFilters(new URLSearchParams('page=Infinity')).page).toBe(1);
  });
  beforeEach(() => rpc.mockReset());
  it('requests only a page of 25 with the selected venue and preserves global totals', async () => {
    const data = { total: 133, page: 2, page_size: 25, pages: 6, problems_total: 42, problems: Array(20).fill({}), venues: [], summary: { venues: 133, venues_with_problems: 30, problem_nights: 42 } };
    rpc.mockResolvedValue({data, error:null});
    expect(await getMaintenanceOverview(14, 'venue-117', 2)).toBe(data);
    expect(rpc).toHaveBeenCalledWith('portal_system_maintenance_overview', {p_days:14, p_venue_id:'venue-117', p_page:2, p_page_size:25});
  });
  it('uses maintenance venue search with a server limit, without inventory search', async () => {
    rpc.mockResolvedValue({data:{venues:[{venue_id:'117',venue_name:'QA-120 Sede 117',timezone:'UTC'}]},error:null});
    const venues = await searchMaintenanceVenues(' Sede 117 ');
    expect(rpc).toHaveBeenCalledWith('portal_maintenance_venue_search',{p_query:'Sede 117',p_limit:20});
    expect(venues[0]).toMatchObject({id:'117',name:'QA-120 Sede 117'});
  });
  it('filters platform candidates on the server and preserves the more-results flag', async () => {
    const data={recipients:[],candidates:[],effective_count:0,candidates_has_more:true};
    rpc.mockResolvedValue({data,error:null});
    expect(await searchMaintenanceRecipients(' person ')).toBe(data);
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_alert_recipients',{p_query:'person',p_limit:20});
    await getMaintenanceRecipients();
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_alert_recipients',{p_query:null,p_limit:20});
    await setMaintenanceRecipient('person',true);
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_alert_recipient_set',{p_user_id:'person',p_enabled:true});
    await setMaintenanceRecipient('person',false);
    expect(rpc).toHaveBeenLastCalledWith('portal_maintenance_alert_recipient_set',{p_user_id:'person',p_enabled:false});
  });
  it('passes abort signals to paginated requests and propagates failures', async () => {
    const controller=new AbortController(); const abortSignal=vi.fn().mockResolvedValue({data:null,error:new Error('denied')});
    rpc.mockReturnValue({abortSignal});
    await expect(getMaintenanceOverview(7,null,1,controller.signal)).rejects.toThrow('denied');
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});
