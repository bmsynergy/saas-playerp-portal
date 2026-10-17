import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
const config=await readFile(new URL('../src/lib/config.ts',import.meta.url),'utf8');
export const key=config.match(/SUPABASE_PUBLIC_KEY\s*=\s*["']([^"']+)["']/)[1];
const accounts=JSON.parse(await readFile(`${process.env.PORTAL_DEV_FIXTURES??'/home/coredev/.coredeva-private/pe321-portal-dev'}/cuentas.json`,'utf8'));
export async function login(profile){const a=accounts[profile];const r=await fetch(`${api}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})});assert.equal(r.status,200);return r.json();}
export async function rpc(s,name,args={}){const r=await fetch(`${api}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${s.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});assert.equal(r.status,200,name);return r.json();}
