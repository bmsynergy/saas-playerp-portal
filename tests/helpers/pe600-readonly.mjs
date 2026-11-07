import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
export const origin='https://playerp.dev.bmore.app';
export const api='https://fzwzmwstxlsxdzdmphyq.supabase.co';
export const realId='59a41440-8536-4045-aed1-3fcc5adaf193';
export const qaId='82cfc31c-2044-48ff-a9c1-f7772be7e346';
export const out='docs/evidence/pe600';
export async function login(account='staff_activo'){
 const key=(await readFile('build/dev-defaults.ts','utf8')).match(/SUPABASE_PUBLIC_KEY = "([^"]+)/)[1];
 const accounts=JSON.parse(await readFile('/home/coredev/.coredeva-private/pe321-portal-dev/cuentas.json','utf8'));
 const r=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:accounts[account].email,password:accounts[account].password})});assert.equal(r.status,200,'QA login');return r.json();
}
export async function launch(){return chromium.launch({headless:true,executablePath:'/home/coredev/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});}
export async function context(browser,session,width=1440,locale='es'){
 const ctx=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,serviceWorkers:'block'});
 await ctx.addInitScript(({s,locale})=>{localStorage.setItem('playerp.portal.dev.auth',JSON.stringify(s));localStorage.setItem('playerp.locale',locale);},{s:session,locale});return ctx;
}
const reads=new Set(['is_platform_staff','portal_tenant_directory','portal_tenant_detail','ps_panel_recovery_label','ps_panel_printer_jobs','ps_panel_devices','support_venue_counts','ps_panel_ota','portal_access','portal_profile','portal_staff_context','portal_me','portal_directory','portal_tenant','portal_owner_venues','ps_device_resolve','ps_admin_stock_status','ps_admin_stock_label','ps_admin_device_detail','ps_admin_device_sheet','ps_device_link_status','ps_panel_state','ps_panel_device','ps_admin_legacy_credentials_context','ps_firmware_list','portal_ps_devices','portal_ps_inventory','portal_ps_fleet','ps_admin_venue_search']);
// Fail closed. kit_download is NOT a read: it writes admin_audit_log.
export async function guard(ctx,report,synthetic){
 report.blocked=[];report.mutations=0;report.reads=[];
 await ctx.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());let body;try{body=req.postDataJSON();}catch{}
  const name=u.pathname.split('/').at(-1);
  if(synthetic&&await synthetic(route,{req,u,body,name}))return;
  const safeStatic=u.origin===origin&&['GET','HEAD'].includes(req.method());
  const safeFont=['https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(u.origin)&&req.method()==='GET';
  const safeProfile=u.origin===api&&u.pathname==='/rest/v1/staff_profiles'&&req.method()==='GET';
  const safeAuth=u.origin===api&&u.pathname.startsWith('/auth/v1/')&&(['GET','HEAD'].includes(req.method())||(u.pathname.endsWith('/token')&&u.searchParams.get('grant_type')==='refresh_token'));
  const safeRpc=u.origin===api&&u.pathname.startsWith('/rest/v1/rpc/')&&reads.has(name)&&req.method()==='POST';
  const safeKit=u.origin===api&&u.pathname==='/functions/v1/ps-firmware-admin'&&body?.action==='kit_list';
  if(safeFont||safeProfile||safeStatic||safeAuth||safeRpc||safeKit){if(safeRpc||safeKit)report.reads.push(name+(body?.action?':'+body.action:''));return route.continue();}
  report.blocked.push({method:req.method(),path:u.pathname,action:body?.action});await route.abort('blockedbyclient');
 });
}
export function assertGuard(report){assert.deepEqual(report.blocked,[],'guard blocked unexpected request');assert.equal(report.mutations,0);}
