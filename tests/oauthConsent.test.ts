import { describe, expect, it } from 'vitest';
import { consentRequestId, consentPath, consentRedirect, consentErrorKey, validConsentContext } from '../src/lib/oauthConsent';
import { destination, safeNext } from '../src/lib/access';
import type { PortalAccess } from '../src/lib/types';
const id = 'abcdef01-2345-4678-9123-abcdef012345';
describe('OAuth consent request and destination boundaries', () => {
  it('rejects missing, malformed and ambiguous request ids', () => {
    for (const query of ['', 'request_id=', 'request_id=https://evil.invalid', 'request_id=../admin', `request_id=${id}&request_id=${id}`]) {
      expect(consentRequestId(new URLSearchParams(query))).toBeNull();
    }
    expect(consentRequestId(new URLSearchParams(`request_id=${id.toUpperCase()}&redirect_uri=https://evil.invalid`))).toBe(id);
    expect(consentPath(id.toUpperCase())).toBe(`/oauth/consent?request_id=${id}`);
  });
  it('preserves only the allowlisted local OAuth return, including mixed-role identities', () => {
    const path = consentPath(id);
    for (const is_platform_staff of [false, true]) for (const owner_venues of [[], [{id}]]) {
      expect(destination({is_platform_staff, owner_venues} as PortalAccess, path)).toBe(path);
    }
    for (const bad of [`${path}&next=https://evil.invalid`, `${path}&request_id=${id}`, '//evil.invalid', 'https://evil.invalid/oauth/consent']) expect(safeNext(bad)).toBeNull();
  });
  it('accepts only the RPC destination host and web or loopback protocols', () => {
    expect(consentRedirect('https://client.example/cb?code=fake', 'client.example')).toBe('https://client.example/cb?code=fake');
    expect(consentRedirect('https://CLIENT.example:443/cb?code=fake', 'CLIENT.example:443')).toBe('https://client.example/cb?code=fake');
    expect(consentRedirect('http://127.0.0.1:5000/cb?error=access_denied', '127.0.0.1:5000')).toBeTruthy();
    for (const bad of ['javascript:alert(1)', 'data:text/html,bad', '//client.example/cb', 'http://client.example/cb', 'https://evil.invalid/cb', 'https://user:pass@client.example/cb']) expect(consentRedirect(bad, 'client.example')).toBeNull();
  });
  it('fails closed on mismatched or malformed server contexts', () => {
    const context = {request_id:id,client:{id:'client',name:'Client',redirect_host:'client.example'},venues:[{venue_id:id,nombre:'Venue',concedida:true}]};
    expect(validConsentContext(context,id)).toBe(true);
    for (const bad of [null, {}, {...context,request_id:'other'}, {...context,venues:null}, {...context,venues:[null]}, {...context,venues:[...context.venues,...context.venues]}]) expect(validConsentContext(bad,id)).toBe(false);
  });
  it('maps pilot errors without exposing raw server details', () => {
    for (const code of ['mcp_piloto_owner_no_permitido','mcp_piloto_una_sola_sede','mcp_piloto_sede_no_permitida','mcp_request_expired','mcp_consent_not_owner']) expect(consentErrorKey({message:code+': internal detail'})).toBe('oauth.err.'+code);
    expect(consentErrorKey({code:'PGRST301'})).toBe('oauth.sessionExpired');
    expect(consentErrorKey({message:'private detail'},'oauth.loadFailed')).toBe('oauth.loadFailed');
  });
});
