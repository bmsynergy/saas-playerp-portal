import { describe, expect, it } from 'vitest';
import { validatedPsPortalUrl } from '../src/lib/psPortalUrl';
const server = { hostname: 'playerp-ps-5easg93m', local_port: 8443, last_status: { portal_url: 'https://playerp-ps-5easg93m.local:8443/', uptime_seconds: null, queue_depth: null, note: null } };
const url = (portal_url: string) => ({ ...server, last_status: { ...server.last_status, portal_url } });
describe('PS reported canonical HTTPS portal', () => {
  it('accepts only the reported canonical hostname and port, including reported .local suffix', () => {
    expect(validatedPsPortalUrl(server)).toBe(server.last_status.portal_url);
    expect(validatedPsPortalUrl({...server, hostname: server.hostname + '.local'})).toBe(server.last_status.portal_url);
  });
  it.each([
    'http://playerp-ps-5easg93m.local:8443/', 'https://10.0.0.128:8443/',
    'https://evil.invalid:8443/', 'https://playerp-ps-5easg93m.local.evil.invalid:8443/',
    'https://playerp-ps-5easg93m.local:443/', 'https://playerp-ps-5easg93m.local:8443/login',
    'https://playerp-ps-5easg93m.local:8443/?a=b', 'https://playerp-ps-5easg93m.local:8443/#login',
    'https://user:pass@playerp-ps-5easg93m.local:8443/', 'javascript:alert(1)',
    ' https://playerp-ps-5easg93m.local:8443/', 'https://playerp-ps-5easg93m.local:8443/a/../',
    'https://playerp-ps-5easg93m.local:8443/?', 'https://playerp-ps-5easg93m.local:8443/#',
    'https://%70layerp-ps-5easg93m.local:8443/', '//playerp-ps-5easg93m.local:8443/',
  ])('rejects an unsafe or noncanonical reported URL: %s', value => expect(validatedPsPortalUrl(url(value))).toBeNull());
  it('never guesses missing URL, hostname or port and rejects malformed ports and hostnames', () => {
    expect(validatedPsPortalUrl(null)).toBeNull();
    expect(validatedPsPortalUrl({...server,last_status:null})).toBeNull();
    expect(validatedPsPortalUrl(url(''))).toBeNull();
    for (const hostname of [null,'','10.0.0.128','evil.invalid','1234','-ps','ps-','ps local']) expect(validatedPsPortalUrl({...server,hostname})).toBeNull();
    for (const local_port of [null,0,-1,65536,8443.5]) expect(validatedPsPortalUrl({...server,local_port})).toBeNull();
  });
});
