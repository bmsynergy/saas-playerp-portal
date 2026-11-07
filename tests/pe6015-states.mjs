// Extra UI checks on published DEV: real confirmed fixture + synthetic denial of reservation read.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {origin,api,login,launch,context,guard,assertGuard} from './helpers/pe600-readonly.mjs';
const b=await launch(),report={origin,checks:[]};
try{
 const s=await login();
 for(const scenario of ['confirmed','denied-reservation']){
  const ctx=await context(b,s),protection={};const id=scenario==='confirmed'?'cffba313-bd32-4e57-ab2a-0886a6f7070f':'72e06b4f-a63e-49e9-bd06-f02b8a9186a1';
  await guard(ctx,protection,async(route,{u,name})=>{
   if(u.origin===api&&name==='ps_admin_stock_reserved_credentials'){
    if(scenario==='denied-reservation')await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,error:'forbidden'})});else await route.continue();return true;
   }return false;
  });
  const p=await ctx.newPage();await p.goto(origin+'/admin/print-servers/devices/'+id);
  if(scenario==='confirmed'){
   await expect(p.getByTestId('ps-stock-state')).toContainText('Validado en stock',{timeout:30000});await expect(p.getByTestId('ps-stock-get-label')).toBeEnabled();await expect(p.locator('.ps-stock-reserved-value')).toHaveCount(0);await expect(p.getByTestId('ps-stock-email')).toHaveCount(0);
  }else{
   await expect(p.getByTestId('ps-stock-reserved')).toContainText('No se pudieron consultar',{timeout:30000});await expect(p.locator('.ps-stock-reserved-value')).toHaveCount(0);await expect(p.getByTestId('ps-stock-get-label')).toBeDisabled();
  }
  await expect(p.getByTestId('ps-preparation')).toHaveCount(0);assertGuard(protection);report.checks.push({scenario,pass:true,kind:scenario==='confirmed'?'real DEV simulated-device fixture':'synthetic RPC denial on published UI'});await ctx.close();
 }
 for(const role of ['owner_varios','venue_frontdesk']){
  const ctx=await context(b,await login(role)),protection={};await guard(ctx,protection);const p=await ctx.newPage();await p.goto(origin+'/admin/print-servers/devices/72e06b4f-a63e-49e9-bd06-f02b8a9186a1');
  if(role==='owner_varios')await expect.poll(()=>new URL(p.url()).pathname,{timeout:30000}).toBe('/');else await expect(p.getByRole('heading',{name:'Acceso denegado'})).toBeVisible({timeout:30000});await expect(p.getByTestId('ps-stock')).toHaveCount(0);assert(!protection.reads.some(x=>x.startsWith('ps_admin_stock')));report.checks.push({role,adminUiDenied:true,result:role==='owner_varios'?'redirect to owner home':'access denied',reservationsAbsent:true});await ctx.close();
 }
 report.pass=true;
}finally{await b.close();await writeFile('docs/evidence/pe6015/states.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
