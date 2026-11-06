import { describe,it,expect,vi } from 'vitest';
vi.mock('../src/lib/supabase',()=>({supabase:{}}));
import { projectStockStatus,verifyStockFile } from '../src/lib/psStock';
import { createHash } from 'node:crypto';
describe('PE-599.4 stock download boundary',()=>{
 const content='{"individual":"á","enrollment":{"code":"synthetic"}}\n';
 const file={device_id:'device-a',filename:'playerp-device.json',content,sha256:createHash('sha256').update(content).digest('hex'),bytes:Buffer.byteLength(content)};
 it('keeps exact UTF-8 bytes, including final newline',async()=>{expect(new TextDecoder().decode(await verifyStockFile(file,'device-a'))).toBe(content);});
 it('rejects another device, altered content and incorrect byte count',async()=>{
  await expect(verifyStockFile(file,'device-b')).rejects.toThrow();
  await expect(verifyStockFile({...file,content:content.trim()},'device-a')).rejects.toThrow();
  await expect(verifyStockFile({...file,bytes:content.length},'device-a')).rejects.toThrow();
 });
 it('does not infer validation from issued file or credential presence',()=>{
  const data={ok:true,device_id:'device-a',serial:'PS-A',stock:{state:'enrolled_pending_confirmation',label_ready:false,reported:{},missing:['credentials_ack'],checks:{enrolled:true},credential:{permanent:true}}};
  const result=projectStockStatus(data,'device-a');expect(result.stock.label_ready).toBe(false);expect(result.stock.state).toBe('enrolled_pending_confirmation');
  expect(()=>projectStockStatus({...data,device_id:'device-b'},'device-a')).toThrow();
 });
});
