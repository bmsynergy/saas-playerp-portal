import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminListFilters, useAdminListFilters } from '../components/AdminListFilters';
import { PrintListPagination, usePrintListPagination } from '../components/PrintListPagination';
import { EMPTY_LIST_FILTERS, matchesText, matchesUtcDay } from '../lib/adminLists';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useOtaPage } from '../lib/useOtaPage';
import { eventDetail, eventPhase, auditFacts } from '../lib/otaPresentation';
import { AlertTriangle, Check, ChevronDown, Copy, PenLine, Plus, RefreshCw, Rocket, Save, ShieldCheck, Users, X } from 'lucide-react';
import { createGroup, deployEdition, getTargetEvents, RINGS, setGroupMembers, signEdition, statusClass, type OtaDevice, type OtaOverview, type OtaRelease, type OtaTarget, type OtaPageKind, type Ring } from '../lib/ota';
import { psErrorKey } from '../lib/printServerApi';
import { useLocale } from '../locales';
import { PortalDialog } from '../components/PortalDialog';
import { PrintServersTabs } from './PrintFirmwaresPage';

// PE-385: OTA of the Print Server app. Platform Admin only (route gate + every RPC and the
// ps-ota-admin function answer 42501/403 to anyone else). Lab and canary first; general
// rollout is refused by the backend until a canary device confirms the edition.
type Props = { data: OtaOverview; refreshing: boolean; onRefresh: () => Promise<unknown> };
type Result = { ok: boolean; text: string };
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
    {kind==='deployments'&&<label className="ota-extra-filter"><span>{t('ota.ring')}</span><select data-testid={`${id}-ring`} value={state.filters.ring??''} onChange={e=>state.set('ring',e.target.value)}><option value="">{t('list.allStates')}</option>{RINGS.map(r=><option key={r} value={r}>{ring(r)}</option>)}</select></label>}
    {kind==='events'&&<label className="ota-extra-filter"><span>{t('ota.phase')}</span><input data-testid={`${id}-phase`} value={state.filters.phase??''} onChange={e=>state.set('phase',e.target.value)}/></label>}
    <ReadState state={state}/></>;
}
function Diagnostics({id,value}:{id:string;value:unknown}) {
  const {t}=useLocale();
  // This component is mounted only in the platform-admin OTA route. The read RPCs
  // enforce that role too; never used in the owner/venue panel.
  return <details id={`diagnostic-${id}`} className="ota-diagnostic"><summary>{t('list.diagnostics')}</summary><pre>{typeof value==='string'?value:JSON.stringify(value,null,2)}</pre></details>;
}
function auditLabel(t:(key:string)=>string,action:string) {
  const key=`ota.auditAction.${action}`,label=t(key);
  return label===key?`${t('ota.auditTitle')}: ${action}`:label;
}
function Events({ target }: { target: OtaTarget }) {
  const l=useLabels(),{t}=l;
  const {session}=useAuth();
  const targetId=target.id;
  // Existing authorized RPC returns every event of this target, ordered by ID.
  const query=useQuery({queryKey:['ps-ota-events',session?.user.id,targetId],
    queryFn:({signal})=>getTargetEvents(targetId,signal),enabled:!!session,refetchInterval:10_000});
  // Sort a copy by time; stable ties preserve the RPC's ID order without mutating its cache.
  const events=[...(query.data??[])].sort((a,b)=>(Date.parse(a.created_at??'')||0)-(Date.parse(b.created_at??'')||0));
  return <div>
    {query.isError ? <div role="alert" className="form-error">{t(psErrorKey(query.error))}<button type="button" className="button button-secondary" onClick={()=>void query.refetch()}>{t('refresh')}</button></div>
      : query.isPending ? <p role="status" className="inline-empty">{t('dev.loading')}</p>
      : (events.length ? <ol className="ota-events" data-testid={`ota-events-${targetId}`}>{events.map(e=>{
        const detail=eventDetail(e.detail);
        return <li key={e.id}>
          <time dateTime={e.created_at??undefined}>{l.date(e.created_at)}</time>
          <span><strong>{l.phase(e.phase)}</strong> · {t('list.eventVersion')}: {target.desired_version??t('notProvided')} · {t('list.eventResult')}: {e.status?l.status(e.status):t('notProvided')}{e.progress!==null&&<> · {t('list.generalProgress')}: {e.progress}%</>}</span>
          {(e.error_code||e.error_detail)&&<span className="ps-error-text">{[e.error_code,e.error_detail].filter(Boolean).join(' — ')}</span>}
          {detail.human&&<span className="ps-sub">{detail.human}</span>}
          <Diagnostics id={`event-${e.id}`} value={e}/>
        </li>;
      })}</ol> : <div className="inline-empty">{t('list.noMatches')}</div>)}
  </div>;
}

