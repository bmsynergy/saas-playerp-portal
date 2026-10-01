import { useQuery } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { destination, displayName, preferredScope, chooseScope, safeNext } from './lib/access';
import { getStaff, staffRequest, staffErrorKey, acceptInvitation } from './lib/staff';
import { StaffPage, type StaffMember } from './pages/StaffPage';
import { getIdentities, getIdentity, identityRequest } from './lib/identityApi';
import type { IdentityAction } from './lib/identity';
import { UsersPage, type IdentityInvite } from './pages/UsersPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { InvitationPage } from './pages/InvitationPage';
import { getFleet, getPanelState, printServerApi, psErrorKey, withFailureHook } from './lib/printServerApi';
import { PrintFleetPage } from './pages/PrintFleetPage';
import { PrintServerDetailPage } from './pages/PrintServerDetailPage';
import { Brand } from './components/Brand';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAccess, useDirectory, useOwnerVenue, useTenantDetail } from './hooks/usePortalData';
import { errorCode } from './lib/errors';
import { persist, stored } from './lib/storage';
import type { OwnerVenue, UiError } from './lib/types';
import { useLocale } from './locales';
import { LanguageSelector } from './components/LanguageSelector';
import { PortalShell } from './components/PortalShell';
import { StateView } from './components/StateView';
import { AuthPage } from './pages/AuthPage';
import { OwnerPage } from './pages/OwnerPage';
import { AdminHome } from './pages/AdminHome';
import { TenantDirectory } from './pages/TenantDirectory';
import { TenantDetailPage } from './pages/TenantDetailPage';

