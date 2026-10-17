// Isolated frontend responses for PE-474; no device, database or physical OTA writes.
export const signedAt='2026-10-17T22:00:00Z';
export function lifecycle(enabled:string[]=['lab'],revision=0) {
  const next=enabled.includes('general')?null:enabled.includes('canary')?'general':enabled.includes('lab')?'canary':'lab';
  return {contract_version:2,edition_id:'fixture-edition',edition_status:'signed',signed_by:'fixture-actor',signed_by_email:'fixture@example.invalid',signed_at:signedAt,key_id:'fixture-key',
    canary_confirmed_at:null,canary_evidence:{confirmed_at:null,committed_canary_targets:0,blocking:false},lab_only:false,
    technical_class:{ring:'general',general_eligible:true,eligibility_reason:'general'},configuration:revision===0&&enabled.length===1?'auto_lab':'explicit',revision,open_targets:0,
    retired_at:null,retired_by:null,enabled_rings:enabled,next_promotion:next,can_sign:false,sign_block_reason:'already_signed',can_manage:true,can_retire:true,retire_block_reason:null,
    rings:Object.fromEntries(['lab','canary','general'].map(r=>[r,{enabled:enabled.includes(r),eligible:true,available:enabled.includes(r),reason:null,can_enable:r===next,enable_block_reason:enabled.includes(r)?'already_enabled':r===next?null:r==='general'?'canary_required':'lab_required'}]))};
}
export function deviceUpdate(version='0.3.10',installed='0.3.9',edition='edition',ring='general') {
  const candidate={edition_id:edition,version,signed_at:signedAt,sha256_short:'a'.repeat(12)};
  return {current_version:installed,current_known:true,latest_stable:{edition_id:edition,version,model:'rpi4-2gb',arch:'arm64',signed_at:signedAt},candidate,
    effective_ring:ring,can_update:true,update_available:true,reason:null as string|null,active_update:null,
    channel:{ring,revision:3,source:'admin',updated_at:signedAt,can_change:true,blocked_reason:null,deployment_groups:[],href:'/admin/print-servers/channels'},
    editions:[{...candidate,enabled_rings:['lab','canary','general'],canary_confirmed_at:null,selectable:true,reason:null}],editions_total:1,editions_limit:20,newer_blocked:null,validation:{required:false}};
}
export function deviceSheet(update:Record<string,unknown>=deviceUpdate()) {
  return {ok:true,device:{id:'device',serial:'PS-FIXTURE',hostname:'fixture',model:'rpi4-2gb',arch:'arm64',status:'assigned',venue_id:'venue',legacy:false},update,delete:{allowed:false,blockers:['assigned']}};
}
export function overview() {return {ok:true,contract_version:2,keys:[],totals:{releases:2000,devices:2000,deployments:1000,open_targets:0,channels:{lab:100,canary:100,general:1800}},groups:[],deployments:[],audit_included:false};}
