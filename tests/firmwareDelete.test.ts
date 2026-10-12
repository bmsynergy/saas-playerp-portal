import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const getSession=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/supabase',()=>({supabase:{auth:{getSession}}}));
import {deleteFirmware} from '../src/lib/firmware';
import {SUPABASE_URL} from '../src/lib/config';
const fetchMock=vi.fn();
beforeEach(()=>{getSession.mockResolvedValue({data:{session:{access_token:'test-session'}}});vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
describe('Firmware deletion via the authorized backend',()=>{
 it('uses the session and real delete action; preserves partial storage cleanup result',async()=>{
  for(const removed of [true,false]){
   fetchMock.mockResolvedValueOnce(response({ok:true,deleted:{id:'firmware-id'},file_removed:removed}));
   expect(await deleteFirmware('firmware-id')).toEqual({fileRemoved:removed});
   expect(fetchMock).toHaveBeenLastCalledWith(`${SUPABASE_URL}/functions/v1/ps-firmware-admin`,expect.objectContaining({method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({action:'delete',id:'firmware-id'})}));
  }
 });
 it.each([[409,'installed','fw.error.deleteInstalled'],[409,'deployment_in_progress','fw.error.deleteInProgress'],[404,'not_found','fw.error.deleteNotFound'],[400,'bad_id','fw.error.deleteInvalid'],[401,'unauthorized','sessionExpired'],[403,'forbidden','accessDenied']])('surfaces HTTP %i %s',async(status,code,key)=>{
  fetchMock.mockResolvedValueOnce(response({ok:false,error:code},Number(status)));
  await expect(deleteFirmware('firmware-id')).rejects.toThrow(String(key));
 });
 it('refuses a malformed success response and an HTTP error disguised as success',async()=>{
  fetchMock.mockResolvedValueOnce(response({ok:true,deleted:{id:'other'},file_removed:true}));
  await expect(deleteFirmware('firmware-id')).rejects.toThrow('genericError');
  fetchMock.mockResolvedValueOnce(response({ok:true,deleted:{id:'firmware-id'},file_removed:true},500));
  await expect(deleteFirmware('firmware-id')).rejects.toThrow('genericError');
 });
 it('does not send without a session and surfaces network failure',async()=>{
  getSession.mockResolvedValueOnce({data:{session:null}});const before=fetchMock.mock.calls.length;
  await expect(deleteFirmware('firmware-id')).rejects.toThrow('sessionExpired');expect(fetchMock.mock.calls.length).toBe(before);
  fetchMock.mockRejectedValueOnce(new TypeError('Network failure'));
  await expect(deleteFirmware('firmware-id')).rejects.toThrow('networkError');
 });
});