function TargetRow({ target, device }: { target: OtaTarget; device?: OtaDevice }) {
  const l = useLabels(); const { t } = l;
  const [open, setOpen] = useState(false);
  const host = device?.hostname ?? target.hostname;
  return <>
    <tr data-testid={`ota-target-${target.id}`} data-status={target.status}>
      <td data-label={t('inv.venue')}>{device?.venue_name ?? target.venue_name ?? t('inv.unassigned')}</td>
      <td data-label={t('ps.hostname')}><span className="fw-cell"><strong>{host ?? t('notProvided')}</strong>{device?.serial && <small className="ps-sub ps-mono">{device.serial}</small>}</span></td>
      <td data-label={t('ota.installed')}>{target.installed_version ?? device?.installed_version ?? t('notProvided')}</td>
      <td data-label={t('ota.desired')}>{target.desired_version ?? t('notProvided')}</td>
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
  return <div><PageFilters state={state} kind="targets" id={`targets-${deploymentId}`} dateLabel={t('list.issuedAt')}/>
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
    <summary><span className="fw-cell"><strong>{item.version??l.t('notProvided')} · {l.ring(item.ring)}{item.group_name?` · ${item.group_name}`:''}</strong><small className="ps-sub">{l.date(item.created_at)} · {fill(l.t('ota.targetsCount'),{n:item.target_count})}</small><span className="ota-deployment-stats"><span className="ota-deployment-count">{l.t('adminDevice.completedCount').replace('{done}', String(completed)).replace('{total}', String(item.target_count))} · {progress}%</span>{Object.entries(item.target_by_status).filter(([,n])=>n>0).map(([status,n])=><span key={status} className="ota-deployment-count">{l.status(status)}: {n}</span>)}</span></span><ChevronDown size={18}/></summary>
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
  return <section className="servers-panel" aria-labelledby="ota-audit-title"><div className="section-heading"><h2 id="ota-audit-title">{t('ota.auditTitle')}</h2><span className="count-pill">{state.query.data?.total??'—'}</span></div>
    <PageFilters state={state} kind="audit" id="audit" dateLabel={t('list.created')}/>
    {state.valid&&!state.query.isError&&state.query.data&&<><ul className="ota-audit" data-testid="ota-audit">{state.query.data.items.map(a=>{const facts=auditFacts(a.metadata);return <li key={a.id}><time dateTime={a.at??undefined}>{l.date(a.at)}</time><strong>{auditLabel(t,a.action)}</strong><span>{facts.version&&<>{t('list.eventVersion')}: {facts.version} · </>}{facts.group&&<>{facts.group} · </>}{facts.ring&&<>{l.ring(facts.ring)} · </>}{facts.status&&<>{l.status(facts.status)} · </>}{a.actor_email??t('notProvided')}</span>{facts.error&&<span className="ps-error-text">{facts.error}</span>}<Diagnostics id={`audit-${a.id}`} value={a}/></li>;})}</ul><PrintListPagination id="audit" pagination={state.pagination}/></>}
  </section>;
}
function useLocalList<T>(items:T[],matches:(row:T,filters:import('../lib/adminLists').ListFilterState)=>boolean) {
  const list=useAdminListFilters(()=>pagination.reset());
  const filtered=items.filter(row=>matches(row,list.filters));
  const pagination=usePrintListPagination(filtered.length);
  return {list,pagination,items:filtered.slice(pagination.start,pagination.end)};
}
function GroupEditor({ groupId, initial, devices, busy, onSave, onCancel }: { groupId: string; initial: string[]; devices: OtaDevice[]; busy: boolean; onSave: (ids: string[]) => void; onCancel: () => void }) {
  const { t } = useLocale();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return <div className="ota-members" data-testid={`ota-group-editor-${groupId}`}>
    <DeviceChecklist devices={devices} picked={picked} toggle={toggle} busy={busy} prefix={`ota-member-${groupId}`}/>
    <div className="staff-actions"><button type="button" className="button button-primary" disabled={busy} data-testid={`ota-group-save-${groupId}`} onClick={() => onSave([...picked])}><Save size={15}/>{t('ota.saveMembers')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}><X size={15}/>{t('staff.cancel')}</button></div>
  </div>;
}
function DeviceChecklist({ devices, picked, toggle, busy, prefix }: { devices: OtaDevice[]; picked: Set<string>; toggle: (id: string) => void; busy: boolean; prefix: string }) {
  const l = useLabels(); const { t } = l;
  const rows=useLocalList(devices,(d,f)=>matchesText(f.query,d.hostname,d.serial,d.model,d.installed_version,d.venue_name)&&(!f.status||(d.online?'online':'offline')===f.status)&&matchesUtcDay(d.last_seen_at,f.from,f.to));
  return <div className="ota-device-picker">
    <p className="ota-selection-summary" role="status" aria-live="polite" data-testid={`${prefix}-summary`}>{fill(t('ota.devicesSelected'), { selected: picked.size, total: devices.length })}</p>
    {devices.length === 0 ? <div className="inline-empty">{t('ota.noDevices')}</div> : <>
      <AdminListFilters id={prefix} {...rows.list} dateLabel={t('list.lastContact')} statuses={['online','offline'].map(value=>({value,label:t(`ps.state.${value}`)}))}/>
      {rows.pagination.total===0&&<div className="inline-empty">{t('list.noMatches')}</div>}
      <div className="ota-checklist-shell"><ul className="ota-checklist">{rows.items.map(d => {
        const hostname = d.hostname ?? d.serial ?? d.print_server_id;
        return <li key={d.print_server_id}><label className="ota-device-card" data-selected={picked.has(d.print_server_id)}>
          <input type="checkbox" checked={picked.has(d.print_server_id)} disabled={busy} data-testid={`${prefix}-${d.print_server_id}`} onChange={() => toggle(d.print_server_id)}/>
          <span className="ota-device-content">
            <strong className="ota-device-hostname" title={hostname}>{hostname}</strong>
            <span className="ota-device-details">
              <span><small>{t('inv.venue')}</small><span title={d.venue_name ?? undefined}>{d.venue_name ?? t('inv.unassigned')}</span></span>
              <span><small>{t('ota.deviceModel')}</small><span title={d.model ?? undefined}>{d.model ?? t('notProvided')}</span></span>
              <span><small>{t('ota.installed')}</small><span title={d.installed_version ?? undefined}>{d.installed_version ?? t('notProvided')}</span></span>
              <span><small>{t('state')}</small><span className={`server-status ${d.online ? 'server-online' : 'server-offline'}`}><span className="badge-dot"/>{t(`ps.state.${d.online ? 'online' : 'offline'}`)}</span></span>
              <span><small>{t('list.lastContact')}</small><time dateTime={d.last_seen_at ?? undefined} title={l.date(d.last_seen_at)}>{l.date(d.last_seen_at)}</time></span>
            </span>
          </span>
        </label></li>;
      })}</ul></div>
      <PrintListPagination id={prefix} pagination={rows.pagination}/>
    </>}
  </div>;
}

