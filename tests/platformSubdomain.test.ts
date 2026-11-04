import { describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({supabase: {rpc}}));
import {checkSubdomain, confirmSubdomainChange, getVenueAddress, previewSubdomainChange, subdomainErrorKey} from '../src/lib/platformSubdomain';
import {createBody, emptyTenantForm} from '../src/lib/tenantOnboarding';

describe('PE-577 platform address contract', () => {
  it('sends a label independently of internal slug, without inventing a domain base', () => {
    const body = createBody({...emptyTenantForm('es'), slug: 'dynamicparkpr', platform_subdomain: 'dynamicpark'}, 'request');
    expect(body.venue.slug).toBe('dynamicparkpr');
    expect(body.venue.platform_subdomain).toBe('dynamicpark');
    expect(body.venue).not.toHaveProperty('domain');
  });
  it('preserves pre-upgrade draft retries without adding an empty subdomain to their payload', () => {
    expect(createBody(emptyTenantForm('es'), 'old-request').venue).not.toHaveProperty('platform_subdomain');
  });
  it('checks the same request reservation and preserves server rejection without exposing another tenant', async () => {
    rpc.mockResolvedValueOnce({data: {subdomain:'taken',domain:'taken.playerp.dev.bmore.app',available:false,reason:'taken',environment_state:'pending_relocation'}});
    expect((await checkSubdomain('taken', undefined, 'request')).available).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith('platform_subdomain_check', {p_subdomain:'taken',p_venue_id:null,p_request_key:'request'});
  });
  it('keeps preview read only and sends the exact previous address when confirming', async () => {
    rpc.mockResolvedValueOnce({data:{changed:false,confirm_required:true,preview:{from:'old.playerp.net',to:'new.playerp.net'}}});
    const result = await previewSubdomainChange('venue','new','old.playerp.net');
    expect(rpc.mock.lastCall?.[1]).toEqual({p_venue_id:'venue',p_new_subdomain:'new',p_expected_current:'old.playerp.net',p_confirm:false});
    rpc.mockResolvedValueOnce({data:{changed:true}});
    await confirmSubdomainChange('venue','new',result.preview!.from);
    expect(rpc.mock.lastCall?.[1]).toEqual({p_venue_id:'venue',p_new_subdomain:'new',p_expected_current:'old.playerp.net',p_confirm:true});
  });
  it('fails closed on incomplete success and propagates stale conflict', async () => {
    rpc.mockResolvedValueOnce({data:{changed:false}});
    await expect(confirmSubdomainChange('venue','new',null)).rejects.toThrow();
    rpc.mockResolvedValueOnce({error:{message:'stale_current',code:'P0001'}});
    const error = await confirmSubdomainChange('venue','new',null).catch(e=>e);
    expect(subdomainErrorKey(error)).toBe('subdomain.error.stale');
    rpc.mockResolvedValueOnce({data:{venue_id:'other'}});
    await expect(getVenueAddress('venue')).rejects.toThrow();
  });
});