function Standalone({children}:{children:ReactNode}) {
  const {session,logout}=useAuth(); const {t}=useLocale();
  return <div className="standalone"><header className="standalone-header"><Link className="brand" to="/auth/complete"><Brand/></Link><div className="topbar-actions"><LanguageSelector/>{session&&<button className="button button-secondary" onClick={()=>void logout()}>{t('signOut')}</button>}</div></header>{children}</div>;
}
function OutsideState(props:Parameters<typeof StateView>[0]) {
  const {session}=useAuth(); const {t}=useLocale();
  return <Standalone><StateView {...props}/>{props.kind==='denied'&&session&&<div className="auth-invalid"><Link className="button button-secondary" to="/auth/invitation">{t('staff.acceptInvitation')}</Link></div>}</Standalone>;
}
function Scope({scope,children}:{scope:'owner'|'admin';children:ReactNode}) {
  const auth=useAuth(); const access=useAccess(); const location=useLocation();
  const {t}=useLocale();
  useEffect(() => { if (access.error && errorCode(access.error)==='sessionExpired') void auth.expire(); },[access.error, auth.expire]);
  if (auth.loading) return <OutsideState kind="loading"/>;
  if (!auth.session) return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname+location.search)}`} replace/>;
  if (auth.recovery || auth.invitation) return <Navigate to="/auth/password" replace/>;
  if (access.isPending) return <OutsideState kind="loading"/>;
  if (access.isError || !access.data) return <OutsideState kind="error" onRetry={()=>void access.refetch()}/>;
  const canAdmin=access.data.is_platform_staff;
  const canOwner=access.data.owner_venues.length>0;
  const allowed=scope==='admin'?canAdmin:canOwner;
  // Resolve authorization before mounting a shell or any scoped data query.
  if (!allowed) {
    const target=destination(access.data);
    return target ? <Navigate to={target} replace/> : <OutsideState kind="denied"/>;
  }
  if (scope==='owner' && canAdmin && preferredScope(auth.session.user.id)!=='owner') return <Navigate to="/admin" replace/>;
  return <PortalShell scope={scope} email={auth.session.user.email??''} displayName={displayName(auth.session.user)} canAdmin={canAdmin} canOwner={canOwner} canManageStaff={access.data.can_manage_staff} canViewTenants={access.data.can_view_tenants} onSwitchScope={next=>chooseScope(auth.session!.user.id,next)} onLogout={auth.logout}>
    {children}
  </PortalShell>;
}
function Complete() {
  const auth=useAuth(); const access=useAccess(); const [params]=useSearchParams();
  useEffect(() => { if (access.error && errorCode(access.error)==='sessionExpired') void auth.expire(); },[access.error, auth.expire]);
  if (auth.loading) return <OutsideState kind="loading"/>;
  if (!auth.session) return <Navigate to="/auth/login" replace/>;
  if (auth.recovery || auth.invitation) return <Navigate to="/auth/password" replace/>;
  if (access.isPending) return <OutsideState kind="loading"/>;
  if (access.isError) return <OutsideState kind="error" onRetry={()=>void access.refetch()}/>;
  if (!access.data) return <OutsideState kind="error"/>;
  const target=destination(access.data,params.get('next'));
  return target ? <Navigate to={target} replace/> : <OutsideState kind="denied"/>;
}
function AuthRoute({mode}:{mode:'login'|'forgot'|'password'}) {
  const auth=useAuth(); const [error,setError]=useState<UiError|null>(null); const [busy,setBusy]=useState(false); const [success,setSuccess]=useState(false);
  const [params]=useSearchParams(); const navigate=useNavigate(); const {t}=useLocale();
  const recoveryRequest=params.get('recovery')==='1';
  const invitationRequest=params.get('invite')==='1';
  const next=safeNext(params.get('next'));
  const complete=next?`/auth/complete?next=${encodeURIComponent(next)}`:'/auth/complete';
  const invalid=mode==='password'&&!success&&(auth.callbackInvalid||params.has('invalid')||(!auth.loading&&!auth.session)||(recoveryRequest&&!auth.recovery)||(invitationRequest&&!auth.invitation));
  const submit=async(email:string,password:string)=>{
    setBusy(true);setError(null);
    try {
      if(mode==='login') {await auth.login(email,password); navigate(complete,{replace:true});}
      if(mode==='forgot') {await auth.recover(email);setSuccess(true);}
      if(mode==='password') {await auth.updatePassword(password);setSuccess(true);window.history.replaceState(null,'','/auth/password');}
    } catch(e){setError(errorCode(e));} finally {setBusy(false);}
  };
  if(auth.loading)return <OutsideState kind="loading"/>;
  if(mode==='login'&&auth.session) return <Navigate to={auth.recovery||auth.invitation?'/auth/password':complete} replace/>;
  if(invalid) return <Standalone><div className="auth-invalid"><StateView kind="error" message="invalidLink"/><Link className="button button-primary" to="/auth/forgot">{t('auth.forgotPassword')}</Link></div></Standalone>;
  return <AuthPage mode={mode} onSubmit={submit} error={error??(mode==='login'&&auth.expired?'sessionExpired':null)} busy={busy} success={success} recovery={auth.recovery||recoveryRequest} invitation={auth.invitation||invitationRequest}/>;
}
function OwnerRoute() {
  const access=useAccess(); const {session}=useAuth(); const [params,setParams]=useSearchParams();
  const venues=access.data?.owner_venues??[];
  const key=`playerp.portal.venue.${session?.user.id}`;
  const requested=params.get('venue');
  const preferred=stored(key);
  const selected=requested??(venues.some(v=>v.id===preferred)?preferred:null)??venues[0]?.id??'';
  const known=venues.some(v=>v.id===selected);
  const detail=useOwnerVenue(known?selected:'');
  const select=(id:string)=>{if(venues.some(v=>v.id===id)){persist(key,id);setParams({venue:id});}};
  useEffect(()=>{if(known)persist(key,selected);},[key,known,selected]);
  if(!known)return <StateView kind="denied"/>;
  if(detail.isPending)return <StateView kind="loading"/>;
  if(detail.isError)return <StateView kind={errorCode(detail.error)==='accessDenied'?'denied':'error'} onRetry={()=>void detail.refetch()}/>;
  if(!detail.data?.some(v=>v.id===selected))return <StateView kind="denied"/>;
  return <OwnerPage venues={venues.map(v=>v.id===selected?detail.data!.find(item=>item.id===selected)!:v)} selectedId={selected} onSelect={select}/>;
}
function DirectoryRoute({home=false}:{home?:boolean}) {
  const access=useAccess(); const {t}=useLocale();
  if (!access.data?.can_view_tenants) return home ? <div className="page-heading"><h1>{t('adminHome')}</h1><p>{t('staff.limitedAccess')}</p></div> : <StateView kind="denied"/>;
  return <DirectoryData home={home}/>;
}
function DirectoryData({home=false}:{home?:boolean}) {
  const data=useDirectory();
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError)return <StateView kind={errorCode(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  const venues:OwnerVenue[]=data.data??[];
  return home?<AdminHome venues={venues}/>:<TenantDirectory venues={venues}/>;
}
function DetailRoute() {
  const access=useAccess(); const {id=''}=useParams();
  if (!access.data?.can_view_tenants) return <StateView kind="denied"/>;
  if(!UUID.test(id))return <StateView kind="notFound"/>;
  return <DetailData id={id}/>;
}
function DetailData({id}:{id:string}) {
  const data=useTenantDetail(id);
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError)return <StateView kind={errorCode(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  if(!data.data)return <StateView kind="notFound"/>;
  return <TenantDetailPage detail={data.data}/>;
}
function InvitationRoute() {
  const auth=useAuth(); const navigate=useNavigate(); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  if(auth.loading)return <OutsideState kind="loading"/>;
  if(!auth.session)return <Navigate to="/auth/login" replace/>;
  if(auth.recovery||auth.invitation)return <Navigate to="/auth/password" replace/>;
  const accept=async()=>{
    setBusy(true);setError(null);
    try { await acceptInvitation(); await queryClient.invalidateQueries({queryKey:['access']}); navigate('/auth/complete',{replace:true}); }
    catch(e) {setError(staffErrorKey(e));} finally {setBusy(false);}
  };
  return <Standalone><InvitationPage busy={busy} error={error} onAccept={accept}/></Standalone>;
}
function StaffRoute() {
  const access=useAccess();
  return access.data?.can_manage_staff ? <StaffData/> : <StateView kind="denied"/>;
}
function StaffData() {
  const {session,expire}=useAuth(); const {locale}=useLocale();
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const data=useQuery({queryKey:['staff',session?.user.id],queryFn:getStaff,refetchInterval:60_000});
  useEffect(()=>{if(data.error&&staffErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  const run=async(body:Record<string,unknown>,invite=false)=>{
    if(busy)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      await staffRequest(invite?'invite-platform-staff':'platform-staff-admin',body);
      setNotice(invite?'staff.invited':body.action==='send_recovery'?'staff.recoverySent':'staff.updated');
      await data.refetch();
      await queryClient.invalidateQueries({queryKey:['access']});
    } catch(e) {
      const code=staffErrorKey(e);setError(code);
      if(code==='sessionExpired')await expire();
      if(code==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
      throw e;
    } finally {setBusy(false);}
  };
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError)return <StateView kind={staffErrorKey(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  return <StaffPage members={data.data??[]} currentUserId={session!.user.id} busy={busy} error={error} notice={notice}
    onInvite={(email,role,lang)=>run({email,role,locale:lang},true)}
    onAction={(action,member:StaffMember,value)=>run({action,user_id:member.user_id,...(action==='set_role'?{role:value}:action==='set_status'?{status:value}:{locale})})}/>;
}
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function useIdentityDirectory() {
  const {session}=useAuth();
  return useQuery({queryKey:['identity',session?.user.id],queryFn:getIdentities,refetchInterval:60_000});
}
// Shared by the list and the detail: one request at a time, localized errors,
// and a fresh access check whenever the backend refuses.
function useIdentityAction(refresh:()=>Promise<unknown>) {
  const {expire}=useAuth();
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const run=async(body:Record<string,unknown>,done:(data:Record<string,unknown>)=>string)=>{
    if(busy)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      setNotice(done(await identityRequest(body)));
      await refresh();
    } catch(e) {
      const code=staffErrorKey(e);setError(code);
      if(code==='sessionExpired')await expire();
      if(code==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
      throw e;
    } finally {setBusy(false);}
  };
  return {busy,error,notice,run};
}
function UsersRoute({detail=false}:{detail?:boolean}) {
  const access=useAccess(); const {id=''}=useParams();
  if (!access.data?.can_manage_staff) return <StateView kind="denied"/>;
  if (!detail) return <UsersData/>;
  return UUID.test(id) ? <UserDetailData key={id} id={id}/> : <StateView kind="notFound"/>;
}
function UsersData() {
  const {expire}=useAuth();
  const data=useIdentityDirectory();
  const {busy,error,notice,run}=useIdentityAction(()=>data.refetch());
  useEffect(()=>{if(data.error&&staffErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError)return <StateView kind={staffErrorKey(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  return <UsersPage directory={data.data} busy={busy} error={error} notice={notice}
    onInvite={(invite:IdentityInvite)=>run({action:'invite',...invite},result=>result.email_sent===false?'identity.invitedNoEmail':'identity.invited')}/>;
}
function UserDetailData({id}:{id:string}) {
  const {session,expire}=useAuth(); const {locale}=useLocale();
  const directory=useIdentityDirectory();
  const data=useQuery({queryKey:['identity-user',session?.user.id,id],queryFn:()=>getIdentity(id),refetchInterval:60_000});
  const {busy,error,notice,run}=useIdentityAction(async()=>{await data.refetch();await queryClient.invalidateQueries({queryKey:['identity']});});
  const failure=data.error??directory.error;
  useEffect(()=>{if(failure&&staffErrorKey(failure)==='sessionExpired') void expire();},[failure,expire]);
  if(data.isError&&staffErrorKey(data.error)==='identity.error.userNotFound')return <StateView kind="notFound"/>;
  if(failure)return <StateView kind={staffErrorKey(failure)==='accessDenied'?'denied':'error'} onRetry={()=>{void data.refetch();void directory.refetch();}}/>;
  if(!data.data||!directory.data)return <StateView kind="loading"/>;
  return <UserDetailPage detail={data.data} venues={directory.data.venues} roles={directory.data.roles} busy={busy} error={error} notice={notice}
    onAction={(action:IdentityAction,value)=>run({action,user_id:id,...(action==='set_role'?{role:value}:action==='set_assignments'?{venue_ids:value}:action==='send_recovery'?{locale}:{})},
      result=>action==='send_recovery'?'staff.recoverySent':result.changed===false?'identity.noChange':action==='revoke'?'identity.revoked':'identity.updated')}/>;
}
// Print Server fleet: platform Admin only (the same gate as Users and Staff).
// The backend validates every RPC again and answers 42501 when it refuses.
function useFleet() {
  const {session}=useAuth();
  return useQuery({queryKey:['ps-fleet',session?.user.id],queryFn:({signal})=>getFleet(signal),refetchInterval:30_000});
}
function PrintServersRoute({detail=false}:{detail?:boolean}) {
  const access=useAccess(); const {venueId=''}=useParams();
  if (!access.data?.can_manage_staff) return <StateView kind="denied"/>;
  if (!detail) return <PrintFleetData/>;
  return UUID.test(venueId) ? <PrintServerDetailData key={venueId} venueId={venueId}/> : <StateView kind="notFound"/>;
}
function PrintFleetData() {
  const {expire}=useAuth();
  const data=useFleet();
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data)return <PrintFleetPage rows={data.data}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
function PrintServerDetailData({venueId}:{venueId:string}) {
  const {session,expire}=useAuth();
  const fleet=useFleet();
  const state=useQuery({queryKey:['ps-state',session?.user.id,venueId],queryFn:({signal})=>getPanelState(venueId,signal),refetchInterval:10_000});
  // The one-time enrollment code never passes through here: the page keeps it in its own state.
  const api=useMemo(()=>withFailureHook(printServerApi,async key=>{
    if(key==='sessionExpired')await expire();
    if(key==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
  }),[expire]);
  const failure=state.error??fleet.error;
  useEffect(()=>{if(failure&&psErrorKey(failure)==='sessionExpired') void expire();},[failure,expire]);
  if(failure&&psErrorKey(failure)==='accessDenied')return <StateView kind="denied"/>;
  const venue=fleet.data?.find(row=>row.venue_id===venueId);
  // A failed background refetch keeps the page (and an open code dialog) mounted.
  if(state.data&&venue)return <PrintServerDetailPage venue={venue} state={state.data} api={api} stale={state.isError} refresh={async()=>{await state.refetch();void fleet.refetch();}}/>;
  if(failure)return <StateView kind="error" onRetry={()=>{void state.refetch();void fleet.refetch();}}/>;
  if(state.data===null||(fleet.data&&!venue))return <StateView kind="notFound"/>;
  return <StateView kind="loading"/>;
}
export default function App() {
  return <Routes>
    <Route path="/auth/login" element={<AuthRoute key="login" mode="login"/>}/>
    <Route path="/auth/forgot" element={<AuthRoute key="forgot" mode="forgot"/>}/>
    <Route path="/auth/password" element={<AuthRoute key="password" mode="password"/>}/>
    <Route path="/auth/invitation" element={<InvitationRoute/>}/>
    <Route path="/auth/complete" element={<Complete/>}/>
    <Route path="/" element={<Scope scope="owner"><OwnerRoute/></Scope>}/>
    <Route path="/admin" element={<Scope scope="admin"><DirectoryRoute home/></Scope>}/>
    <Route path="/admin/staff" element={<Scope scope="admin"><StaffRoute/></Scope>}/>
    <Route path="/admin/users" element={<Scope scope="admin"><UsersRoute/></Scope>}/>
    <Route path="/admin/users/:id" element={<Scope scope="admin"><UsersRoute detail/></Scope>}/>
    <Route path="/admin/print-servers" element={<Scope scope="admin"><PrintServersRoute/></Scope>}/>
    <Route path="/admin/print-servers/:venueId" element={<Scope scope="admin"><PrintServersRoute detail/></Scope>}/>
    <Route path="/admin/tenants" element={<Scope scope="admin"><DirectoryRoute/></Scope>}/>
    <Route path="/admin/tenants/:id" element={<Scope scope="admin"><DetailRoute/></Scope>}/>
    <Route path="*" element={<OutsideState kind="notFound"/>}/>
  </Routes>;
}
