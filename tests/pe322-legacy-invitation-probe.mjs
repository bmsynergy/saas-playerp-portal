// DEV-only regression probe. Reproduces the inactive legacy membership case
// without altering any existing user, membership, function or policy.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const api='https://fzwzmwstxlsxdzdmphyq.supabase.co',mgmt='https://api.supabase.com/v1/projects/fzwzmwstxlsxdzdmphyq';
const pat=process.env.SUPABASE_ACCESS_TOKEN;assert(pat);
let id,token,anon,service;
const out='docs/evidence/pe322/legacy-invitation-probe.json';
const report={project:'fzwzmwstxlsxdzdmphyq',startedAt:new Date().toISOString(),temporaryIdentityOnly:true};
async function req(url,body,authorization,key,method='POST'){
 const response=await fetch(url,{method,headers:{'Content-Type':'application/json',...(authorization?{Authorization:`Bearer ${authorization}`} : {}),...(key?{apikey:key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}return {status:response.status,data};
}
async function sql(query){const r=await req(mgmt+'/database/query',{query},pat);assert.equal(r.status,201);return r.data;}
try{
 const keys=await req(mgmt+'/api-keys?reveal=true',undefined,pat,null,'GET');assert.equal(keys.status,200);
 anon=keys.data.find(k=>k.name==='anon').api_key;service=keys.data.find(k=>k.name==='service_role').api_key;
 const password='Pe322!'+randomBytes(20).toString('hex'),email=`delivered+pe322legacy-${Date.now()}@resend.dev`;
 const user=await req(api+'/auth/v1/admin/users',{email,password,email_confirm:true,app_metadata:{pe322_legacy_probe:true}},service,service);assert([200,201].includes(user.status));id=user.data.id;
 const member=await req(api+'/rest/v1/platform_staff_members',{user_id:id,role:'super_admin',active:false,invited_at:null,accepted_at:null},service,service);assert.equal(member.status,201);
 const login=await req(api+'/auth/v1/token?grant_type=password',{email,password},null,anon);assert.equal(login.status,200);token=login.data.access_token;
 const rpc=(name)=>req(api+'/rest/v1/rpc/'+name,{},token,anon);
 const before=await rpc('is_platform_staff');assert.equal(before.data,false);
 const accept=await rpc('accept_platform_invitation');
 const after=await rpc('is_platform_staff');
 const row=(await sql(`select active,invited_at,accepted_at from public.platform_staff_members where user_id='${id}'`))[0];
 const list=await req(api+'/functions/v1/platform-staff-admin',{action:'list'},token,anon);
 Object.assign(report,{initialMembership:{role:'super_admin',active:false,invited_at:null,accepted_at:null},before:{http:before.status,isPlatformStaff:before.data},acceptance:{http:accept.status,status:accept.data?.status},after:{http:after.status,isPlatformStaff:after.data,active:row.active,invited_at:row.invited_at,accepted_at_present:!!row.accepted_at,staffManagementHttp:list.status},reproduced:accept.status===200&&after.data===true&&row.invited_at===null&&list.status===200});
 assert.equal(report.reproduced,true,'legacy inactive row activated without invitation timestamp');
 console.log(JSON.stringify(report,null,2));
}finally{
 if(token)await req(api+'/auth/v1/logout?scope=local',{},token,anon);
 if(id){await sql(`delete from public.admin_audit_log where actor_user_id='${id}' or target_id='${id}'`);const removed=await req(api+'/auth/v1/admin/users/'+id,undefined,service,service,'DELETE');assert([200,204].includes(removed.status));report.cleanup={testUserRemoved:true,remainingTestMemberships:(await sql(`select count(*)::int as count from public.platform_staff_members where user_id='${id}'`))[0].count};}
 report.finishedAt=new Date().toISOString();await mkdir('docs/evidence/pe322',{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
}
