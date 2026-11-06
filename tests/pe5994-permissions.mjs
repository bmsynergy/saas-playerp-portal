// Resume only the final read/denial checks; never repeat create, enroll or email send.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const key=(await readFile('build/dev-defaults.ts','utf8')).match(/SUPABASE_PUBLIC_KEY = "([^"]+)/)[1];
const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
const out='docs/evidence/pe5994',report=JSON.parse(await readFile(out+'/live.json','utf8'));
const a=accounts.owner_varios;
const lr=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})});
assert.equal(lr.status,200);const session=await lr.json();
try {
 const checks=[];
 for(const name of ['ps_admin_stock_status','ps_admin_stock_label']){
  const r=await fetch(api+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_device_id:report.deviceId})});const data=await r.json();assert(r.status===403||data.error==='forbidden');checks.push({action:name,http:r.status,error:data.error});
 }
 const denied=await fetch(api+'/functions/v1/ps-firmware-admin',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'delivery_email',id:report.deviceId,to:'delivered+pe5994-portal@resend.dev'})});assert.equal(denied.status,403);checks.push({action:'delivery_email preview',http:403});
 await writeFile(out+'/live-first.json',JSON.stringify(report,null,2));
 report.firstRunNote='UI workflow completed. Final permission check could not log in owner_uno (HTTP 400). Only permission checks resumed using existing owner_varios QA account; no admin operation or email repeated.';
 report.checks.push({name:'Server rejects tenant owner for stock state, label and delivery email',checks});delete report.failure;report.pass=true;report.completed=new Date().toISOString();
 await writeFile(out+'/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,checks}));
}finally{await fetch(api+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token}});}