export function PrintUpdatesPage({ data, refreshing, onRefresh }: Props) {
  const l = useLabels(); const { t } = l;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [signing, setSigning] = useState<OtaRelease | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<{ name: string; ring: Ring }>({ name: '', ring: 'lab' });
  const [editing, setEditing] = useState<string | null>(null);
  const signed = data.releases.filter(r => r.edition_status === 'signed' && r.edition_id);
  const [deploy, setDeploy] = useState<{ edition: string; mode: 'group' | 'devices'; group: string; ring: Ring; devices: Set<string> }>({ edition: '', mode: 'group', group: '', ring: 'lab', devices: new Set() });
  const releases=useLocalList(data.releases,(r,f)=>matchesText(f.query,r.version,r.revision,r.model,r.arch)&&(!f.status||(r.edition_status??'none')===f.status)&&matchesUtcDay(r.created_at,f.from,f.to));
  const groups=useLocalList(data.groups,(g,f)=>matchesText(f.query,g.name,g.ring)&&(!f.status||g.ring===f.status)&&matchesUtcDay(g.created_at,f.from,f.to));
  const activeKey = data.keys.find(k => k.active) ?? null;
  const edition = signed.find(r => r.edition_id === deploy.edition) ?? null;
  const deployRing: Ring | null = deploy.mode === 'group' ? data.groups.find(g => g.id === deploy.group)?.ring ?? null : deploy.ring;
  const generalBlocked = deployRing === 'general' && !!edition && !edition.canary_confirmed_at;
  const canDeploy = !busy && !!edition && (deploy.mode === 'group' ? !!deploy.group : deploy.devices.size > 0);

  async function run(fn: () => Promise<string>) {
    if (busy) return;
    setBusy(true); setResult(null);
    try { setResult({ ok: true, text: await fn() }); }
    catch (error) { const key = psErrorKey(error); setResult({ ok: false, text: t(key) === key ? t('ota.error.other') : t(key) }); }
    finally { setBusy(false); try { await onRefresh(); } catch { /* the periodic refetch reports a lasting failure */ } }
  }
  async function copy(id: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(id); setTimeout(() => setCopied(c => c === id ? null : c), 2000); } catch { setCopied(null); }
  }
  function submitGroup(event: FormEvent) {
    event.preventDefault();
    const name = groupForm.name.trim();
    if (!name) return;
    void run(async () => { await createGroup(name, groupForm.ring); setGroupForm(f => ({ ...f, name: '' })); return fill(t('ota.groupCreated'), { name }); });
  }
  function submitDeploy(event: FormEvent) {
    event.preventDefault();
    if (!canDeploy || !edition?.edition_id) return;
    const to = deploy.mode === 'group' ? { group_id: deploy.group } : { ring: deploy.ring, print_server_ids: [...deploy.devices] };
    if (!window.confirm(fill(t('ota.deployConfirm'), { version: edition.version }))) return;
    void run(async () => { const out = await deployEdition(edition.edition_id!, to); setDeploy(d => ({ ...d, devices: new Set() })); return fill(t('ota.deployed'), { version: edition.version, n: out.targets }); });
  }
  const toggleDevice = (id: string) => setDeploy(d => { const n = new Set(d.devices); if (n.has(id)) n.delete(id); else n.add(id); return { ...d, devices: n }; });

  return <div className="page-stack staff-page" data-testid="updates-page">
    <div className="page-heading"><div><p className="eyebrow">{t('ps.eyebrow')}</p><h1>{t('ota.title')}</h1><p>{t('ota.lead')}</p></div><div className="heading-accent" aria-hidden="true"><Rocket size={30}/></div></div>
    <PrintServersTabs/>
    <div className={`ps-result ${result ? (result.ok ? 'ps-result-ok' : 'ps-result-error') : 'ps-result-empty'}`} role="status" aria-live="polite" data-testid="ota-result" data-ok={result ? String(result.ok) : undefined}>{result && (result.ok ? <Check size={18}/> : <AlertTriangle size={18}/>)}<span>{result?.text ?? ''}</span></div>

    <section className="servers-panel" aria-labelledby="ota-editions-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ota.editionsEyebrow')}</p><h2 id="ota-editions-title">{t('ota.editionsTitle')}</h2></div><button type="button" className="button button-secondary" onClick={() => void onRefresh()} disabled={refreshing}><RefreshCw size={15}/>{t('refresh')}</button></div>
      <p className="owner-section-lead ota-lead">{activeKey ? fill(t('ota.activeKey'), { key: keyShort(activeKey.key_id) }) : t('ota.noKey')}</p>
      <AdminListFilters id="editions" {...releases.list} dateLabel={t('list.created')} statuses={['signed','preparing','none'].map(value=>({value,label:t(value==='none'?'ota.unsigned':value==='signed'?'ota.editionSigned':`ota.${value}`)}))}/>
      {releases.pagination.total === 0 ? <div className="inline-empty">{t(data.releases.length?'list.noMatches':'ota.noReleases')}</div> : <div className="table-scroll"><table className="servers-table fw-table"><thead><tr><th scope="col">{t('fw.col.version')}</th><th scope="col">{t('fw.col.model')}</th><th scope="col">SHA-256</th><th scope="col">{t('ota.size')}</th><th scope="col">{t('ota.edition')}</th><th scope="col"><span className="sr-only">{t('staff.actions')}</span></th></tr></thead><tbody>
        {releases.items.map(r => <tr key={r.id} data-testid={`ota-release-${r.id}`} data-edition={r.edition_status ?? 'none'}>
          <td data-label={t('fw.col.version')}><span className="fw-cell"><strong>{r.version}</strong>{r.revision && <small className="ps-sub">{t('fw.revision')} {r.revision}</small>}</span></td>
          <td data-label={t('fw.col.model')}>{MODELS[r.model] ?? r.model} · {r.arch}</td>
          <td data-label="SHA-256">{r.sha256 ? <span className="ota-sha"><code className="ps-mono" title={r.sha256}>{r.sha256.slice(0, 12)}…</code><button type="button" className="staff-action-link" aria-label={t('inv.copy')} onClick={() => void copy(r.id, r.sha256!)}>{copied === r.id ? <Check size={14}/> : <Copy size={14}/>}</button></span> : t('notProvided')}</td>
          <td data-label={t('ota.size')}>{r.size_bytes === null ? t('notProvided') : `${(r.size_bytes / 1048576).toFixed(1)} MB`}</td>
          <td data-label={t('ota.edition')}><span className="ota-badges">
            {r.edition_status === 'signed' ? <span className="server-status server-online" data-testid={`ota-signed-${r.id}`} title={r.signed_at ? l.date(r.signed_at) : undefined}><ShieldCheck size={13}/>{fill(t('ota.signedBadge'), { key: keyShort(r.key_id) })}</span>
              : r.edition_status === 'preparing' ? <span className="server-status server-pending"><span className="badge-dot"/>{t('ota.preparing')}</span>
              : <span className="server-status server-pending"><span className="badge-dot"/>{t('ota.unsigned')}</span>}
            {r.canary_confirmed_at && <span className="server-status server-online" data-testid={`ota-canary-${r.id}`} title={l.date(r.canary_confirmed_at)}><Check size={13}/>{t('ota.canaryConfirmed')}</span>}
          </span></td>
          <td data-label={t('staff.actions')}>{!r.edition_status && <button type="button" className="button button-secondary" disabled={busy || !activeKey} data-testid={`ota-sign-${r.id}`} onClick={() => setSigning(r)}><PenLine size={15}/>{t('ota.sign')}</button>}</td>
        </tr>)}
      </tbody></table></div>}
      <PrintListPagination id="editions" pagination={releases.pagination}/>
    </section>

    <section className="staff-panel" aria-labelledby="ota-groups-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ota.groupsEyebrow')}</p><h2 id="ota-groups-title">{t('ota.groupsTitle')}</h2></div><span className="count-pill">{groups.pagination.total}</span></div>
      <form className="fw-form ota-group-form" onSubmit={submitGroup} data-testid="ota-group-form">
        <label className="field"><span>{t('ota.groupName')}</span><input value={groupForm.name} maxLength={80} required disabled={busy} data-testid="ota-group-name" onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}/></label>
        <label className="field"><span>{t('ota.ring')}</span><select value={groupForm.ring} disabled={busy} data-testid="ota-group-ring" onChange={e => setGroupForm(f => ({ ...f, ring: e.target.value as Ring }))}>{RINGS.map(r => <option key={r} value={r}>{l.ring(r)}</option>)}</select></label>
        <div className="fw-actions"><button type="submit" className="button button-primary" disabled={busy || !groupForm.name.trim()} data-testid="ota-group-create"><Plus size={16}/>{t('ota.createGroup')}</button></div>
      </form>
      <AdminListFilters id="groups" {...groups.list} dateLabel={t('list.created')} statusLabel={t('ota.ring')} statuses={RINGS.map(value=>({value,label:l.ring(value)}))}/>
      {groups.pagination.total === 0 ? <div className="inline-empty">{t(data.groups.length?'list.noMatches':'ota.noGroups')}</div> : <ul className="ota-groups">{groups.items.map(g => <li key={g.id} data-testid={`ota-group-${g.id}`}>
        <div className="ota-group-head"><strong>{g.name}</strong><span className={`server-status ota-ring-${g.ring}`}><span className="badge-dot"/>{l.ring(g.ring)}</span><span className="staff-self-note"><Users size={13}/> {fill(t('ota.members'), { n: g.members.length })}</span>
          <button type="button" className="staff-action-link" disabled={busy} aria-expanded={editing === g.id} data-testid={`ota-group-edit-${g.id}`} onClick={() => setEditing(editing === g.id ? null : g.id)}><Users size={14}/>{t('ota.editMembers')}</button></div>
        {editing === g.id && <GroupEditor groupId={g.id} initial={g.members} devices={data.devices} busy={busy} onCancel={() => setEditing(null)} onSave={ids => void run(async () => { await setGroupMembers(g.id, ids); setEditing(null); return fill(t('ota.membersSaved'), { name: g.name }); })}/>}
      </li>)}</ul>}
      <PrintListPagination id="groups" pagination={groups.pagination}/>
    </section>

    <section className="staff-panel" aria-labelledby="ota-deploy-title">
      <div className="section-heading"><div><p className="eyebrow">{t('ota.deployEyebrow')}</p><h2 id="ota-deploy-title">{t('ota.deployTitle')}</h2></div><span className="section-icon"><Rocket size={20}/></span></div>
      <p className="owner-section-lead fw-notice"><AlertTriangle size={15}/>{t('ota.deployRule')}</p>
      <form className="fw-form ota-deploy-form" onSubmit={submitDeploy} data-testid="ota-deploy-form">
        <label className="field"><span>{t('ota.edition')}</span><select value={deploy.edition} disabled={busy} data-testid="ota-deploy-edition" onChange={e => setDeploy(d => ({ ...d, edition: e.target.value }))}><option value="">{t('ota.chooseEdition')}</option>{signed.map(r => <option key={r.edition_id!} value={r.edition_id!}>{r.version}{r.revision ? ` (${r.revision})` : ''} · {r.arch}{r.canary_confirmed_at ? ` · ${t('ota.canaryConfirmed')}` : ''}</option>)}</select></label>
        <label className="field"><span>{t('ota.target')}</span><select value={deploy.mode} disabled={busy} data-testid="ota-deploy-mode" onChange={e => setDeploy(d => ({ ...d, mode: e.target.value as 'group' | 'devices' }))}><option value="group">{t('ota.targetGroup')}</option><option value="devices">{t('ota.targetDevices')}</option></select></label>
        {deploy.mode === 'group'
          ? <label className="field"><span>{t('ota.group')}</span><select value={deploy.group} disabled={busy} data-testid="ota-deploy-group" onChange={e => setDeploy(d => ({ ...d, group: e.target.value }))}><option value="">{t('ota.chooseGroup')}</option>{data.groups.map(g => <option key={g.id} value={g.id}>{g.name} · {l.ring(g.ring)} · {g.members.length}</option>)}</select></label>
          : <label className="field"><span>{t('ota.ring')}</span><select value={deploy.ring} disabled={busy} data-testid="ota-deploy-ring" onChange={e => setDeploy(d => ({ ...d, ring: e.target.value as Ring }))}>{RINGS.map(r => <option key={r} value={r}>{l.ring(r)}</option>)}</select></label>}
        {deploy.mode === 'devices' && <div className="ota-deploy-devices"><DeviceChecklist devices={data.devices} picked={deploy.devices} toggle={toggleDevice} busy={busy} prefix="ota-deploy-device"/></div>}
        {generalBlocked && <p className="form-error ota-wide" data-testid="ota-general-blocked"><AlertTriangle size={16}/>{t('ota.error.canaryNotConfirmed')}</p>}
        <div className="fw-actions"><button type="submit" className="button button-primary" disabled={!canDeploy} data-testid="ota-deploy-submit"><Rocket size={16}/>{t('ota.deploy')}</button></div>
      </form>
    </section>

    <Deployments/>
    <Audit/>

    {signing && <PortalDialog title={t('ota.sign')} titleId="ota-sign-title" descriptionId="ota-sign-body" testId="ota-sign-dialog" alert onClose={() => setSigning(null)} dismissible={!busy} actions={<>
        <button type="button" className="button button-primary" data-testid="ota-sign-accept" disabled={busy} onClick={() => { const r = signing; void run(async () => { const out = await signEdition(r.id); setSigning(null); return fill(t('ota.signedOk'), { version: out.version ?? r.version, key: keyShort(out.key_id) }); }).then(() => setSigning(null)); }}><Check size={15}/>{t(busy ? 'ps.working' : 'staff.confirm')}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => setSigning(null)}><X size={15}/>{t('staff.cancel')}</button>
      </>}>
      <p id="ota-sign-body">{fill(t('ota.signConfirm'), { version: signing.version, key: keyShort(activeKey?.key_id ?? null) })}</p>
    </PortalDialog>}
  </div>;
}
