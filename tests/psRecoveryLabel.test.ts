import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { projectRecoveryLabel } from '../src/lib/psRecoveryLabel';
import { projectDeviceSheet } from '../src/lib/psDevice';
import { labelFingerprint } from '../src/lib/psLabel';
const at = '2026-01-01T00:00:00Z';
const response = () => ({ ok: true, label_version: 1, ready: true, missing: [], wifi_rotation_pending: false,
  label: { device_id: 'fixture', serial: 'PS-ABCDEFGH', ssid: 'Print Server', psk: '0123456789', wifi_applied_at: at } });
const sheet = (wifi = {}, extra = {}) => projectDeviceSheet({ok:true,credentials_version:1,can_read_credentials:true,can_manage_credentials:true,
  device:{id:'fixture',serial:'PS-ABCDEFGH',status:'assigned'},wifi:{ssid:'Print Server',psk:'0123456789',wifi_applied_at:at,admin_code:'TEST1-TEST2',admin_code_applied_at:at,...wifi},rotations:[],cert:{},...extra});
describe('confirmed recovery label contract', () => {
  it('joins only confirmed human fields from the same authorized device', () => {
    const raw = response();
    const projected = projectRecoveryLabel({ ...raw, admin_code: 'IGNORED', label: { ...raw.label, admin_code: 'IGNORED', pending_psk: 'PENDING_SENTINEL' } },sheet());
    expect(projected.ready).toBe(true);
    expect(projected.label?.adminCode).toBe('TEST1-TEST2');
    expect(JSON.stringify(projected)).not.toMatch(/IGNORED|SENTINEL/);
  });
  it.each(['credentials_permission', 'device_not_assigned', 'print_server_not_active', 'wifi_not_confirmed'])('preserves actionable missing reason %s without data', reason => {
    expect(projectRecoveryLabel({ ...response(), ready: false, missing: [reason] },sheet())).toMatchObject({ ready: false, missing: [reason], label: null });
  });
  it('fails closed for malformed, inconsistent and unsupported contracts', () => {
    for (const patch of [{label_version:2}, {ready:false}, {missing:['future_reason']}, {wifi_rotation_pending:null}, {label:null}, {label:{...response().label,wifi_applied_at:null}}, {label:{...response().label,psk:'invalid'}}]) {
      expect(projectRecoveryLabel({...response(), ...patch},sheet())).toMatchObject({ready:false,label:null,missing:['invalid_label']});
    }
    for(const s of [undefined,sheet({admin_code_applied_at:null}),sheet({admin_code:'pst_synthetic'}),sheet({}, {can_read_credentials:false}),sheet({}, {device:{id:'other',serial:'PS-ABCDEFGH',status:'assigned'}}),sheet({psk:'9876543210'})]) {
      expect(projectRecoveryLabel(response(),s)).toMatchObject({ready:false,label:null});
    }
  });
  it('blocks pending code rotations and changes fingerprint on confirmed rotation', () => {
    const old = projectRecoveryLabel(response(),sheet({}, {rotations:[{kind:'admin_code',status:'pending'}]}));
    expect(old.wifiRotationPending).toBe(true);
    const fresh = projectRecoveryLabel(response(),sheet({admin_code:'TEST3-TEST4',admin_code_applied_at:'2026-01-02T00:00:00Z'}));
    expect(labelFingerprint(fresh.label!)).not.toEqual(labelFingerprint(old.label!));
  });
});
