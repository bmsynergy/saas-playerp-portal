// Read-only contract snapshot. Never saves credentials or Auth responses.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const config=await readFile('src/lib/config.ts','utf8');
const url=config.match(/SUPABASE_URL = "([^"]+)"/)[1], key=config.match(/SUPABASE_PUBLIC_KEY = "([^"]+)"/)[1];
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES}/cuentas.json`,'utf8'));
const out=process.env.LIVE_OUTPUT_DIR; if(!out)throw Error('LIVE_OUTPUT_DIR required'); await mkdir(out,{recursive:true});
const profile=accounts.staff_activo;
const auth=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:profile.email,password:profile.password})});
const session=await auth.json(); if(!session.access_token)throw Error(`Auth ${auth.status}`);
const reads=[['ps_firmware_page',{p_limit:25,p_offset:0}],['ps_ota_channels_page',{p_limit:25,p_offset:0}],['ps_ota_admin_overview',{p_include_audit:false}],['ps_admin_device_detail',{p_device_id:'59a41440-8536-4045-aed1-3fcc5adaf193'}]];
const report=[];
for(const [rpc,params] of reads){const response=await fetch(`${url}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(params)});const data=await response.json();await writeFile(`${out}/read-${rpc}.json`,JSON.stringify(data,null,2));report.push({rpc,params,status:response.status,keys:Object.keys(data)});}
console.log(JSON.stringify(report,null,2));
