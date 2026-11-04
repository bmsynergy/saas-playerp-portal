// Private helper: use the existing controlled DEV fixture; never serialize credentials.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export const api = 'https://fzwzmwstxlsxdzdmphyq.supabase.co';
export async function devSession() {
 const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
 const defaults=await readFile(new URL('../build/dev-defaults.ts',import.meta.url),'utf8');
 const key=defaults.match(/SUPABASE_PUBLIC_KEY\s*=\s*['"]([^'"]+)/)[1];
 const r=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.staff_activo.email,password:accounts.staff_activo.password})});
 assert.equal(r.status,200,'DEV fixture login');const session=await r.json();
 async function rpc(name,body={}) {
  const r=await fetch(`${api}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(r.status,200,`RPC ${name}`);return r.json();
 }
 return {session,rpc};
}
