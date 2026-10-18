import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination } from '../components/PrintListPagination';
import { Link } from 'react-router-dom';
import { useOtaPage } from '../lib/useOtaPage';
import { eventDetail, eventPhase, auditFacts } from '../lib/otaPresentation';
import { AlertTriangle, Check, ChevronDown, Copy, Plus, RefreshCw, Rocket, Users } from 'lucide-react';
import { createGroup, deployEdition, OtaActionError, RINGS, statusClass, type OtaOverview, type OtaTarget, type OtaPageKind, type Ring } from '../lib/ota';
import { firmwareEditionLink, type FirmwareLifecycle } from '../lib/firmwareLifecycle';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';
import { PrintServersTabs } from './PrintFirmwaresPage';

// Deployment, progress and history only. Firmware signing and channel management have their own screens.
type Props = { data: OtaOverview; refreshing: boolean; onRefresh: () => Promise<unknown> };
type Result = { ok: boolean; text: string; devices?: OtaActionError['devices'] };
const MODELS: Record<string, string> = { 'rpi4-2gb': 'Raspberry Pi 4 2GB' };
const fill = (text: string, values: Record<string, string | number>) => Object.entries(values).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), text);
const keyShort = (key: string | null) => key ? `${key.slice(0, 4)}…` : '—';
function useLabels() {
  const { t, locale } = useLocale();
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
    const label = (prefix: string, value: string | null) => { if (!value) return t('notProvided'); const k = `${prefix}.${value}`; const out = t(k); return out === k ? value : out; };
    return {
      t, locale,
      date: (v: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? `${f.format(d)} UTC` : t('notProvided'); },
      status: (v: string) => label('ota.status', v),
      phase: (v: string | null) => eventPhase(t,v),
      ring: (v: string | null) => label('ota.ring', v),
    };
  }, [t, locale]);
}

function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const { status: label } = useLabels();
  return <span className={`server-status ${statusClass(status)}`} data-testid={testId} data-status={status}><span className="badge-dot"/>{label(status)}</span>;
}
function Progress({ value }: { value: number | null }) {
  const { t } = useLocale();
  if (value === null) return <span className="staff-self-note">{t('notProvided')}</span>;
  return <span className="ota-progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={t('list.generalProgress')}><span className="ota-progress-bar"><span style={{ width: `${value}%` }}/></span><small>{value}%</small></span>;
}
function TargetError({ target }: { target: OtaTarget }) {
  const { t } = useLocale();
  if (!target.error_code && !target.error_detail) return <span className="staff-self-note">{t('ps.none')}</span>;
  return <span className="fw-cell ps-error-text">{target.status === 'rolled_back' && <strong>{t('ota.restoredBecause')}</strong>}{target.error_code && <span className="ps-mono">{target.error_code}</span>}{target.error_detail && <small className="ps-sub">{target.error_detail}</small>}</span>;
}

