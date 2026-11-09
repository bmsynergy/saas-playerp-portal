import { describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }));
import { saveAssignment } from '../src/lib/psAssignment';
import { projectPsLink } from '../src/lib/psLink';
import { addPrinter, projectScan, RegisteredPrinterError, projectRegisteredPrinter } from '../src/lib/printServerApi';

describe('PE-602 successful assignment is independent from refresh', () => {
  it('reproduces the former contradictory green+red, then keeps only success and a read warning; retry only reads', async () => {
    const assign = vi.fn().mockResolvedValue({ rev: 2 });
    const refresh = vi.fn().mockRejectedValue(new Error('network'));
    let green = false, red = false;
    try { await assign(); green = true; await refresh(); } catch { red = true; }
    expect({ green, red }).toEqual({ green: true, red: true });
    assign.mockClear(); refresh.mockClear(); red = false; green = false;
    const result = await saveAssignment(assign, () => { green = true; }, refresh).catch(() => { red = true; });
    expect({ green, red, result }).toEqual({ green: true, red: false, result: { readFailed: true } });
    refresh.mockResolvedValue(undefined); await refresh();
    expect(assign).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledTimes(2);
  });
  it('does not hide a failed mutation or report success', async () => {
    const saved = vi.fn(), refresh = vi.fn();
    await expect(saveAssignment(() => Promise.reject(new Error('forbidden')), saved, refresh)).rejects.toThrow('forbidden');
    expect(saved).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
  it('requires matching acknowledgement, including old DTOs without sync', () => {
    const l = { device_id:'fixture', venue_id:'venue', state:'sincronizado', rev:2, ack_rev:1, ack_at:'2026-01-01' };
    expect(projectPsLink(l)?.state).toBe('asignado_pendiente_sync');
    expect(projectPsLink({...l, ack_rev:2})?.state).toBe('sincronizado');
    expect(projectPsLink({...l, ack_rev:2, sync:{scope:'venue',rev:2,ack_rev:1,ack_at:'2026-01-01',confirmed:true}})?.state).toBe('asignado_pendiente_sync');
  });
});
describe('PE-602 authorized duplicate details', () => {
  const existing = { printer_id:'printer',printer_label:'Kitchen',venue_id:'venue',venue_name:'Park',print_server_id:null,print_server_label:null };
  it('keeps separate scope and authorized data, including cross-venue and no PS; drops secrets', () => {
    expect(projectRegisteredPrinter({scope:'other_venue',existing:{...existing,token:'pst_secret'},token:'private'})).toEqual({scope:'other_venue',existing});
    expect(projectRegisteredPrinter({scope:'other_venue',printer_id:'hidden'})).toEqual({scope:'other_venue'});
    expect(projectRegisteredPrinter({scope:'unexpected',existing:{printer_label:'partial'}})).toEqual({});
  });
  it('preserves duplicate info from failed add and excludes arbitrary backend fields', async () => {
    rpc.mockResolvedValue({data:{ok:false,error:'mac_already_registered',scope:'other_ps',existing},error:null});
    const error = await addPrinter('venue',{label:'New',mac_address:'aa-bb-cc-dd-ee-ff',model:'',location:''},'ps').catch(e => e);
    expect(error).toBeInstanceOf(RegisteredPrinterError); expect(error.scope).toBe('other_ps'); expect(error.existing).toEqual(existing);
  });
  it('preserves registered scan status and authorized details without inventing them', () => {
    const scan = projectScan({command_id:'scan',status:'completed',result:{candidates:[{scope:'other_venue',registered_elsewhere:true},{scope:'other_ps',existing}]}})!;
    expect(scan.result?.candidates[0]).toMatchObject({scope:'other_venue',registered_elsewhere:true});
    expect(scan.result?.candidates[0].existing).toBeUndefined();
    expect(scan.result?.candidates[1].existing?.print_server_id).toBeNull();
  });
});

describe('PE-602 label credential boundary', () => {
  it('escapes every reserved Wi-Fi character independently in SSID and password', async () => {
    const { wifiQrPayload } = await import('../src/lib/psDevice');
    expect(wifiQrPayload('a;,:"\\', 'b;,:"\\')).toBe('WIFI:T:WPA;S:a\\;\\,\\:\\"\\\\;P:b\\;\\,\\:\\"\\\\;;');
  });
  it('requires applied confirmation or successful stock RPC confirmation; refuses technical material', async () => {
    const { labelFilename } = await import('../src/lib/psLabel');
    const d = { deviceId:'fixture', serial:'PS-TEST602A', ssid:'Test WiFi', password:'0123456789', appliedAt:null, adminCode:'TEST1-TEST2', adminCodeAppliedAt:null };
    expect(() => labelFilename(d)).toThrow('label_unavailable');
    expect(labelFilename({...d, confirmation:'stock_rpc'})).toBe('PS-TEST602A-50x30mm.png');
    for (const ssid of ['pse_test','pst_test','PRIVATE KEY']) expect(() => labelFilename({...d, ssid, confirmation:'stock_rpc'})).toThrow();
  });
});
