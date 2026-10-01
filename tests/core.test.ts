import { describe, expect, it } from 'vitest';
import { signalState } from '../src/lib/status';
import { errorCode } from '../src/lib/errors';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';
const now = Date.parse('2026-10-01T12:00:00Z');
const server={id:'1',venue_id:'2',software_version:null,last_seen_at:null,status:'active' as const};
describe('Print Server signal contract',()=>{
  it('revoked wins over a recent heartbeat',()=>expect(signalState({...server,status:'revoked',last_seen_at:new Date(now).toISOString()},now)).toBe('revoked'));
  it('uses the same strict three-minute boundary as the venue panel',()=>{
    expect(signalState({...server,last_seen_at:new Date(now-179999).toISOString()},now)).toBe('online');
    expect(signalState({...server,last_seen_at:new Date(now-180000).toISOString()},now)).toBe('offline');
  });
  it('pending never implies online, even with a recent heartbeat',()=>{
    expect(signalState({...server,status:'pending',last_seen_at:new Date(now).toISOString()},now)).toBe('pending');
    expect(signalState({...server,status:'pending'},now)).toBe('pending');
  });
  it('does not invent a missing heartbeat',()=>{
    expect(signalState(server,now)).toBe('noSignal');
    expect(signalState({...server,last_seen_at:'invalid'},now)).toBe('noSignal');
    expect(signalState({...server,last_seen_at:new Date(now+60000).toISOString()},now)).toBe('offline');
  });
});
describe('Public error mapping',()=>{
  it('does not show raw provider messages or credentials',()=>expect(errorCode({message:'secret internal value'})).toBe('genericError'));
  it('distinguishes revocation from retryable connection failures',()=>{
    expect(errorCode({code:'refresh_token_not_found',status:400})).toBe('sessionExpired');
    expect(errorCode({name:'AuthRetryableFetchError'})).toBe('networkError');
    expect(errorCode({code:'42501'})).toBe('accessDenied');
    expect(errorCode({code:'otp_expired'})).toBe('invalidLink');
  });
});
it('ships matching nonempty English and Spanish catalogs',()=>{
  expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  for(const value of [...Object.values(en),...Object.values(es)]) expect(value.trim().length).toBeGreaterThan(0);
});