const OTA_STATUSES = ['pending','in_progress','committed','rolled_back','failed','rejected','expired','cancelled','superseded'];
function ReadState({ state }: {state:ReturnType<typeof useOtaPage>}) {
  const {t}=useLocale();
  if(!state.started)return <p role="status" className="inline-empty" data-testid="ota-audit-start">{t('ota.auditStart')}</p>;
  if(!state.valid)return null;
  if(state.query.isError)return <div role="alert" className="form-error">{t(psErrorKey(state.query.error))}<button type="button" className="button button-secondary" onClick={()=>void state.query.refetch()}>{t('refresh')}</button></div>;
  if(state.query.isPending)return <p role="status" className="inline-empty">{t('dev.loading')}</p>;
  if(!state.query.data?.items.length)return <div className="inline-empty">{t('list.noMatches')}</div>;
  return null;
}
function PageFilters({state,id,dateLabel,kind}:{state:ReturnType<typeof useOtaPage>;id:string;dateLabel:string;kind:OtaPageKind}) {
  const {t,status,ring}=useLabels();
  return <><AdminListFilters id={id} filters={state.filters} set={state.set} clear={state.clear} dateLabel={dateLabel} statusLabel={kind==='audit'?t('list.action'):kind==='deployments'?t('list.targetStatus'):undefined}
    statuses={(kind==='audit'?['ps_ota_edition_signed','ps_ota_deployed','ps_ota_group_created','ps_ota_group_members_set']:OTA_STATUSES).map(value=>({value,label:kind==='audit'?auditLabel(t,value):status(value)}))}/>
    {kind==='audit'&&<div className="ota-audit-actions"><button type="button" className="button button-primary" disabled={!state.valid || state.query.isFetching} onClick={state.search} data-testid="ota-audit-search">{t('ota.auditSearch')}</button></div>}
    {kind==='deployments'&&<label className="ota-extra-filter"><span>{t('ota.ring')}</span><select data-testid={`${id}-ring`} value={state.filters.ring??''} onChange={e=>state.set('ring',e.target.value)}><option value="">{t('list.allStates')}</option>{RINGS.map(r=><option key={r} value={r}>{ring(r)}</option>)}</select></label>}
    {kind==='events'&&<label className="ota-extra-filter"><span>{t('ota.phase')}</span><input data-testid={`${id}-phase`} value={state.filters.phase??''} onChange={e=>state.set('phase',e.target.value)}/></label>}
    <ReadState state={state}/></>;
}
function Diagnostics({id,value}:{id:string;value:unknown}) {
  const {t}=useLocale();
  const [copyState,setCopyState]=useState<'idle'|'success'|'error'>('idle');
  const content=typeof value==='string'?value:JSON.stringify(value,null,2);
  const copy=async()=>{try{await navigator.clipboard.writeText(content);setCopyState('success');}catch{setCopyState('error');}};
  // This component is mounted only in the platform-admin OTA route. The read RPCs
  // enforce that role too; never used in the owner/venue panel.
  return <details id={`diagnostic-${id}`} className="ota-diagnostic" onToggle={()=>setCopyState('idle')}><summary>{t('list.diagnostics')}</summary><div className="ota-diagnostic-actions"><button type="button" className="button button-secondary" onClick={()=>void copy()}><Copy size={14}/>{t('list.copyDiagnostics')}</button><span role="status" aria-live="polite">{copyState==='success'?t('dev.copied'):copyState==='error'?t('dev.copyFailed'):''}</span></div><pre>{content}</pre></details>;
}
function auditLabel(t:(key:string)=>string,action:string) {
  const key=`ota.auditAction.${action}`,label=t(key);
  return label===key?`${t('ota.auditTitle')}: ${action}`:label;
}
function Events({ target }: { target: OtaTarget }) {
  const l=useLabels(),{t}=l;
  const targetId=target.id;
  const state=useOtaPage('events',targetId), query=state.query;
  const events=[...(query.data?.items??[])].sort((a,b)=>(Date.parse(a.created_at??'')||0)-(Date.parse(b.created_at??'')||0));
  return <div>
    {query.isError ? <div role="alert" className="form-error">{t(psErrorKey(query.error))}<button type="button" className="button button-secondary" onClick={()=>void query.refetch()}>{t('refresh')}</button></div>
      : query.isPending ? <p role="status" className="inline-empty">{t('dev.loading')}</p>
      : (events.length ? <><ol className="ota-events" data-testid={`ota-events-${targetId}`}>{events.map(e=>{
        const detail=eventDetail(e.detail);
        return <li key={e.id}>
          <time dateTime={e.created_at??undefined}>{l.date(e.created_at)}</time>
          <span><strong>{l.phase(e.phase)}</strong> · {t('list.eventVersion')}: {target.desired_version??t('notProvided')} · {t('list.eventResult')}: {e.status?l.status(e.status):t('notProvided')}{e.progress!==null&&<> · {t('list.generalProgress')}: {e.progress}%</>}</span>
          {(e.error_code||e.error_detail)&&<span className="ps-error-text">{[e.error_code,e.error_detail].filter(Boolean).join(' — ')}</span>}
          {detail.human&&<span className="ps-sub">{detail.human}</span>}
          <Diagnostics id={`event-${e.id}`} value={e}/>
        </li>;
      })}</ol><PrintListPagination id={`events-${targetId}`} pagination={state.pagination} disabled={query.isFetching}/></> : <div className="inline-empty">{t('list.noMatches')}</div>)}
  </div>;
}

