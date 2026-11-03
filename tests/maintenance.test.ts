import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { getMaintenanceOverview, getMaintenanceRecipients, searchMaintenanceVenues, searchMaintenanceRecipients, setMaintenanceRecipient } from '../src/lib/maintenance';

describe('maintenance server contracts', () => {
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
