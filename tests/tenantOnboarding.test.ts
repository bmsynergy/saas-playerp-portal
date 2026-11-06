import {describe,it,expect,vi} from 'vitest';
const invoke=vi.hoisted(()=>vi.fn()); const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/supabase',()=>({supabase:{rpc,functions:{invoke}}}));
import {changedFields,createBody,createTenant,emptyTenantForm,invalidFields,onboardingErrorKey,slugify,updateTenantInfo} from '../src/lib/tenantOnboarding';
import {en} from '../src/locales/en';
import {es} from '../src/locales/es';

const form={...emptyTenantForm('es'),name:'Café Niño',slug:'cafe-nino',owner_email:' Ana@Example.com ',owner_first_name:'Ana',owner_last_name:'Ruiz'};
describe('PE-575 new tenant',()=>{
  it('builds a safe slug and validates each step',()=>{
    expect(slugify('  Café Niño & Co. ')).toBe('cafe-nino-co');
    expect(invalidFields(form,0)).toEqual([]);
    expect(invalidFields({...form,slug:'Bad Slug',timezone:'Mars/Base'},0)).toEqual(['slug','timezone']);
    expect(invalidFields({...form,owner_email:'x'},1)).toEqual(['owner_email']);
  });
  it('sends the same request key and normalized owner, without POS or billing defaults',()=>{
    const body=createBody(form,'11111111-1111-4111-8111-111111111111');
    expect(body.request_key).toBe('11111111-1111-4111-8111-111111111111');
    expect(body.owner.email).toBe('ana@example.com');
    expect(body.venue.email).toBeUndefined();
    expect(body.billing).toEqual({});
  });
  it('maps a duplicate slug to a localized message and a compensated failure to a retryable request',async()=>{
    invoke.mockResolvedValueOnce({data:null,error:{context:new Response(JSON.stringify({error:'duplicate_slug'}),{status:409})}});
    await expect(createTenant(form,'k')).rejects.toMatchObject({key:'tenantNew.error.duplicateSlug'});
    invoke.mockResolvedValueOnce({data:null,error:{context:new Response(JSON.stringify({error:'auth_create_user',status:'failed',retryable:true}),{status:502})}});
    const e=await createTenant(form,'k').catch(x=>x);
    expect(e.request).toMatchObject({status:'failed',retryable:true,request_key:'k'});
    expect(onboardingErrorKey(e)).toBe('genericError');
  });
  it('edits only changed fields through update_tenant_info',async()=>{
    const before={name:'A',email:null,phone:'1',address:null,city:'San Juan',state:null,timezone:'America/Puerto_Rico'};
    const fields=changedFields(before,{name:'A',email:'a@b.co',phone:'1',address:'',city:'Ponce',state:'',timezone:'America/Puerto_Rico'});
    expect(fields).toEqual({email:'a@b.co',city:'Ponce'});
    rpc.mockResolvedValueOnce({error:null});
    await updateTenantInfo('v',fields);
    expect(rpc).toHaveBeenCalledWith('update_tenant_info',{p_venue_id:'v',p_fields:{email:'a@b.co',city:'Ponce'}});
  });
  it('has every new string in both languages',()=>{
    for(const k of Object.keys(en).filter(k=>/^(tenantNew|tenantEdit|readiness)\./.test(k))) expect(es[k as keyof typeof en],k).toBeTruthy();
  });
});