function TargetRow({ target }: { target: OtaTarget }) {
  const l = useLabels(); const { t } = l;
  const [open, setOpen] = useState(false);
  const host = target.hostname;
  return <>
    <tr data-testid={`ota-target-${target.id}`} data-status={target.status}>
      <td data-label={t('inv.venue')}>{target.venue_name ?? t('inv.unassigned')}</td>
      <td data-label={t('ps.hostname')}><span className="fw-cell"><strong>{host ?? t('notProvided')}</strong></span></td>
      <td data-label={t('ota.installed')}>{target.installed_version ?? t('notProvided')}</td>
      <td data-label={t('ota.desired')}>{target.edition_id ? <Link className="staff-action-link" to={`${firmwareEditionLink(target.edition_id)}&q=${encodeURIComponent(target.desired_version??'')}`} data-testid={`ota-target-firmware-${target.id}`}>{target.desired_version ?? t('fw.lifecycle.openEdition')}</Link> : target.desired_version ?? t('notProvided')}</td>
      <td data-label={t('state')}><StatusBadge status={target.status} testId={`ota-status-${target.id}`}/></td>
      <td data-label={t('ota.phase')}><span className="fw-cell">{l.phase(target.phase)}<small className="ps-sub">{l.date(target.updated_at??target.issued_at)}</small></span></td>
      <td data-label={t('list.generalProgress')}><Progress value={target.progress}/></td>
      <td data-label={t('ota.error')}><TargetError target={target}/></td>
      <td data-label={t('ota.events')}><button type="button" className="staff-action-link" aria-expanded={open} data-testid={`ota-events-toggle-${target.id}`} onClick={() => setOpen(v => !v)}><ChevronDown size={14}/>{t('ota.events')}</button></td>
    </tr>
    {open && <tr className="ota-events-row"><td colSpan={9}><Events target={target}/></td></tr>}
  </>;
}
function TargetHead() {
  const { t } = useLocale();
  return <thead><tr><th scope="col">{t('inv.venue')}</th><th scope="col">{t('ps.hostname')}</th><th scope="col">{t('ota.installed')}</th><th scope="col">{t('ota.desired')}</th><th scope="col">{t('state')}</th><th scope="col">{t('ota.phase')}</th><th scope="col">{t('list.generalProgress')}</th><th scope="col">{t('ota.error')}</th><th scope="col">{t('ota.events')}</th></tr></thead>;
}

