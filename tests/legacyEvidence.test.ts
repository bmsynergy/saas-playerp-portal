import { beforeEach, describe, expect, it, vi } from 'vitest';
import { X509Certificate, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
import { caEvidenceStatus, getLegacyContext, needsLegacyReconciliation, projectLegacyContext, reconcileLegacy } from '../src/lib/psDevice';
import { en } from '../src/locales/en';
import { es } from '../src/locales/es';
const pem = readFileSync(new URL('./fixtures/legacy-ca.pem', import.meta.url), 'utf8');
const ca = createHash('sha256').update(new X509Certificate(pem).raw).digest('hex');
const raw = () => ({ ok: true, venue_id: 'venue', device_id: 'device', serial: 'PS-TEST', legacy: true, hostname: 'ps-test', print_server_id: 'ps', print_server_status: 'active', ca_der_sha256: ca, wifi_confirmed: false, admin_code_confirmed: false });
const ctx = () => projectLegacyContext(raw());
const wifi = { ssid: 'Test physical Wi-Fi', psk: '0123456789' };
const pair = (s: string) => s.match(/../g)!.join(':');
beforeEach(() => { mocks.rpc.mockReset(); mocks.rpc.mockImplementation(async (name: string) => ({ data: name.endsWith('_context') ? raw() : { ok: true, applied_at: '2026-01-01T00:00:00Z' } })); });
describe('CA DER evidence and reconciliation boundary', () => {
  for (const n of [12,64]) for (const form of ['lower','upper','pairs','trim']) it(`accepts ${n} ${form}; sends complete CA DER only after live identity check`, async () => {
    const prefix=ca.slice(0,n), evidence=form==='upper'?prefix.toUpperCase():form==='pairs'?pair(prefix):form==='trim'?`  ${pair(prefix.toUpperCase())}  `:prefix;
    await reconcileLegacy(ctx(),'wifi',wifi,true,evidence);
    expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(['ps_admin_legacy_credentials_context','ps_admin_legacy_credentials_reconcile']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('ps_admin_legacy_credentials_reconcile', expect.objectContaining({p_ca_der_sha256:ca,p_values:wifi,p_physical_check:true,p_print_server_id:'ps',p_serial:'PS-TEST'}));
  });
  for (const evidence of ['860C3ADC5BA3115D',ca.slice(0,16),`SHA256 Fingerprint=${ca}`,ca+'!',ca.slice(0,12)+'-',pair(ca).replace(':','::'),ca.slice(0,6)+' '+ca.slice(6,12),'',ca.slice(0,63),':'+pair(ca)]) it(`malformed input gets format, zero RPC (${evidence.slice(0,24)})`,async()=>{
    expect(caEvidenceStatus(evidence,ca)).toBe('format');
    await expect(reconcileLegacy(ctx(),'wifi',wifi,true,evidence)).rejects.toMatchObject({key:'legacy.fingerprintFormat'});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('valid different evidence gets mismatch; PEM hash is not CA DER',async()=>{
    const pemHash=createHash('sha256').update(pem).digest('hex');
    for(const evidence of ['0'.repeat(12),'0'.repeat(64),pemHash]) {
      expect(caEvidenceStatus(evidence,ca)).toBe('mismatch');
      await expect(reconcileLegacy(ctx(),'wifi',wifi,true,evidence)).rejects.toMatchObject({key:'legacy.fingerprintMismatch'});
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires physical check and valid values with zero RPC',async()=>{
    await expect(reconcileLegacy(ctx(),'wifi',wifi,false,ca)).rejects.toMatchObject({key:'legacy.error.physical_check_required'});
    await expect(reconcileLegacy(ctx(),'wifi',{ssid:'Test',psk:'short'},true,ca)).rejects.toMatchObject({key:'legacy.error.invalid_value'});
    await expect(reconcileLegacy(ctx(),'admin_code',{admin_code:'invalid'},true,ca)).rejects.toMatchObject({key:'legacy.error.invalid_value'});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  for(const changed of [{device_id:'other'},{serial:'other'},{print_server_id:'other'},{venue_id:'other'},{ca_der_sha256:'0'.repeat(64)},{legacy:false},{wifi_confirmed:true},{print_server_status:'revoked'}]) it(`live identity/state changed ${Object.keys(changed)[0]}: no mutation`,async()=>{
    mocks.rpc.mockResolvedValue({data:{...raw(),...changed}});
    await expect(reconcileLegacy(ctx(),'wifi',wifi,true,ca)).rejects.toThrow();
    expect(mocks.rpc.mock.calls.map(c=>c[0])).toEqual(['ps_admin_legacy_credentials_context']);
  });
  it('permission refusal never mutates',async()=>{
    mocks.rpc.mockResolvedValue({error:{code:'42501'}});
    await expect(reconcileLegacy(ctx(),'wifi',wifi,true,ca)).rejects.toMatchObject({code:'42501'});
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('confirmed Wi-Fi does not block independent code; hiding needs both confirmed or nonlegacy',async()=>{
    const rawCode={...raw(),wifi_confirmed:true};mocks.rpc.mockResolvedValueOnce({data:rawCode}).mockResolvedValueOnce({data:{ok:true}});
    await reconcileLegacy(projectLegacyContext(rawCode),'admin_code',{admin_code:'ABCD234567'},true,ca.slice(0,12));
    expect(mocks.rpc).toHaveBeenLastCalledWith('ps_admin_legacy_credentials_reconcile',expect.objectContaining({p_kind:'admin_code',p_values:{admin_code:'ABCD234567'}}));
    expect(needsLegacyReconciliation(projectLegacyContext(rawCode))).toBe(true);
    expect(needsLegacyReconciliation(projectLegacyContext({...rawCode,admin_code_confirmed:true}))).toBe(false);
    expect(needsLegacyReconciliation(projectLegacyContext({...raw(),legacy:false}))).toBe(false);
  });
  it('keeps EN/ES format guidance distinct from mismatch',()=>{
    for(const locale of [en,es]) {
      expect(locale['legacy.fingerprintFormat']).toMatch(/12/);expect(locale['legacy.fingerprintFormat']).toMatch(/64/);
      expect(locale['legacy.fingerprintHelp']).toMatch(/OpenSSL/);expect(locale['legacy.fingerprintFormat']).not.toEqual(locale['legacy.fingerprintMismatch']);
    }
  });
  it('projects only explicit CA metadata and refuses leaf fallback',()=>{
    expect(projectLegacyContext({...raw(),ca_der_sha256:null,cert_der_sha256:ca}).ca_cert_der_sha256).toBeNull();
    expect(projectLegacyContext({...raw(),ca_der_sha256:ca+'!'}).ca_cert_der_sha256).toBeNull();
  });
});
