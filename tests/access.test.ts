import { describe, expect, it } from 'vitest';
import { destination, displayName, platformAccess, safeNext } from '../src/lib/access';
import { matchesIdentity, slugLabel, venueRoleLabel, venuesLabel, type IdentityUser } from '../src/lib/identity';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';
import type { PortalAccess, OwnerVenue } from '../src/lib/types';
const owner={id:'22222222-2222-4222-8222-222222222222'} as OwnerVenue;
const access=(staff:boolean,venues:OwnerVenue[]=[],manage=staff,tenants=manage):PortalAccess=>({is_platform_staff:staff,can_manage_staff:manage,can_view_tenants:tenants,platform_role:!staff?null:manage?'super_admin':tenants?'operations':'support',owner_venues:venues});
const user='33333333-3333-4333-8333-333333333333';
const person=(over:Partial<IdentityUser>={}):IdentityUser=>({user_id:user,email:'ana@example.invalid',full_name:'Ana Ruiz',role:'front_desk',status:'active',venues:[{id:owner.id,name:'Centro'}],all_venues:false,protected:false,platform_role:null,last_sign_in_at:null,created_at:null,is_self:false,...over});
describe('scope routing uses backend permissions',()=>{
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
    for(const path of ['/admin/tenants','/admin/tenants/'+owner.id,'/admin/users','/admin/users/'+user]) expect(destination(access(true,[],false),path)).toBe('/admin');
    expect(destination(access(false))).toBeNull();
  });
  it('Admin keeps users deep links; they are never a destination for tenant identities',()=>{
    for(const path of ['/admin/users','/admin/users/'+user,'/admin/tenants/'+owner.id]) expect(destination(access(true),path)).toBe(path);
    expect(destination(access(false,[owner]),'/admin/users')).toBe('/');
    for(const path of ['/admin/users/','/admin/users/../staff','/admin/users/'+user+'/edit','/admin/users?x=1']) expect(safeNext(path)).toBeNull();
  });
  it('Operations reaches tenants but never users or staff',()=>{
    const operations=access(true,[],false,true);
    expect(destination(operations,'/admin/tenants')).toBe('/admin/tenants');
    expect(destination(operations,'/admin/tenants/'+owner.id)).toBe('/admin/tenants/'+owner.id);
    for(const path of ['/admin/users','/admin/users/'+user,'/admin/staff']) expect(destination(operations,path)).toBe('/admin');
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
describe('identity directory helpers',()=>{
  const t=(locale:Record<string,string>)=>(key:string)=>locale[key]??key;
  const all={query:'',venue:'',role:'',status:''};
  it('filters by name or email, venue, venue role and status',()=>{
    expect(matchesIdentity(person(),all)).toBe(true);
    expect(matchesIdentity(person(),{...all,query:' RUIZ '})).toBe(true);
    expect(matchesIdentity(person(),{...all,query:'ana@'})).toBe(true);
    expect(matchesIdentity(person({full_name:null}),{...all,query:'ruiz'})).toBe(false);
    expect(matchesIdentity(person(),{...all,venue:owner.id,role:'front_desk',status:'active'})).toBe(true);
    expect(matchesIdentity(person(),{...all,venue:user})).toBe(false);
    expect(matchesIdentity(person(),{...all,role:'manager'})).toBe(false);
    expect(matchesIdentity(person(),{...all,status:'revoked'})).toBe(false);
  });
  it('a venue filter includes people with every venue',()=>expect(matchesIdentity(person({venues:[],all_venues:true,role:'super_admin',protected:true}),{...all,venue:user})).toBe(true));
  it('labels venue roles apart from platform roles and keeps unknown slugs visible',()=>{
    expect(venueRoleLabel(t(es),'front_desk')).toBe('Recepción');
    expect(venueRoleLabel(t(es),'super_admin')).toBe('Superadmin de venue (heredado)');
    expect(venueRoleLabel(t(en),'super_admin')).toBe('Venue super admin (legacy)');
    expect(venueRoleLabel(t(es),null)).toBe('Sin rol');
    expect(venueRoleLabel(t(en),'night_auditor')).toBe('night_auditor');
    expect([slugLabel(t(es),'staff.role','super_admin'),slugLabel(t(es),'staff.role','support'),slugLabel(t(es),'staff.role','operations')]).toEqual(['Admin','Soporte','Operaciones']);
    expect([slugLabel(t(en),'staff.role','super_admin'),slugLabel(t(en),'staff.role','support'),slugLabel(t(en),'staff.role','operations')]).toEqual(['Admin','Support','Operations']);
    expect(slugLabel(t(en),'identity.audit','something_new')).toBe('something_new');
  });
  it('summarizes assigned venues',()=>{
    expect(venuesLabel(t(es),person())).toBe('Centro');
    expect(venuesLabel(t(es),person({all_venues:true}))).toBe('Todos los locales');
    expect(venuesLabel(t(es),person({venues:[]}))).toBe('Sin locales asignados');
  });
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