function DeploymentTargets({deploymentId}:{deploymentId:string}) {
  const state=useOtaPage('targets',deploymentId),{t}=useLocale();
  return <div><ReadState state={state}/>
    {state.valid&&!state.query.isError&&state.query.data&&<><div className="table-scroll"><table className="servers-table fw-table ota-table"><TargetHead/><tbody>{state.query.data.items.map(target=><TargetRow key={target.id} target={target}/>)}</tbody></table></div><PrintListPagination id={`targets-${deploymentId}`} pagination={state.pagination}/></>}
  </div>;
}
function Deployment({item}:{item:import('../lib/ota').OtaDeploymentItem}) {
  const l=useLabels();const active = Object.entries(item.target_by_status).some(([status, count]) => count > 0 && ['pending', 'in_progress', 'queued', 'running', 'installing', 'verifying'].includes(status));
  const [open,setOpen]=useState(active);
  useEffect(() => { setOpen(active); }, [active]);
  const completed = item.target_by_status.committed ?? 0;
  const progress = item.target_count ? Math.round(completed / item.target_count * 100) : 0;
  return <details open={open} className="ota-deployment" data-testid={`ota-deployment-${item.id}`} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary><span className="fw-cell"><strong>{item.version??l.t('notProvided')} · {l.ring(item.ring)}{item.group_name?` · ${item.group_name}`:''}</strong><small className="ps-sub">{l.date(item.created_at)} · {fill(l.t('ota.targetsCount'),{n:item.target_count})}</small><span className="ota-deployment-stats"><span className="ota-deployment-count">{l.t('adminDevice.completedCount').replace('{done}', String(completed)).replace('{total}', String(item.target_count))} · {progress}%</span>{Object.entries(item.target_by_status).filter(([,n])=>n>0).map(([status,n])=><span key={status} className="ota-deployment-count">{l.status(status)}: {n}</span>)}</span>{item.edition_id && <Link className="staff-action-link" to={`${firmwareEditionLink(item.edition_id)}&q=${encodeURIComponent(item.version??'')}`} onClick={event=>event.stopPropagation()} data-testid={`ota-deployment-firmware-${item.id}`}>{l.t('fw.lifecycle.openEdition')}</Link>}</span><ChevronDown size={18}/></summary>
    {open&&<DeploymentTargets deploymentId={item.id}/>}
  </details>;
}
function Deployments() {
  const state=useOtaPage('deployments'),{t,status}=useLabels();
  return <section className="servers-panel" aria-labelledby="ota-deployments-title">
    <div className="section-heading"><h2 id="ota-deployments-title">{t('ota.deploymentsTitle')}</h2><span className="count-pill">{state.query.data?.total??'—'}</span></div>
    <PageFilters state={state} kind="deployments" id="deployments" dateLabel={t('list.created')}/>
    {state.valid&&!state.query.isError&&state.query.data&&<>
      <div className="ota-badges" data-testid="deployments-aggregates">{Object.entries(state.query.data.aggregates.target_by_status).map(([key,n])=><span key={key}>{status(key)}: {n}</span>)}</div>
      <div className="ota-deployments">{state.query.data.items.map(item=><Deployment key={item.id} item={item}/>)}</div><PrintListPagination id="deployments" pagination={state.pagination}/></>}
  </section>;
}
function Audit() {
  const state=useOtaPage('audit'),l=useLabels(),{t}=l;
  return <section className="servers-panel" aria-labelledby="ota-audit-title"><div className="section-heading"><h2 id="ota-audit-title">{t('ota.auditTitle')}</h2><span className="count-pill">{state.started?state.query.data?.total??'—':'—'}</span></div>
    <PageFilters state={state} kind="audit" id="audit" dateLabel={t('list.created')}/>
    {state.started&&state.valid&&!state.query.isError&&state.query.data&&<><ul className="ota-audit" data-testid="ota-audit">{state.query.data.items.map(a=>{const facts=auditFacts(a.metadata);return <li key={a.id}><time dateTime={a.at??undefined}>{l.date(a.at)}</time><strong>{auditLabel(t,a.action)}</strong><span>{facts.version&&<>{t('list.eventVersion')}: {facts.version} · </>}{facts.group&&<>{facts.group} · </>}{facts.ring&&<>{l.ring(facts.ring)} · </>}{facts.status&&<>{l.status(facts.status)} · </>}{a.actor_email??t('notProvided')}</span>{facts.error&&<span className="ps-error-text">{facts.error}</span>}<Diagnostics id={`audit-${a.id}`} value={a}/></li>;})}</ul><PrintListPagination id="audit" pagination={state.pagination} disabled={state.query.isFetching}/></>}
  </section>;
}

