import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {login,api} from './helpers/pe600-readonly.mjs';
const s=await login(),key=(await readFile('build/dev-defaults.ts','utf8')).match(/SUPABASE_PUBLIC_KEY = "([^"]+)/)[1];
try{
 const r=await fetch(api+'/functions/v1/ps-firmware-admin',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'kit_download',id:'b1cb8a2f-53bf-48c0-9df4-e43516bd5917'})});assert.equal(r.status,200);const d=await r.json();assert(d.url);
 const response=await fetch(d.url);assert.equal(response.status,200);const hash=createHash('sha256');let bytes=0;for await(const chunk of response.body){hash.update(chunk);bytes+=chunk.length;}
 const sha256=hash.digest('hex');assert.equal(sha256,'e4f702c8d57c656e1e6195bfcc45fbc889f1192c12da6dbf85dd3074d4381e0e');assert.equal(bytes,615589060);
 const report={at:new Date().toISOString(),filename:d.filename,sha256,bytes,downloadedBytesVerified:true,hardwareValidated:false};await writeFile('docs/evidence/pe6015/image.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+s.access_token}});}
