import { useQuery } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { destination, preferredScope, chooseScope, safeNext } from './lib/access';
import { getStaff, staffRequest, staffErrorKey, acceptInvitation } from './lib/staff';
import { StaffPage, type StaffMember } from './pages/StaffPage';
import { getVenueUsers, venueUsersRequest, type VenueUser, type VenueUserAction, type VenueUserInvite } from './lib/venueUsers';
import { VenueUsersTab } from './pages/VenueUsersTab';
import { InvitationPage } from './pages/InvitationPage';
import { getFleet, getPanelState, printServerApi, psErrorKey, withFailureHook } from './lib/printServerApi';
import { PrintFleetPage } from './pages/PrintFleetPage';
import { PrintServerDetailPage } from './pages/PrintServerDetailPage';
import { Brand } from './components/Brand';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useOwnDisplayName } from './hooks/useOwnProfile';
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
import { TenantDetailPage, type TenantTab } from './pages/TenantDetailPage';

function Standalone({children}:{children:ReactNode}) {
  const {session}=useAuth();
  if (session) return <>{children}</>;
  return <div className="standalone"><header className="standalone-header"><Link className="brand" to="/auth/complete"><Brand/></Link><div className="topbar-actions"><LanguageSelector/></div></header>{children}</div>;
}
function OutsideState(props:Parameters<typeof StateView>[0]) {
  const {session}=useAuth(); const {t}=useLocale();
  return <Standalone><StateView {...props} allowHome={!session}/>{props.kind==='denied'&&session&&<div className="auth-invalid"><Link className="button button-secondary" to="/auth/invitation">{t('staff.acceptInvitation')}</Link></div>}</Standalone>;
}
function Scope({scope,children}:{scope:'owner'|'admin';children:ReactNode}) {
  const auth=useAuth(); const access=useAccess(); const location=useLocation();
  useEffect(() => { if (access.error && errorCode(access.error)==='sessionExpired') void auth.expire(); },[access.error, auth.expire]);
  if (auth.loading) return <OutsideState kind="loading"/>;
  if (!auth.session) return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname+location.search)}`} replace/>;
  if (auth.recovery || auth.invitation) return <Navigate to="/auth/password" replace/>;
  if (access.isPending) return <OutsideState kind="loading"/>;
  if (access.isError || !access.data) return <OutsideState kind="error" onRetry={()=>void access.refetch()}/>;
  const canAdmin=access.data.is_platform_staff;
  const canOwner=access.data.owner_venues.length>0;
  const allowed=scope==='admin'?canAdmin:canOwner;
  // Mount protected route components only after resolving authorization.
  if (!allowed) {
    const target=destination(access.data);
    return target ? <Navigate to={target} replace/> : <OutsideState kind="denied"/>;
  }
  if (scope==='owner' && canAdmin && preferredScope(auth.session.user.id)!=='owner') return <Navigate to="/admin" replace/>;
  return <>{children}</>;
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
  return <AuthPage embedded={!!auth.session} mode={mode} onSubmit={submit} error={error??(mode==='login'&&auth.expired?'sessionExpired':null)} busy={busy} success={success} recovery={auth.recovery||recoveryRequest} invitation={auth.invitation||invitationRequest}/>;
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
function DetailRoute({tab='overview'}:{tab?:TenantTab}) {
  const access=useAccess(); const {id=''}=useParams();
  if (!access.data?.can_view_tenants) return <StateView kind="denied"/>;
  // Venue users: platform Admin only, the gate the retired /admin/users had.
  const canManageUsers=access.data.can_manage_staff;
  if (tab==='users'&&!canManageUsers) return <StateView kind="denied"/>;
  if(!UUID.test(id))return <StateView kind="notFound"/>;
  return <DetailData id={id} tab={tab} canManageUsers={canManageUsers}/>;
}
function DetailData({id,tab,canManageUsers}:{id:string;tab:TenantTab;canManageUsers:boolean}) {
  const data=useTenantDetail(id);
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError)return <StateView kind={errorCode(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  if(!data.data)return <StateView kind="notFound"/>;
  return <TenantDetailPage detail={data.data} tab={tab} users={canManageUsers?<VenueUsersData key={id} venueId={id}/>:undefined}/>;
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
// Users of one venue (Users tab of /admin/tenants/:id): one request at a time,
// localized errors, and a fresh access check whenever the backend refuses.
function VenueUsersData({venueId}:{venueId:string}) {
  const {session,expire}=useAuth(); const {locale}=useLocale();
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const data=useQuery({queryKey:['venue-users',session?.user.id,venueId],queryFn:()=>getVenueUsers(venueId),refetchInterval:60_000});
  useEffect(()=>{if(data.error&&staffErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  const run=async(body:Record<string,unknown>,done:(result:Record<string,unknown>)=>string)=>{
    if(busy)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      setNotice(done(await venueUsersRequest(venueId,body)));
      await data.refetch();
    } catch(e) {
      const code=staffErrorKey(e);setError(code);
      if(code==='sessionExpired')await expire();
      if(code==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
      // The list changed under this request (already removed, already a member): show the current one.
      if(code==='identity.error.notMember'||code==='identity.error.alreadyMember'||code==='identity.error.userNotFound')void data.refetch();
      throw e;
    } finally {setBusy(false);}
  };
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError&&!data.data) {
    const code=staffErrorKey(data.error);
    return <StateView kind={code==='accessDenied'?'denied':code==='identity.error.venueNotFound'?'notFound':'error'} onRetry={()=>void data.refetch()}/>;
  }
  if(!data.data)return <StateView kind="loading"/>;
  return <VenueUsersTab data={data.data} busy={busy} error={error} notice={notice}
    onInvite={(invite:VenueUserInvite)=>run({action:'invite',...invite},result=>result.created===false?'identity.addedExisting':result.email_sent===false?'identity.invitedNoEmail':'identity.invited')}
    onAction={(action:VenueUserAction,person:VenueUser,value)=>run({action,user_id:person.user_id,...(action==='set_role'?{role:value}:action==='send_recovery'?{locale}:{})},
      result=>action==='send_recovery'?'staff.recoverySent':result.changed===false?'identity.noChange':action==='set_role'?'identity.roleUpdated':Number(result.remaining_venue_count)>0?'identity.revokedKeepsOthers':'identity.revoked')}/>;
}
// Print Server fleet: platform Admin only (the same gate as venue users and Staff).
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
// One shell instance survives route changes, including access checks and auth flows.
// Its visual structure grants no permission: Scope remains the data-mount gate.
function AuthenticatedLayout({children}:{children:ReactNode}) {
  const auth=useAuth(); const {pathname}=useLocation();
  const restricted=pathname.startsWith('/auth/');
  const access=useAccess(!restricted);
  useEffect(() => { if (access.error && errorCode(access.error)==='sessionExpired') void auth.expire(); },[access.error, auth.expire]);
  const canAdmin=!!access.data?.is_platform_staff;
  const canOwner=!!access.data?.owner_venues.length;
  const scope=pathname.startsWith('/admin')?'admin':pathname==='/'?'owner':
    canAdmin&&preferredScope(auth.session?.user.id??'')!=='owner'?'admin':'owner';
  const navigationAllowed=!!auth.session&&!auth.loading&&!auth.recovery&&!auth.invitation&&!restricted&&access.isSuccess&&
    (scope==='admin'?canAdmin:canOwner&&(!canAdmin||preferredScope(auth.session?.user.id??'')==='owner'));
  const name=useOwnDisplayName(navigationAllowed);
  if (!auth.session) return <>{children}</>;
  return <PortalShell scope={scope} email={auth.session.user.email??''} displayName={name}
    navigationAllowed={navigationAllowed} canAdmin={navigationAllowed&&canAdmin} canOwner={navigationAllowed&&canOwner}
    canManageStaff={navigationAllowed&&!!access.data?.can_manage_staff} canViewTenants={navigationAllowed&&!!access.data?.can_view_tenants}
    onSwitchScope={next=>chooseScope(auth.session!.user.id,next)} onLogout={auth.logout}>
    {children}
  </PortalShell>;
}
export default function App() {
  return <AuthenticatedLayout><Routes>
    <Route path="/auth/login" element={<AuthRoute key="login" mode="login"/>}/>
    <Route path="/auth/forgot" element={<AuthRoute key="forgot" mode="forgot"/>}/>
    <Route path="/auth/password" element={<AuthRoute key="password" mode="password"/>}/>
    <Route path="/auth/invitation" element={<InvitationRoute/>}/>
    <Route path="/auth/complete" element={<Complete/>}/>
    <Route path="/" element={<Scope scope="owner"><OwnerRoute/></Scope>}/>
    <Route path="/admin" element={<Scope scope="admin"><DirectoryRoute home/></Scope>}/>
    <Route path="/admin/staff" element={<Scope scope="admin"><StaffRoute/></Scope>}/>
    {/* PE-328: the global user list is retired; venue users live in each venue's Users tab. */}
    <Route path="/admin/users" element={<Navigate to="/admin/tenants" replace/>}/>
    <Route path="/admin/users/:id" element={<Navigate to="/admin/tenants" replace/>}/>
    <Route path="/admin/print-servers" element={<Scope scope="admin"><PrintServersRoute/></Scope>}/>
    <Route path="/admin/print-servers/:venueId" element={<Scope scope="admin"><PrintServersRoute detail/></Scope>}/>
    <Route path="/admin/tenants" element={<Scope scope="admin"><DirectoryRoute/></Scope>}/>
    <Route path="/admin/tenants/:id" element={<Scope scope="admin"><DetailRoute/></Scope>}/>
    <Route path="/admin/tenants/:id/users" element={<Scope scope="admin"><DetailRoute tab="users"/></Scope>}/>
    <Route path="*" element={<OutsideState kind="notFound"/>}/>
  </Routes></AuthenticatedLayout>;
}