type SelectedEdition = { editionId: string; version: string; lifecycle: FirmwareLifecycle };
function DeploymentDevicePicker({picked,toggle,disabled}:{picked:Set<string>;toggle:(id:string)=>void;disabled:boolean}) {
  const state=useOtaPage('channels'),{t}=useLocale();
  return <div className="ota-deploy-devices" data-testid="ota-deploy-devices">
    <p className="ota-selection-summary" role="status">{t('pe474.updates.picked').replace('{n}',String(picked.size))}</p>
    <AdminListFilters id="ota-deploy-devices" filters={state.filters} set={state.set} clear={state.clear} statuses={['active','online','offline'].map(v=>({value:v,label:t(`pe474.channels.status.${v}`)}))}/>
    {state.query.isError?<div role="alert" className="form-error">{t(psErrorKey(state.query.error))}<button className="button button-secondary" onClick={()=>void state.query.refetch()}>{t('refresh')}</button></div>:state.query.isPending?<p role="status" className="inline-empty">{t('dev.loading')}</p>:state.query.data?.items.length===0?<p className="inline-empty">{t('list.noMatches')}</p>:<ul className="ota-checklist">{state.query.data?.items.map(row=><li key={row.print_server_id}><label className="ota-device-card" data-selected={picked.has(row.print_server_id)}><input type="checkbox" checked={picked.has(row.print_server_id)} disabled={disabled||row.status!=='active'} onChange={()=>toggle(row.print_server_id)}/><span className="ota-device-content"><strong>{row.name??row.hostname??row.serial??row.print_server_id}</strong><small>{row.serial??'—'} · {row.venue_name??t('inv.unassigned')} · {t(`ota.ring.${row.channel}`)} · {row.installed_version??t('notProvided')}</small></span></label></li>)}</ul>}
    <PrintListPagination id="ota-deploy-devices" pagination={state.pagination} disabled={state.query.isFetching}/>
  </div>;
}

