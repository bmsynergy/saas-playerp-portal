import {describe,it,expect} from 'vitest';
import {channelListState,channelsReturnTo,CHANNEL_PAGE_SIZE} from '../src/lib/channelNavigation';
import {canManageRings,safeNext} from '../src/lib/access';
import type {PortalAccess} from '../src/lib/types';
describe('ring navigation and access',()=>{
 it('starts without a global selection and uses pages of 25',()=>{
  expect(channelListState(new URLSearchParams()).filters.channel).toBe('');
  expect(CHANNEL_PAGE_SIZE).toBe(25);
 });
 it('restores ring/search/status/venue/group/page from URL',()=>{
  const id='22222222-2222-4222-8222-222222222222';
  const state=channelListState(new URLSearchParams({channel:'general',q:'two servers',status:'online',venue:id,group:id,page:'2',venueName:'Venue'}));
  expect(state).toMatchObject({page:2,venueLabel:'Venue',filters:{channel:'general',query:'two servers',status:'online',venue_id:id,group_id:id}});
 });
 it('rejects invalid parameters and unsafe return destinations',()=>{
  expect(channelListState(new URLSearchParams('channel=all&status=bad&venue=bad&page=Infinity'))).toMatchObject({page:1,filters:{channel:'',status:'',venue_id:''}});
  for(const url of ['//evil.test','/admin/print-servers/channels/../staff','https://evil.test','/','/admin/print-servers/channels#bad'])expect(channelsReturnTo(url)).toBeNull();
  const url='/admin/print-servers/channels?channel=canary&q=ABC&page=2';
  expect(channelsReturnTo(url)).toBe(url);expect(safeNext(url)).toBe(url);
 });
 it('requires server admin permission and explicit super_admin role',()=>{
  const a:PortalAccess={is_platform_staff:true,can_manage_staff:true,can_view_tenants:true,platform_role:'super_admin',owner_venues:[]};
  expect(canManageRings(a)).toBe(true);
  expect(canManageRings({...a,platform_role:'support'})).toBe(false);
  expect(canManageRings({...a,platform_role:'operations'})).toBe(false);
  expect(canManageRings({...a,can_manage_staff:false})).toBe(false);
  expect(canManageRings(undefined)).toBe(false);
 });
});
