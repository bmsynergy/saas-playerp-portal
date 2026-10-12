import type { OtaEvent } from './ota';
// Read-time presentation only: retain the exact detail for the diagnostic disclosure.
export function eventDetail(detail: string | null): { human: string | null; technical: boolean } {
  if (!detail) return {human:null,technical:false};
  try {
    const parsed: unknown = JSON.parse(detail);
    if (parsed && typeof parsed === 'object') {
      const r = parsed as Record<string,unknown>;
      const messages = ['message','error','error_detail','reason'].map(k=>r[k]).filter((v):v is string=>typeof v==='string'&&!!v.trim());
      return {human:messages.join(' — ')||null,technical:true};
    }
  } catch { /* Ordinary device text is useful; show it without parsing. */ }
  return {human:detail,technical:false};
}
export function eventPhase(t:(key:string)=>string,phase:OtaEvent['phase']) {
  if (!phase) return t('notProvided');
  const key=`ota.phase.${phase}`,label=t(key);
  return label===key ? `${t('list.unknownPhase')}: ${phase}` : label;
}

export function auditFacts(metadata:string|null) {
  let value:Record<string,unknown>={};
  try {const parsed=metadata?JSON.parse(metadata):null;if(parsed&&typeof parsed==='object')value=parsed;}catch{/* retained under diagnostics */}
  const text=(key:string)=>typeof value[key]==='string'?value[key] as string:null;
  return {version:text('version'),group:text('group_name')??text('name'),ring:text('ring'),status:text('status'),
    error:[text('error_code'),text('error_detail'),text('error')].filter(Boolean).join(' — ')};
}
