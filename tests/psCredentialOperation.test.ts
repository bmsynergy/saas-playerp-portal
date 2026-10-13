import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { reconcileCredentialOperation, type CredentialOperation } from '../src/lib/psCredentialOperation';
import type { DeviceOp } from '../src/lib/psDevice';

const pending: CredentialOperation = { kind: 'wifi', commandId: 'current', phase: 'pending' };
const op = (change: Partial<DeviceOp> = {}): DeviceOp => ({ command_id: 'current', kind: 'wifi', status: 'applied', requested_at: null, completed_at: null, error_code: null, ...change });
describe('credential device acknowledgment correlation', () => {
  it('request acceptance, missing history and unrelated operations never imply applied', () => {
    for (const rotations of [[], [op({command_id:'older'})], [op({kind:'admin_code'})], [op({status:'pending'})]]) {
      expect(reconcileCredentialOperation(pending, rotations)).toMatchObject(pending);
    }
    const unknown: CredentialOperation = {...pending, commandId:null};
    expect(reconcileCredentialOperation(unknown, [op()])).toBe(unknown);
  });
  it('uses only the matching command and kind for either applied or failed', () => {
    expect(reconcileCredentialOperation(pending, [op()]).phase).toBe('applied');
    expect(reconcileCredentialOperation(pending, [op({status:'failed',error_code:'device_offline'})])).toMatchObject({...pending,phase:'failed',errorKey:'dev.error.device_offline'});
    const admin: CredentialOperation = {...pending,kind:'admin_code'};
    expect(reconcileCredentialOperation(admin, [op({kind:'admin_code'})]).phase).toBe('applied');
  });
  it('does not regress a confirmed terminal operation on a stale poll', () => {
    const applied: CredentialOperation = {...pending,phase:'applied'};
    expect(reconcileCredentialOperation(applied, [op({status:'pending'})])).toBe(applied);
  });
});

import { credentialProgress, credentialErrorKey } from '../src/lib/psCredentialOperation';
describe('rotation presentation contract 8676b3b', () => {
  it('cannot infer execution from server-derived applying, even without a received timestamp', () => {
    expect(credentialProgress('wifi', [op({status:'pending',wait_reason:'applying'})], null, true, false)?.phase).toBe('pending');
    expect(credentialProgress('wifi', [op({status:'pending',wait_reason:'applying',received_at:'2026-01-01T00:00:00Z'})], null, true, false)?.phase).toBe('received');
  });
  it('unknown connectivity and unknown dates remain unknown', () => {
    expect(credentialProgress('wifi', [op({status:'pending',requested_at:'bad date'})], null, null, false)).toMatchObject({phase:'pending',requestedAt:null,updatedAt:null,waitReason:null});
  });
  it('uses event timestamps, not a fetch clock', () => {
    const value=credentialProgress('wifi',[op({status:'pending',requested_at:'2026-01-01T00:00:00Z',received_at:'2026-01-01T00:01:00Z',wait_updated_at:'2026-01-01T00:02:00Z'})],null,true,false);
    expect(value?.updatedAt).toBe('2026-01-01T00:02:00Z');
    expect(credentialProgress('wifi',[op({status:'pending'})],pending,true,false)?.phase).toBe('pending');
  });
  it('lost acceptance reconciles only a new or open same-kind order, never old success', () => {
    const lost:CredentialOperation={kind:'wifi',phase:'uncertain',commandId:null,previousIds:['current']};
    expect(reconcileCredentialOperation(lost,[op()])).toBe(lost);
    expect(reconcileCredentialOperation(lost,[op({command_id:'new',kind:'admin_code'})])).toBe(lost);
    expect(reconcileCredentialOperation(lost,[op({command_id:'new'})])).toMatchObject({phase:'applied',commandId:'new'});
  });
  it('deduplicated acceptance preserves the original request time and id', () => {
    expect(credentialProgress('wifi',[op({status:'pending',requested_at:'2026-01-01T00:00:00Z'})],{...pending,already:true},false,false)).toMatchObject({phase:'offline',already:true,commandId:'current',requestedAt:'2026-01-01T00:00:00Z'});
  });
  it('tracking loss is not device failure, and arbitrary device errors are not displayed', () => {
    expect(credentialProgress('wifi',[op({status:'pending'})],null,true,true)?.phase).toBe('uncertain');
    expect(credentialErrorKey('SECRET')).toBe('dev.progress.rotationErrorUnknown');
  });
});
