import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocked=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn()}));
vi.mock('../src/lib/supabase',()=>({supabase:{rpc:mocked.rpc,functions:{invoke:mocked.invoke}}}));
import {getSupportList,getSupportDetail,defaultSupportFilters,replySupport,noteSupport,assignSupport,setSupportStatus} from '../src/lib/support';
import {destination,safeNext} from '../src/lib/access';
import type {PortalAccess} from '../src/lib/types';
beforeEach(()=>vi.resetAllMocks());
describe('Support venue isolation and API contract',()=>{
 it('always fixes a venue selection server-side, ignoring a different filter',async()=>{
  mocked.rpc.mockResolvedValue({data:{scope:'venue',items:[{venue_id:'A'}]}});
  await getSupportList('venue',{...defaultSupportFilters,venueId:'B',assigned:'me',page:3},'A');
  expect(mocked.rpc).toHaveBeenCalledWith('support_ticket_list',expect.objectContaining({p_scope:'venue',p_venue_ids:['A'],p_assigned:null,p_page:3,p_page_size:25}));
 });
 it('rejects a mismatched venue or scope response',async()=>{
  mocked.rpc.mockResolvedValue({data:{scope:'venue',items:[{venue_id:'B'}]}});
  await expect(getSupportList('venue',defaultSupportFilters,'A')).rejects.toMatchObject({code:'accessDenied'});
  mocked.rpc.mockResolvedValue({data:{scope:'platform',items:[]}});
  await expect(getSupportList('venue',defaultSupportFilters)).rejects.toMatchObject({code:'accessDenied'});
 });
 it('never renders internal notes in owner scope and rejects another venue detail',async()=>{
  mocked.rpc.mockResolvedValue({data:{scope:'venue',ticket:{id:'T',venue_id:'A'},messages:[{id:'public'},{id:'secret',is_internal:true}]}});
  expect((await getSupportDetail('venue','T','A')).messages).toEqual([{id:'public'}]);
  await expect(getSupportDetail('venue','T','B')).rejects.toMatchObject({code:'accessDenied'});
 });
 it('uses email edges for public reply/status/assignment, RPC only for private notes',async()=>{
  mocked.invoke.mockResolvedValue({data:{}});mocked.rpc.mockResolvedValue({data:{}});
  await replySupport('T','Hello');await setSupportStatus('T','waiting_tenant');await assignSupport('T',null);await noteSupport('T','Private');
  expect(mocked.invoke.mock.calls).toEqual([['reply-support-ticket',{body:{ticket_id:'T',body:'Hello'}}],['update-support-ticket-status',{body:{ticket_id:'T',status:'waiting_tenant'}}],['support-ticket-assign',{body:{ticket_id:'T',assignee_id:null}}]]);
  expect(mocked.rpc).toHaveBeenCalledWith('support_ticket_add_internal_note',{p_ticket_id:'T',p_body:'Private'});
 });
 it('uses explicit Support permission for login destination',()=>{
  const support={is_platform_staff:true,support_staff:true,can_manage_staff:false,can_view_tenants:false,platform_role:'support',owner_venues:[]} as PortalAccess;
  expect(destination(support,'/admin/support')).toBe('/admin/support');
  expect(destination({...support,support_staff:false},'/admin/support')).toBe('/admin');
  expect(safeNext('/?section=support')).toBe('/?section=support');
  expect(safeNext('/?section=users')).toBeNull();
 });
});
