import { PrintDashboardPage } from './pages/PrintDashboardPage';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { destination, preferredScope, chooseScope, safeNext } from './lib/access';
import { getStaff, staffRequest, staffErrorKey, acceptInvitation } from './lib/staff';
import { StaffPage, type StaffMember } from './pages/StaffPage';
import { getVenueUsers, venueUsersRequest, type VenueUser, type VenueUserAction, type VenueUserInvite } from './lib/venueUsers';
import { VenueUsersTab } from './pages/VenueUsersTab';
import { getOwnerUsers, ownerUsersRequest, type OwnerUser, type OwnerUserAction, type OwnerUserInvite } from './lib/ownerUsers';
import { OwnerUsersSection } from './pages/OwnerUsersSection';
import { InvitationPage } from './pages/InvitationPage';
import { getFleet, getInventory, getPanelState, printServerApi, psErrorKey, withFailureHook } from './lib/printServerApi';
import { PrintFleetPage } from './pages/PrintFleetPage';
import { PrintServerDetailPage } from './pages/PrintServerDetailPage';
import { PrintFirmwaresPage } from './pages/PrintFirmwaresPage';
import { getFirmwares } from './lib/firmware';
import { PrintDevicesPage } from './pages/PrintDevicesPage';
import { getInventoryDevices } from './lib/psDevice';
import { PrintUpdatesPage } from './pages/PrintUpdatesPage';
import { getOtaOverview } from './lib/ota';
import { Brand } from './components/Brand';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useOwnDisplayName } from './hooks/useOwnProfile';
import { useAccess, useDirectory, useOwnerVenue, useTenantDetail } from './hooks/usePortalData';
import { errorCode } from './lib/errors';
import { useOwnerNavigation } from './hooks/useOwnerNavigation';
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
  const access=useAccess();
  const {venues,selectedId,known,section,onSelect}=useOwnerNavigation(access.data?.owner_venues??[]);
  const detail=useOwnerVenue(known?selectedId:'');
  if(!selectedId)return <OwnerPage venues={venues} selectedId="" section={section} onSelect={onSelect}/>;
  if(!known)return <StateView kind="denied"/>;
  if(detail.isPending)return <StateView kind="loading"/>;
  if(detail.isError)return <StateView kind={errorCode(detail.error)==='accessDenied'?'denied':'error'} onRetry={()=>void detail.refetch()}/>;
  const selected=detail.data?.find(venue=>venue.id===selectedId);
  if(!selected)return <StateView kind="denied"/>;
  if(section==='users'&&selected.is_owner!==true)return <StateView kind="denied"/>;
  return <OwnerPage key={selectedId} venues={venues.map(venue=>venue.id===selectedId?selected:venue)} selectedId={selectedId} section={section} onSelect={onSelect}
    users={section==='users'&&selected.is_owner===true?<OwnerUsersData key={selectedId} venueId={selectedId}/>:undefined}
    printServers={section==='print-servers'?<VenuePrintServerData key={selectedId} venue={selected} scope="owner"/>:undefined}/>;
}
// Members of the owner's venue: one request at a time, localized errors, and a fresh
// access check whenever the backend refuses (it decides ownership on every call).
function OwnerUsersData({venueId}:{venueId:string}) {
  const {session,expire}=useAuth();
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null);
  const data=useQuery({queryKey:['owner-users',session?.user.id,venueId],queryFn:()=>getOwnerUsers(venueId),refetchInterval:60_000});
  useEffect(()=>{
    if(data.error&&staffErrorKey(data.error)==='sessionExpired')void expire();
    if(data.error&&staffErrorKey(data.error)==='accessDenied')void queryClient.invalidateQueries({queryKey:['access']});
  },[data.error,expire]);
  const run=async(body:Record<string,unknown>,done:(result:Record<string,unknown>)=>string)=>{
    if(busy)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      setNotice(done(await ownerUsersRequest(venueId,body)));
      await data.refetch();
    } catch(e) {
      const code=staffErrorKey(e);setError(code);
      if(code==='sessionExpired')await expire();
      if(code==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
      if(['identity.error.notMember','identity.error.alreadyMember','ownerUsers.error.protectedOwner','ownerUsers.error.notOwner','ownerUsers.error.lastOwner','ownerUsers.error.busyRetry'].includes(code))void data.refetch();
      throw e;
    } finally {setBusy(false);}
  };
  if(data.error&&staffErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.error&&staffErrorKey(data.error)==='sessionExpired')return <StateView kind="loading"/>;
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError&&!data.data)return <StateView kind={staffErrorKey(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  if(!data.data)return <StateView kind="loading"/>;
  return <OwnerUsersSection data={data.data} busy={busy} error={error} notice={notice}
    onInvite={(invite:OwnerUserInvite)=>run({action:'invite',...invite},result=>Number(result.notify_failed)>0
      ? result.email_sent===false?'ownerUsers.invitedNoEmailNoticeFailed':'ownerUsers.ownerInviteNoticeFailed'
      : result.email_sent===false?'ownerUsers.invitedNoEmail':'ownerUsers.invited')}
    onOwnerChange={(operation,person,role)=>run({action:'owner_change',operation,user_id:person.user_id,confirm:true,...(operation==='demote'?{role}:{})},
      result=>result.changed===false?'identity.noChange':Number(result.notify_failed)>0?'ownerUsers.ownerNoticeFailed':operation==='remove'?'ownerUsers.ownerRemoved':'ownerUsers.ownerUpdated')}
    onAction={(action:OwnerUserAction,person:OwnerUser,value)=>run({action,user_id:person.user_id,...(action==='set_role'?{role:value}:{portal_access:value})},
      result=>result.changed===false?'identity.noChange':action==='set_role'?'identity.roleUpdated':value===true?'ownerUsers.portalGranted':'ownerUsers.portalRemoved')}/>;
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
  // Venue Users and Print Servers retain the existing platform Admin gate.
  const canManageUsers=access.data.can_manage_staff;
  if (tab!=='overview'&&!canManageUsers) return <StateView kind="denied"/>;
  if(!UUID.test(id))return <StateView kind="notFound"/>;
  return <DetailData id={id} tab={tab} canManageUsers={canManageUsers}/>;
}
function DetailData({id,tab,canManageUsers}:{id:string;tab:TenantTab;canManageUsers:boolean}) {
  const data=useTenantDetail(id);
  if(data.isPending)return <StateView kind="loading"/>;
  if(data.isError)return <StateView kind={errorCode(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  if(!data.data)return <StateView kind="notFound"/>;
  return <TenantDetailPage detail={data.data} tab={tab} users={canManageUsers?<VenueUsersData key={id} venueId={id}/>:undefined}
    printServers={canManageUsers?(tab==='print-server-detail'?<VenuePrintServerData key={id} venue={data.data.venue} scope="admin"/>:<PrintFleetData key={id} venueId={id}/>):undefined}/>;
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
  useEffect(()=>{
    if(data.error&&staffErrorKey(data.error)==='sessionExpired')void expire();
    if(data.error&&staffErrorKey(data.error)==='accessDenied')void queryClient.invalidateQueries({queryKey:['access']});
  },[data.error,expire]);
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
  if(data.error&&staffErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.error&&staffErrorKey(data.error)==='sessionExpired')return <StateView kind="loading"/>;
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
function PrintServersRoute({detail=false,list=false,firmwares=false,inventory=false,updates=false}:{detail?:boolean;list?:boolean;firmwares?:boolean;inventory?:boolean;updates?:boolean}) {
  const access=useAccess(); const {venueId=''}=useParams();
  if (!access.data?.can_manage_staff) return <StateView kind="denied"/>;
  if (firmwares) return <PrintFirmwaresData/>;
  if (inventory) return <PrintDevicesData/>;
  if (updates) return <PrintUpdatesData/>;
  if (!detail) return list ? <PrintFleetData/> : <PrintDashboardData/>;
  return UUID.test(venueId) ? <PrintServerDetailData key={venueId} venueId={venueId}/> : <StateView kind="notFound"/>;
}
function PrintDashboardData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-inventory',session?.user.id],queryFn:({signal})=>getInventory(signal),refetchInterval:30_000});
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.isError&&psErrorKey(data.error)==='sessionExpired')return <StateView kind="loading"/>;
  if(data.data)return <PrintDashboardPage inventory={data.data} refreshing={data.isFetching} stale={data.isError} onRefresh={()=>void data.refetch()}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// Firmware releases: platform Admin only; ps_firmware_list answers 42501 to anyone else.
function PrintFirmwaresData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-firmwares',session?.user.id],queryFn:({signal})=>getFirmwares(signal),refetchInterval:60_000});
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data)return <PrintFirmwaresPage data={data.data} refreshing={data.isFetching} onRefresh={()=>data.refetch()}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// OTA of the Print Server app (PE-385): platform Admin only; ps_ota_admin_overview answers 42501 otherwise.
function PrintUpdatesData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-ota',session?.user.id],queryFn:({signal})=>getOtaOverview(signal),refetchInterval:10_000});
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data)return <PrintUpdatesPage data={data.data} refreshing={data.isFetching} onRefresh={()=>data.refetch()}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// Inventory of Print Server units: platform Admin only; portal_ps_devices answers 42501 otherwise.
function PrintDevicesData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-devices',session?.user.id],queryFn:({signal})=>getInventoryDevices(signal),refetchInterval:30_000});
  const venues=useDirectory();
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data&&venues.data)return <PrintDevicesPage devices={data.data} venues={venues.data} onChanged={()=>data.refetch()}/>;
  if(data.isError||venues.isError)return <StateView kind="error" onRetry={()=>{void data.refetch();void venues.refetch();}}/>;
  return <StateView kind="loading"/>;
}
function PrintFleetData({venueId}:{venueId?:string}) {
  const {expire}=useAuth();
  const data=useFleet();
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.isError&&venueId)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  if(data.data)return <PrintFleetPage rows={data.data} venueId={venueId} detailHref={venueId === undefined ? undefined : () => `/admin/tenants/${encodeURIComponent(venueId)}/print-servers/detail`}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// Global routes may read the fleet; an embedded venue section never needs it.
function PrintServerDetailData({venueId}:{venueId:string}) {
  const {expire}=useAuth();
  const fleet=useFleet();
  useEffect(()=>{if(fleet.error&&psErrorKey(fleet.error)==='sessionExpired')void expire();},[fleet.error,expire]);
  if(fleet.isError)return <StateView kind={psErrorKey(fleet.error)==='accessDenied'?'denied':'error'} onRetry={()=>void fleet.refetch()}/>;
  if(!fleet.data)return <StateView kind="loading"/>;
  const row=fleet.data.find(item=>item.venue_id===venueId);
  if(!row)return <StateView kind="notFound"/>;
  const venue:OwnerVenue={id:row.venue_id,name:row.venue_name,slug:row.venue_slug,is_active:row.venue_is_active,
    city:null,state:null,address:null,phone:null,email:null,timezone:null};
  return <VenuePrintServerData key={venueId} venue={venue} scope="admin" embedded={false}/>;
}
// The same panel contract serves both scopes, always with the user's JWT and
// selected venue. Scope is presentation, never an authorization grant.
function VenuePrintServerData({venue,scope,embedded=true}:{venue:OwnerVenue;scope:'owner'|'admin';embedded?:boolean}) {
  const {session,expire}=useAuth();
  const venueId=venue.id;
  const state=useQuery({queryKey:['ps-state',scope,session?.user.id,venueId],
    queryFn:({signal})=>getPanelState(venueId,signal,scope),refetchInterval:10_000});
  const api=useMemo(()=>withFailureHook(printServerApi,async key=>{
    if(key==='sessionExpired')await expire();
    if(key==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
  }),[expire]);
  useEffect(()=>{
    if(state.error&&psErrorKey(state.error)==='sessionExpired')void expire();
    if(state.error&&psErrorKey(state.error)==='accessDenied')void queryClient.invalidateQueries({queryKey:['access']});
  },[state.error,expire]);
  if(state.error&&psErrorKey(state.error)==='accessDenied')return <StateView kind="denied"/>;
  if(state.error&&psErrorKey(state.error)==='sessionExpired')return <StateView kind="loading"/>;
  if(state.data)return <PrintServerDetailPage scope={scope} embedded={embedded}
    venue={{venue_id:venue.id,venue_name:venue.name,venue_slug:venue.slug,venue_is_active:venue.is_active}}
    state={state.data} api={api} stale={state.isError} refresh={()=>state.refetch()}/>;
  if(state.isError)return <StateView kind="error" onRetry={()=>void state.refetch()}/>;
  if(state.data===null)return <StateView kind="notFound"/>;
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
  const ownerContext=useOwnerNavigation(access.data?.owner_venues??[]);
  const ownerDetail=useOwnerVenue(navigationAllowed&&scope==='owner'&&ownerContext.known?ownerContext.selectedId:'');
  const canManageUsers=!ownerDetail.isError&&ownerDetail.data?.some(venue=>venue.id===ownerContext.selectedId&&venue.is_owner===true)===true;
  if (!auth.session) return <>{children}</>;
  return <PortalShell scope={scope} email={auth.session.user.email??''} displayName={name}
    navigationAllowed={navigationAllowed} canAdmin={navigationAllowed&&canAdmin} canOwner={navigationAllowed&&canOwner}
    canManageStaff={navigationAllowed&&!!access.data?.can_manage_staff} canViewTenants={navigationAllowed&&!!access.data?.can_view_tenants}
    ownerContext={navigationAllowed&&scope==='owner'?{...ownerContext,canManageUsers}:undefined}
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
    <Route path="/admin/print-servers/list" element={<Scope scope="admin"><PrintServersRoute list/></Scope>}/>
    <Route path="/admin/print-servers/inventory" element={<Scope scope="admin"><PrintServersRoute inventory/></Scope>}/>
    <Route path="/admin/print-servers/firmwares" element={<Scope scope="admin"><PrintServersRoute firmwares/></Scope>}/>
    <Route path="/admin/print-servers/updates" element={<Scope scope="admin"><PrintServersRoute updates/></Scope>}/>
    <Route path="/admin/print-servers/:venueId" element={<Scope scope="admin"><PrintServersRoute detail/></Scope>}/>
    <Route path="/admin/tenants" element={<Scope scope="admin"><DirectoryRoute/></Scope>}/>
    <Route path="/admin/tenants/:id" element={<Scope scope="admin"><DetailRoute/></Scope>}/>
    <Route path="/admin/tenants/:id/print-servers" element={<Scope scope="admin"><DetailRoute tab="print-servers"/></Scope>}/>
    <Route path="/admin/tenants/:id/print-servers/detail" element={<Scope scope="admin"><DetailRoute tab="print-server-detail"/></Scope>}/>
    <Route path="/admin/tenants/:id/users" element={<Scope scope="admin"><DetailRoute tab="users"/></Scope>}/>
    <Route path="*" element={<OutsideState kind="notFound"/>}/>
  </Routes></AuthenticatedLayout>;
}
