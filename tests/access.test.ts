import { describe, expect, it } from 'vitest';
import { destination, displayName, platformAccess, safeNext } from '../src/lib/access';
import type { PortalAccess, OwnerVenue } from '../src/lib/types';
const owner={id:'22222222-2222-4222-8222-222222222222'} as OwnerVenue;
const access=(staff:boolean,venues:OwnerVenue[]=[],manage=staff,tenants=manage):PortalAccess=>({is_platform_staff:staff,can_manage_staff:manage,can_view_tenants:tenants,platform_role:!staff?null:manage?'super_admin':tenants?'operations':'support',owner_venues:venues});
const user='33333333-3333-4333-8333-333333333333';
const venueUsers='/admin/tenants/'+owner.id+'/users';
describe('scope routing uses backend permissions',()=>{
  it('keeps the global list login destination limited to platform Admin',()=>{
    const path='/admin/print-servers/list';
    expect(destination(access(true),path)).toBe(path);
    expect(destination(access(true,[],false,true),path)).toBe('/admin');
    expect(destination(access(false,[owner]),path)).toBe('/');
    expect(safeNext(path+'/extra')).toBeNull();
  });
  it('defaults staff and mixed identities to admin even after entering through root',()=>{
    expect(destination(access(true),'/')).toBe('/admin');
    expect(destination(access(true,[owner]),'/')).toBe('/admin');
  });
  it('does not take tenant identities into an admin shell for direct admin URLs',()=>expect(destination(access(false,[owner]),'/admin/staff')).toBe('/'));
  it('keeps valid authorized deep links, rejects unrecognized redirects',()=>{
    expect(destination(access(true),'/admin/staff')).toBe('/admin/staff');
    expect(destination(access(false,[owner]),'/?venue='+owner.id)).toBe('/?venue='+owner.id);
    for(const path of ['https://evil.invalid','//evil.invalid','/admin/../evil','/admin?next=https://evil.invalid','javascript:alert(1)']) expect(safeNext(path)).toBeNull();
  });
  it('support only starts at its admin landing, and no membership grants no destination',()=>{
    expect(destination(access(true,[],false),'/admin/staff')).toBe('/admin');
    for(const path of ['/admin/tenants','/admin/tenants/'+owner.id,venueUsers,'/admin/users','/admin/users/'+user]) expect(destination(access(true,[],false),path)).toBe('/admin');
    expect(destination(access(false))).toBeNull();
  });
  it('Admin keeps the venue Users tab deep link; it is never a destination for tenant identities',()=>{
    for(const path of [venueUsers,'/admin/tenants/'+owner.id]) expect(destination(access(true),path)).toBe(path);
    expect(destination(access(false,[owner]),venueUsers)).toBe('/');
    for(const path of [venueUsers+'/','/admin/tenants/users','/admin/tenants/'+owner.id+'/users/'+user,'/admin/tenants/'+owner.id+'/../staff',venueUsers+'?x=1']) expect(safeNext(path)).toBeNull();
  });
  it('the retired global /admin/users is no longer a login destination',()=>{
    for(const path of ['/admin/users','/admin/users/'+user]) {
      expect(safeNext(path)).toBeNull();
      expect(destination(access(true),path)).toBe('/admin');
    }
  });
  it('Operations reaches tenants but never a venue Users tab or staff',()=>{
    const operations=access(true,[],false,true);
    expect(destination(operations,'/admin/tenants')).toBe('/admin/tenants');
    expect(destination(operations,'/admin/tenants/'+owner.id)).toBe('/admin/tenants/'+owner.id);
    for(const path of [venueUsers,'/admin/users','/admin/staff']) expect(destination(operations,path)).toBe('/admin');
  });
  it('keeps venue Print Server context through login without widening role access',()=>{
    const base='/admin/tenants/'+owner.id+'/print-servers';
    for (const path of [base,base+'/detail']) {
      expect(safeNext(path)).toBe(path);
      expect(destination(access(true),path)).toBe(path);
      expect(destination(access(true,[],false,true),path)).toBe('/admin');
      expect(destination(access(true,[],false),path)).toBe('/admin');
      expect(destination(access(false,[owner]),path)).toBe('/');
      expect(destination(access(false),path)).toBeNull();
    }
    for (const path of [base+'/',base+'/detail/extra',base+'/../users',base+'?venue='+user]) expect(safeNext(path)).toBeNull();
  });
  it('the Print Server fleet and its venue detail are deep links for Admin only',()=>{
    const fleet=['/admin/print-servers','/admin/print-servers/'+owner.id];
    for(const path of fleet) {
      expect(safeNext(path)).toBe(path);
      expect(destination(access(true),path)).toBe(path);
      expect(destination(access(true,[],false,true),path)).toBe('/admin');
      expect(destination(access(true,[],false),path)).toBe('/admin');
      expect(destination(access(false,[owner]),path)).toBe('/');
      expect(destination(access(false),path)).toBeNull();
    }
    for(const path of ['/admin/print-servers/','/admin/print-servers/../staff','/admin/print-servers/'+owner.id+'/revoke','/admin/print-servers?venue='+owner.id,'/admin/print-serversx']) expect(safeNext(path)).toBeNull();
  });
});
describe('platform role projection',()=>{
  it('Operations views tenants without managing staff',()=>expect(platformAccess(true,false,'operations')).toEqual({is_platform_staff:true,can_manage_staff:false,can_view_tenants:true,platform_role:'operations'}));
  it('Admin has everything, Support only the landing',()=>{
    expect(platformAccess(true,true,'super_admin')).toEqual({is_platform_staff:true,can_manage_staff:true,can_view_tenants:true,platform_role:'super_admin'});
    expect(platformAccess(true,false,'support')).toEqual({is_platform_staff:true,can_manage_staff:false,can_view_tenants:false,platform_role:'support'});
  });
  it('falls back to the Admin flag when the role is missing or unrecognized',()=>{
    for(const role of [undefined,null,'owner',7]) {
      expect(platformAccess(true,true,role)).toMatchObject({can_view_tenants:true,platform_role:null});
      expect(platformAccess(true,false,role)).toMatchObject({can_view_tenants:false,can_manage_staff:false,platform_role:null});
    }
  });
  it('a role claim without an active membership grants nothing',()=>expect(platformAccess(false,true,'super_admin')).toEqual({is_platform_staff:false,can_manage_staff:false,can_view_tenants:false,platform_role:null}));
});
describe('display name never implies access',()=>{
  it('uses staff profile first and last name, then the full email',()=>{
    const user={email:'info@toothmagicmemory.com',user_metadata:{full_name:'Ignored metadata'}};
    expect(displayName(user,{first_name:'  Ada ',last_name:' Lovelace  '})).toBe('Ada Lovelace');
    expect(displayName(user,{first_name:null,last_name:' Lovelace '})).toBe('Lovelace');
    for (const profile of [undefined,null,{}, {first_name:' ',last_name:null}, {first_name:7,last_name:{role:'super_admin'}}]) {
      expect(displayName(user,profile)).toBe('info@toothmagicmemory.com');
    }
    expect(displayName({})).toBe('PlayERP');
  });
});