export function PrintUpdatesPage({ data, refreshing, onRefresh }: Props) {
  const l=useLabels(),{t}=l;
  const firmware=useOtaPage('firmwares',null,{status:'signed'});
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Result|null>(null);
  const [groupForm,setGroupForm]=useState<{name:string;ring:Ring}>({name:'',ring:'lab'});
  const [deploy,setDeploy]=useState<{edition:SelectedEdition|null;mode:'group'|'devices';group:string;ring:Ring;devices:Set<string>}>({edition:null,mode:'group',group:'',ring:'lab',devices:new Set()});
  useEffect(()=>{
    const chosen=deploy.edition,visible=firmware.query.data?.items.find(item=>item.lifecycle?.edition_id===chosen?.editionId);
    if(!chosen||!visible)return;
    if(!visible.lifecycle||visible.lifecycle.edition_status!=='signed'||visible.lifecycle.retired_at){setDeploy(d=>({...d,edition:null}));return;}
    if(visible.lifecycle.revision!==chosen.lifecycle.revision)setDeploy(d=>({...d,edition:{editionId:chosen.editionId,version:visible.version,lifecycle:visible.lifecycle!}}));
  },[firmware.query.data,deploy.edition?.editionId,deploy.edition?.lifecycle.revision]);
  const selectedGroup=data.groups.find(g=>g.id===deploy.group)??null;
  const canDeploy=!busy&&!refreshing&&!firmware.query.isError&&!firmware.query.isFetching&&!!deploy.edition&&(deploy.mode==='group'?!!selectedGroup:deploy.devices.size>0);
  const toggleDevice=(id:string)=>setDeploy(d=>{const devices=new Set(d.devices);if(devices.has(id))devices.delete(id);else devices.add(id);return {...d,devices};});
  async function run(fn:()=>Promise<string>) {
    if(busy)return;setBusy(true);setResult(null);
    try{setResult({ok:true,text:await fn()});}
    catch(error){const key=psErrorKey(error);setResult({ok:false,text:t(key)===key?t('ota.error.other'):t(key),devices:error instanceof OtaActionError?error.devices:undefined});}
    finally{setBusy(false);await onRefresh().catch(()=>{});await firmware.query.refetch().catch(()=>{});}
  }
  function submitGroup(event:FormEvent) {event.preventDefault();const name=groupForm.name.trim();if(!name)return;void run(async()=>{await createGroup(name,groupForm.ring);setGroupForm(f=>({...f,name:''}));return fill(t('ota.groupCreated'),{name});});}
  function submitDeploy(event:FormEvent) {
    event.preventDefault();const edition=deploy.edition;if(!canDeploy||!edition)return;
    if(!window.confirm(fill(t('ota.deployConfirm'),{version:edition.version})))return;
    const to=deploy.mode==='group'?{group_id:deploy.group}:{ring:deploy.ring,print_server_ids:[...deploy.devices]};
    void run(async()=>{const out=await deployEdition(edition.editionId,to);setDeploy(d=>({...d,devices:new Set()}));return fill(t('ota.deployed'),{version:edition.version,n:out.targets});});
  }
  return <div className="page-stack staff-page" data-testid="updates-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('ota.title')}</h1><p>{t('pe474.updates.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Rocket size={30}/></div></div>
    <PrintServersTabs/>
    <div className="pe474-updates-refresh"><button type="button" className="button button-secondary" disabled={refreshing||busy} onClick={()=>void onRefresh().then(()=>setResult(null)).catch(error=>setResult({ok:false,text:t(psErrorKey(error))}))}><RefreshCw size={15}/>{t('refresh')}</button></div>
    {result&&<div className={`ps-result ${result.ok?'ps-result-ok':'ps-result-error'}`} role={result.ok?'status':'alert'} data-testid="ota-result">{result.ok?<Check size={18}/>:<AlertTriangle size={18}/>}<span>{result.text}{result.devices&&result.devices.length>0&&<ul className="pe474-deploy-errors">{result.devices.map(d=>{const key=`pe474.reason.${d.reason??'unknown'}`,localized=t(key);return <li key={d.print_server_id}><Link to={`/admin/print-servers/channels?q=${encodeURIComponent(d.print_server_id)}`}>{d.print_server_id}</Link>{d.channel&&` · ${t(`ota.ring.${d.channel}`)}`}{d.installed_version&&` · ${t('ota.installed')}: ${d.installed_version}`} · {localized===key?t('pe474.reason.unknown'):localized}</li>;})}</ul>}</span></div>}
    <section className="staff-panel" aria-labelledby="ota-groups-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ota.groupsEyebrow')}</p><h2 id="ota-groups-title">{t('ota.groupsTitle')}</h2><p className="owner-section-lead">{t('pe474.updates.groupsRule')}</p></div><span className="count-pill">{data.groups.length}</span></div>
      <form className="fw-form ota-group-form" onSubmit={submitGroup} data-testid="ota-group-form"><label className="field"><span>{t('ota.groupName')}</span><input value={groupForm.name} maxLength={80} required disabled={busy} onChange={e=>setGroupForm(f=>({...f,name:e.target.value}))}/></label><label className="field"><span>{t('ota.ring')}</span><select value={groupForm.ring} disabled={busy} onChange={e=>setGroupForm(f=>({...f,ring:e.target.value as Ring}))}>{RINGS.map(r=><option key={r} value={r}>{l.ring(r)}</option>)}</select></label><div className="fw-actions"><button type="submit" className="button button-primary" disabled={busy||!groupForm.name.trim()}><Plus size={16}/>{t('ota.createGroup')}</button></div></form>
      {data.groups.length===0?<p className="inline-empty">{t('ota.noGroups')}</p>:<ul className="ota-groups">{data.groups.map(g=><li key={g.id}><div className="ota-group-head"><strong>{g.name}</strong><span className={`server-status ota-ring-${g.ring}`}>{l.ring(g.ring)}</span><span className="staff-self-note"><Users size={13}/>{t('ota.members').replace('{n}',String(g.member_count))}</span><Link className="staff-action-link" to={`/admin/print-servers/channels?group=${encodeURIComponent(g.id)}`}>{t('pe474.updates.viewMembers')}</Link></div></li>)}</ul>}
    </section>
    <section className="staff-panel" aria-labelledby="ota-deploy-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ota.deployEyebrow')}</p><h2 id="ota-deploy-title">{t('ota.deployTitle')}</h2></div><span className="section-icon"><Rocket size={20}/></span></div>
      <p className="owner-section-lead fw-notice"><AlertTriangle size={15}/>{t('pe474.updates.allOrNothing')}</p>
      <form className="fw-form ota-deploy-form" onSubmit={submitDeploy} data-testid="ota-deploy-form">
        <div className="ota-wide"><AdminListFilters id="ota-deploy-catalog" filters={firmware.filters} set={firmware.set} clear={firmware.clear} statuses={[{value:'signed',label:t('fw.lifecycle.signed')}]} afterStatus={<label><span>{t('ota.ring')}</span><select value={firmware.filters.ring??''} onChange={e=>firmware.set('ring',e.target.value)}><option value="">{t('list.allStates')}</option>{RINGS.map(r=><option key={r} value={r}>{l.ring(r)}</option>)}</select></label>}/>
          {firmware.query.isError?<div role="alert" className="form-error">{t(psErrorKey(firmware.query.error))}<button type="button" className="button button-secondary" onClick={()=>void firmware.query.refetch()}>{t('refresh')}</button></div>:firmware.query.isPending?<p role="status" className="inline-empty">{t('dev.loading')}</p>:firmware.query.data?.items.length===0?<p className="inline-empty">{t('ota.noReleases')}</p>:<div className="ota-edition-picker">{firmware.query.data?.items.filter(r=>r.lifecycle?.edition_status==='signed'&&r.lifecycle.edition_id&&!r.lifecycle.retired_at).map(r=><label key={r.id} className="ota-radio"><input type="radio" name="deploy-edition" value={r.lifecycle!.edition_id!} data-testid={`ota-deploy-edition-${r.id}`} checked={deploy.edition?.editionId===r.lifecycle!.edition_id} onChange={()=>setDeploy(d=>({...d,edition:{editionId:r.lifecycle!.edition_id!,version:r.version,lifecycle:r.lifecycle!}}))}/><span><strong>{r.version}</strong>{r.revision?` · ${r.revision}`:''} · {r.model} · {r.arch} · {r.lifecycle!.enabled_rings.map(l.ring).join(', ')}</span></label>)}</div>}
          <PrintListPagination id="ota-deploy-catalog" pagination={firmware.pagination} disabled={firmware.query.isFetching}/>
        </div>
        {deploy.edition&&<p className="ota-wide ps-cert-small" role="status">{t('pe474.updates.selectedEdition')}: {deploy.edition.version} <Link to={`${firmwareEditionLink(deploy.edition.editionId)}&q=${encodeURIComponent(deploy.edition.version)}`}>{t('fw.lifecycle.openEdition')}</Link></p>}
        <label className="field"><span>{t('ota.target')}</span><select value={deploy.mode} disabled={busy} onChange={e=>setDeploy(d=>({...d,mode:e.target.value as 'group'|'devices'}))}><option value="group">{t('ota.targetGroup')}</option><option value="devices">{t('ota.targetDevices')}</option></select></label>
        {deploy.mode==='group'?<label className="field"><span>{t('ota.group')}</span><select value={deploy.group} disabled={busy} onChange={e=>setDeploy(d=>({...d,group:e.target.value}))}><option value="">{t('ota.chooseGroup')}</option>{data.groups.map(g=><option key={g.id} value={g.id}>{g.name} · {l.ring(g.ring)} · {g.member_count}</option>)}</select></label>:<label className="field"><span>{t('ota.ring')}</span><select value={deploy.ring} disabled={busy} onChange={e=>setDeploy(d=>({...d,ring:e.target.value as Ring}))}>{RINGS.map(r=><option key={r} value={r}>{l.ring(r)}</option>)}</select></label>}
        {deploy.mode==='devices'&&<DeploymentDevicePicker picked={deploy.devices} toggle={toggleDevice} disabled={busy}/>}
        <div className="fw-actions"><button type="submit" className="button button-primary" data-testid="ota-deploy-submit" disabled={!canDeploy}><Rocket size={16}/>{t('ota.deploy')}</button></div>
      </form>
    </section>
    <Deployments/>
    <Audit/>
  </div>;
}
