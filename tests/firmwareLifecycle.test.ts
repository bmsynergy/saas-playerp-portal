import {describe,it,expect} from 'vitest';
import {firmwareEditionLink,firmwareRingAvailable,projectFirmwareLifecycle} from '../src/lib/firmwareLifecycle';
import {lifecycle} from './fixtures/pe474';
describe('PE474 strict lifecycle v2 / same signed artifact',()=>{
 it('accepts auto_lab, explicit and legacy; General without ACK preserves identity',()=>{
  const states=[lifecycle(['lab'],0),lifecycle(['lab','canary'],1),lifecycle(['lab','canary','general'],2)];
  for(const raw of states){const p=projectFirmwareLifecycle(raw)!;expect(p).not.toBeNull();expect(p.edition_id).toBe('fixture-edition');expect(p.key_id).toBe('fixture-key');expect(p.signed_at).toBe(states[0].signed_at);expect(p.canary_confirmed_at).toBeNull();}
  expect(projectFirmwareLifecycle(states[1])?.rings.general.can_enable).toBe(true);
  expect(firmwareRingAvailable(projectFirmwareLifecycle(states[2]),'general')).toBe(true);
  expect(projectFirmwareLifecycle({...states[1],configuration:'legacy'})).not.toBeNull();
 });
 it('legacy signed editions without channels remain signed and allow only server-authorized Lab promotion',()=>{
  const p=projectFirmwareLifecycle(lifecycle([],0))!;
  expect(p.edition_status).toBe('signed');expect(p.can_sign).toBe(false);expect(p.next_promotion).toBe('lab');expect(p.rings.lab.can_enable).toBe(true);expect(p.rings.general.enable_block_reason).toBe('canary_required');
 });
 it('rejects an impossible auto_lab configuration but reads legacy rows needing explicit repair',()=>{
  expect(projectFirmwareLifecycle({...lifecycle(['general'],7),configuration:'auto_lab'})).toBeNull();
  expect(projectFirmwareLifecycle({...lifecycle(['general'],0),configuration:'auto_lab'})).toBeNull();
  const legacy=lifecycle(['general'],7);legacy.configuration='legacy';legacy.next_promotion='lab';legacy.rings.lab.can_enable=true;legacy.rings.lab.enable_block_reason=null;expect(projectFirmwareLifecycle(legacy)).not.toBeNull();
 });
 it('does not infer availability from the signature or an ACK',()=>{
  const raw=lifecycle(['lab','canary'],1);raw.rings.canary.available=false;
  expect(firmwareRingAvailable(projectFirmwareLifecycle(raw),'canary')).toBe(false);
  expect(firmwareRingAvailable(projectFirmwareLifecycle({...raw,canary_confirmed_at:'2026-10-18T00:00:00Z'}),'general')).toBe(false);
 });
 it('retired editions retain signature identity and are excluded from new selections',()=>{
  const raw={...lifecycle(['lab','canary'],2),retired_at:'2026-10-18T00:00:00Z',retired_by:'fixture',can_retire:false,retire_block_reason:'edition_retired',next_promotion:null};
  for(const r of Object.values(raw.rings)){r.available=false;r.can_enable=false;r.enable_block_reason='edition_retired';}
  const p=projectFirmwareLifecycle(raw)!;expect(p.edition_id).toBe('fixture-edition');expect(firmwareRingAvailable(p,'canary')).toBe(false);
 });
 it.each([undefined,null,{}, {...lifecycle(),contract_version:1},{...lifecycle(),configuration:'guess'}, {...lifecycle(),revision:-1}, {...lifecycle(),open_targets:undefined}, {...lifecycle(),can_manage:'true'}, {...lifecycle(),technical_class:null}, {...lifecycle(),key_id:null}, {...lifecycle(),next_promotion:'general'}, {...lifecycle(),enabled_rings:['general']}, {...lifecycle(),canary_evidence:{blocking:true}}, {...lifecycle(),rings:{lab:lifecycle().rings.lab}}, {...lifecycle(),rings:{...lifecycle().rings,canary:{...lifecycle().rings.canary,can_enable:'true'}}}])('fails closed on invalid metadata %#',raw=>{
  expect(projectFirmwareLifecycle(raw)).toBeNull();expect(firmwareRingAvailable(projectFirmwareLifecycle(raw),'general')).toBe(false);
 });
 it('drops unknown fields',()=>{expect(projectFirmwareLifecycle({...lifecycle(),secret:'never-cache'})).not.toHaveProperty('secret');});
 it('links by edition identity, not version',()=>{expect(firmwareEditionLink('e','r')).toBe('/admin/print-servers/firmwares?edition=e');expect(firmwareEditionLink(null,'r')).toBe('/admin/print-servers/firmwares?release=r');});
});
