import { describe, expect, it } from 'vitest';
import { destination, displayName, safeNext } from '../src/lib/access';
import type { PortalAccess, OwnerVenue } from '../src/lib/types';
const owner={id:'22222222-2222-4222-8222-222222222222'} as OwnerVenue;
const access=(staff:boolean,venues:OwnerVenue[]=[],manage=staff):PortalAccess=>({is_platform_staff:staff,can_manage_staff:manage,owner_venues:venues});
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
    expect(destination(access(false))).toBeNull();
  });
});
describe('display name never implies access',()=>{
  it('uses a nonblank name, then email, then brand',()=>{
    expect(displayName({email:'a@example.invalid',user_metadata:{full_name:'  Ada  '}})).toBe('Ada');
    expect(displayName({email:'a@example.invalid',user_metadata:{full_name:' ',name:{role:'super_admin'}}})).toBe('a@example.invalid');
    expect(displayName({})).toBe('PlayERP');
  });
});
