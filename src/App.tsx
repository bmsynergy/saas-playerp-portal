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
import { bindPrintServer, createEnrollment, getInventory, getPanelState, printServerApi, psErrorKey, setPrinterPrintServer, withFailureHook, SelectionRequiredError } from './lib/printServerApi';
import { adminSheetHref, deviceName, getVenueDevices, ownerSheetHref, resolveDeviceSheet, type VenueDevice } from './lib/psVenueDevices';
import { VenuePrintServersPage } from './pages/VenuePrintServersPage';
import { PrintServersListPage } from './pages/PrintServersListPage';
import { getPsVenueOverview } from './lib/psVenueOverview';
import { DeviceAdminSummary } from './components/DeviceAdminSummary';
import { PortalDialog } from './components/PortalDialog';
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
import { OAuthConsentPage } from './pages/OAuthConsentPage';
import { consentRequestId, consentPath } from './lib/oauthConsent';

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
  const {venues,selectedId,known,section,device,onSelect}=useOwnerNavigation(access.data?.owner_venues??[]);
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
    printServers={section==='print-servers'?(device?<DeviceSheetData key={`${selectedId}:${device}`} id={device} scope="owner" expectedVenueId={selectedId}/>:<VenueDevicesData key={selectedId} venue={selected} scope="owner"/>):undefined}/>;
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
    printServers={canManageUsers?(tab==='print-server-detail'?<VenueRedirect key={id} venueId={id}/>:<VenueDevicesData key={id} venue={data.data.venue} scope="admin"/>):undefined}/>;
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
  if(data.isError) {
    const code=staffErrorKey(data.error);
    return <StateView kind={code==='accessDenied'?'denied':code==='identity.error.venueNotFound'?'notFound':'error'} onRetry={()=>void data.refetch()}/>;
  }
  if(!data.data)return <StateView kind="loading"/>;
  return <VenueUsersTab data={data.data} busy={busy} error={error} notice={notice}
    onInvite={(invite:VenueUserInvite)=>run({action:'invite',...invite},result=>result.created===false?'identity.addedExisting':result.email_sent===false?'identity.invitedNoEmail':'identity.invited')}
    onAction={(action:VenueUserAction,person:VenueUser,value)=>run({action,user_id:person.user_id,...(action==='set_role'?{role:value}:action==='send_recovery'?{locale}:{})},
      result=>action==='send_recovery'?'staff.recoverySent':result.changed===false?'identity.noChange':action==='set_role'?'identity.roleUpdated':'identity.revoked')}/>;
}
// Print Server fleet: platform Admin only (the same gate as venue users and Staff).
// The backend validates every RPC again and answers 42501 when it refuses.
function PrintServersRoute({detail=false,list=false,firmwares=false,inventory=false,updates=false,device=false}:{detail?:boolean;list?:boolean;firmwares?:boolean;inventory?:boolean;updates?:boolean;device?:boolean}) {
  const access=useAccess(); const {venueId='',id=''}=useParams();
  if (!access.data?.can_manage_staff) return <StateView kind="denied"/>;
  if (firmwares) return <PrintFirmwaresData/>;
  if (inventory) return <PrintDevicesData/>;
  if (updates) return <PrintUpdatesData/>;
  if (device) return UUID.test(id) ? <DeviceSheetData key={id} id={id} scope="admin"/> : <StateView kind="notFound"/>;
  if (!detail) return list ? <PrintServersListData/> : <PrintDashboardData/>;
  return UUID.test(venueId) ? <VenueRedirect key={venueId} venueId={venueId}/> : <StateView kind="notFound"/>;
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
  const error=data.error;
  useEffect(()=>{if(error&&psErrorKey(error)==='sessionExpired') void expire();},[error,expire]);
  const refresh=async()=>{await Promise.all([
    data.refetch({throwOnError:true}),
    queryClient.invalidateQueries({queryKey:['ps-ota',session?.user.id]}),
    queryClient.invalidateQueries({queryKey:['ps-ota-page',session?.user.id]}),
    queryClient.invalidateQueries({queryKey:['ps-admin-device',session?.user.id]}),
    queryClient.invalidateQueries({queryKey:['ps-device',session?.user.id]}),
    queryClient.invalidateQueries({queryKey:['ps-panel-ota',session?.user.id]}),
  ]);};
  if(error&&psErrorKey(error)==='accessDenied')return <StateView kind="denied"/>;
  // A failed lifecycle refresh invalidates the displayed authorization snapshot. Do not
  // expose new mutations from cached eligibility; the backend must still revalidate writes.
  if(error)return <StateView kind="error" onRetry={()=>{void refresh().catch(()=>{});}}/>;
  if(data.data)return <PrintFirmwaresPage data={data.data} refreshing={data.isFetching} onRefresh={refresh}/>;
  return <StateView kind="loading"/>;
}
// OTA of the Print Server app (PE-385): platform Admin only; ps_ota_admin_overview answers 42501 otherwise.
function PrintUpdatesData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-ota',session?.user.id],queryFn:({signal})=>getOtaOverview(signal),refetchInterval:10_000});
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  if(data.data)return <PrintUpdatesPage data={data.data} refreshing={data.isFetching} onRefresh={()=>data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// Inventory of Print Server units: platform Admin only; portal_ps_devices answers 42501 otherwise.
function PrintDevicesData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-devices',session?.user.id],queryFn:({signal})=>getInventoryDevices(signal),refetchInterval:30_000});
  const venues=useDirectory();
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.isError||venues.isError)return <StateView kind="error" onRetry={()=>{void data.refetch();void venues.refetch();}}/>;
  if(data.data&&venues.data)return <PrintDevicesPage devices={data.data} venues={venues.data} onChanged={async()=>{ await Promise.all([data.refetch(), queryClient.invalidateQueries({queryKey:['ps-venue-overview']}), queryClient.invalidateQueries({queryKey:['ps-inventory']}), queryClient.invalidateQueries({queryKey:['ps-sheet-resolve']})]); }}/>;
  return <StateView kind="loading"/>;
}
// PE-447: venue aggregates share the backend inventory connection and attention rules.
function PrintServersListData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-venue-overview',session?.user.id],queryFn:({signal})=>getPsVenueOverview(signal),refetchInterval:30_000});
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data)return <PrintServersListPage overview={data.data}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// Session/permission side effects shared by the Print Server reads.
function usePsFailure(error:unknown) {
  const {expire}=useAuth();
  useEffect(()=>{
    if(error&&psErrorKey(error)==='sessionExpired')void expire();
    if(error&&psErrorKey(error)==='accessDenied')void queryClient.invalidateQueries({queryKey:['access']});
  },[error,expire]);
}
function useBoundApi(printServerId:string|null) {
  const {expire}=useAuth();
  return useMemo(()=>{
    const api=withFailureHook(printServerApi,async key=>{
      if(key==='sessionExpired')await expire();
      if(key==='accessDenied')await queryClient.invalidateQueries({queryKey:['access']});
    });
    return printServerId?bindPrintServer(api,printServerId):api;
  },[expire,printServerId]);
}
function useVenueDevices(venueId:string,scope:'owner'|'admin',enabled=true) {
  const {session}=useAuth();
  return useQuery({queryKey:['ps-venue-devices',scope,session?.user.id,venueId],queryFn:({signal})=>getVenueDevices(venueId,signal),refetchInterval:15_000,enabled:enabled&&!!venueId});
}
const venueListHref=(scope:'owner'|'admin',venueId:string)=>scope==='admin'?`/admin/tenants/${encodeURIComponent(venueId)}/print-servers`:`/?venue=${encodeURIComponent(venueId)}&section=print-servers`;
const sheetHref=(scope:'owner'|'admin',venueId:string,id:string)=>scope==='admin'?adminSheetHref(id):ownerSheetHref(venueId,id);
// Old venue-scoped URL: exactly one device opens its sheet; otherwise the venue list (never "the first").
function VenueRedirect({venueId}:{venueId:string}) {
  const data=useVenueDevices(venueId,'admin');
  usePsFailure(data.error);
  if(data.isError)return <StateView kind={psErrorKey(data.error)==='accessDenied'?'denied':'error'} onRetry={()=>void data.refetch()}/>;
  if(!data.data)return <StateView kind="loading"/>;
  return <Navigate to={data.data.devices.length===1?adminSheetHref(data.data.devices[0].id):venueListHref('admin',venueId)} replace/>;
}
// All authorized devices of one venue (admin tenant tab and owner section).
function VenueDevicesData({venue,scope,choose=false}:{venue:Pick<OwnerVenue,'id'|'name'>;scope:'owner'|'admin';choose?:boolean}) {
  const data=useVenueDevices(venue.id,scope);
  usePsFailure(data.error);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data)return <VenuePrintServersPage data={data.data} choose={choose} hrefFor={(device:VenueDevice)=>sheetHref(scope,venue.id,device.id)}
    extra={scope==='admin'&&data.data.can_manage?<AddPrintServer venueId={venue.id} venueName={venue.name} onDone={()=>data.refetch()}/>:undefined}
    onAssignPrinter={async(printerId,printServerId)=>{await setPrinterPrintServer(printerId,printServerId);await data.refetch();}}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
// Adds a NEW Print Server to the venue (enrollment without p_print_server_id: nobody is revoked).
// The one-time code lives only in this component's state.
function AddPrintServer({venueId,venueName,onDone}:{venueId:string;venueName:string;onDone:()=>Promise<unknown>}) {
  const {t}=useLocale();
  const [label,setLabel]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const [code,setCode]=useState<{code:string;expires_at:string|null}|null>(null);
  const submit=async()=>{
    if(busy)return; setBusy(true); setError(null);
    try { const out=await createEnrollment(venueId,label); setCode({code:out.enrollment_code,expires_at:out.expires_at}); setLabel(''); await onDone(); }
    catch(e){setError(t(psErrorKey(e)));} finally {setBusy(false);}
  };
  return <div className="ps-section-body" data-testid="venue-ps-add">
    <p className="staff-self-note">{t('psm.addPsLead')}</p>
    <div className="staff-actions ps-actions">
      <label className="field ps-inline-field"><span>{t('ps.enrollLabel')}</span><div className="field-control"><input type="text" data-testid="venue-ps-add-label" autoComplete="off" maxLength={80} value={label} onChange={event=>setLabel(event.target.value)} placeholder={t('ps.enrollLabelPlaceholder')} disabled={busy}/></div></label>
      <button type="button" className="button button-primary" data-testid="venue-ps-add-submit" disabled={busy} onClick={()=>void submit()}>{t('psm.addPs')}</button>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {code&&<PortalDialog title={t('ps.enrollment.title')} titleId="venue-ps-add-title" testId="enrollment-dialog" onClose={()=>setCode(null)} actions={<button type="button" className="button button-secondary" data-testid="enrollment-close" onClick={()=>setCode(null)}>{t('ps.enrollment.close')}</button>}>
      <p className="ps-dialog-venue">{t('ps.confirm.venue')}: <strong>{venueName}</strong></p>
      <p>{t('ps.enrollment.lead')}</p>
      <code className="ps-code" data-testid="enrollment-code">{code.code}</code>
      <p className="ps-dialog-warning">{t('ps.enrollment.once')}</p>
    </PortalDialog>}
  </div>;
}
// PE-443 device sheet by stable id (print_server_id, or inventory id when not active).
// ps_device_sheet_resolve decides kind/venue/permission; every later call names this PS.
function DeviceSheetData({id,scope,expectedVenueId}:{id:string;scope:'owner'|'admin';expectedVenueId?:string}) {
  const {session}=useAuth(); const {t}=useLocale();
  const ref=useQuery({queryKey:['ps-sheet-resolve',scope,session?.user.id,id],queryFn:({signal})=>resolveDeviceSheet(id,signal),retry:false});
  usePsFailure(ref.error);
  if(ref.isError)return <StateView kind={psErrorKey(ref.error)==='accessDenied'?'denied':psErrorKey(ref.error)==='ps.error.printServerNotFound'?'notFound':'error'} onRetry={()=>void ref.refetch()}/>;
  if(!ref.data)return <StateView kind="loading"/>;
  const r=ref.data;
  // The URL never grants access: an owner sheet must belong to the selected venue.
  if(expectedVenueId&&r.venue_id!==expectedVenueId)return <StateView kind="denied"/>;
  const back=r.venue_id?{href:venueListHref(scope,r.venue_id),label:t('psm.backToVenue')}:{href:'/admin/print-servers/list',label:t('psm.backToList')};
  if(r.kind==='inventory'||!r.print_server_id||!r.venue_id) return <div className="page-stack staff-page" data-testid="ps-inventory-sheet">
    <Link className="back-link" to={back.href}>{back.label}</Link>
    <div className="page-heading detail-heading"><div><p className="eyebrow">{t('psm.sheetEyebrow')}</p><h1>{t('printServer')}</h1><p>{t('psm.inventoryLead')}</p></div></div>
    <section className="detail-panel"><div className="detail-grid">
      <div className="detail-item"><div><span className="detail-item-label">{t('psm.linkedVenue')}</span><strong>{r.venue_name||t('psm.unassigned')}</strong></div></div>
      <div className="detail-item"><div><span className="detail-item-label">{t('state')}</span><strong>{r.status||t('notProvided')}</strong></div></div>
    </div></section>
    {scope==='admin'&&r.is_staff&&r.inventory_device_id&&<section className="detail-panel"><DeviceAdminSummary deviceId={r.inventory_device_id}/></section>}
  </div>;
  return <PrintServerSheetData key={r.print_server_id} printServerId={r.print_server_id} venueId={r.venue_id} venueName={r.venue_name??''} scope={scope} back={back} canManage={r.can_manage}/>;
}
function PrintServerSheetData({printServerId,venueId,venueName,scope,back,canManage}:{printServerId:string;venueId:string;venueName:string;scope:'owner'|'admin';back:{href:string;label:string};canManage:boolean}) {
  const {session}=useAuth();
  const state=useQuery({queryKey:['ps-state',scope,session?.user.id,venueId,printServerId],
    queryFn:({signal})=>getPanelState(venueId,signal,scope,printServerId),refetchInterval:10_000});
  const devices=useVenueDevices(venueId,scope,canManage);
  const api=useBoundApi(printServerId);
  usePsFailure(state.error);
  if(state.error instanceof SelectionRequiredError)return <VenueDevicesData venue={{id:venueId,name:venueName}} scope={scope} choose/>;
  if(state.error&&psErrorKey(state.error)==='accessDenied')return <StateView kind="denied"/>;
  if(state.error&&psErrorKey(state.error)==='sessionExpired')return <StateView kind="loading"/>;
  const targets=(devices.data?.devices??[]).filter(d=>d.print_server_id&&d.print_server_id!==printServerId&&(!d.status||d.status==='active'))
    .map(d=>({print_server_id:d.print_server_id!,name:`${deviceName(d)}${d.serial?` (${d.serial})`:''}`,label:d.label}));
  const refresh=async()=>{await Promise.all([state.refetch(),canManage?devices.refetch():Promise.resolve()]);};
  if(state.data)return <PrintServerDetailPage scope={scope} embedded={false} printServerId={printServerId} backHref={back.href} backLabel={back.label} replaceTargets={targets}
    venue={{venue_id:venueId,venue_name:venueName,venue_slug:null,venue_is_active:null}}
    state={state.data} api={api} stale={state.isError} refresh={refresh}/>;
  if(state.isError)return <StateView kind="error" onRetry={()=>void state.refetch()}/>;
  if(state.data===null)return <StateView kind="notFound"/>;
  return <StateView kind="loading"/>;
}
// One shell instance survives route changes, including access checks and auth flows.
// Its visual structure grants no permission: Scope remains the data-mount gate.
function AuthenticatedLayout({children}:{children:ReactNode}) {
  const auth=useAuth(); const {pathname}=useLocation();
  const restricted=pathname.startsWith('/auth/')||pathname.startsWith('/oauth/');
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
// PE-386 / PE-390.3: consent screen of the mcp-analytics OAuth server. Login first (keeping the request id); the
// venues offered come from mcp_consent_context (only the owner's own venues).
function OAuthConsentRoute() {
  const auth=useAuth(); const [params]=useSearchParams(); const {t}=useLocale();
  const requestId=consentRequestId(params);
  if (!requestId) return <Standalone><section className="oauth-consent"><h1>{t('oauth.title')}</h1><p role="alert">{t('oauth.invalid')}</p></section></Standalone>;
  if (auth.loading) return <OutsideState kind="loading"/>;
  if (!auth.session) return <Navigate to={`/auth/login?next=${encodeURIComponent(consentPath(requestId))}`} replace/>;
  if (auth.recovery || auth.invitation) return <Navigate to="/auth/password" replace/>;
  return <Standalone><OAuthConsentPage key={`${auth.session.user.id}:${requestId}`} requestId={requestId}/></Standalone>;
}
export default function App() {
  return <AuthenticatedLayout><Routes>
    <Route path="/auth/login" element={<AuthRoute key="login" mode="login"/>}/>
    <Route path="/auth/forgot" element={<AuthRoute key="forgot" mode="forgot"/>}/>
    <Route path="/auth/password" element={<AuthRoute key="password" mode="password"/>}/>
    <Route path="/auth/invitation" element={<InvitationRoute/>}/>
    <Route path="/auth/complete" element={<Complete/>}/>
    <Route path="/oauth/consent" element={<OAuthConsentRoute/>}/>
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
    <Route path="/admin/print-servers/devices/:id" element={<Scope scope="admin"><PrintServersRoute device/></Scope>}/>
    <Route path="/admin/print-servers/:venueId" element={<Scope scope="admin"><PrintServersRoute detail/></Scope>}/>
    <Route path="/admin/tenants" element={<Scope scope="admin"><DirectoryRoute/></Scope>}/>
    <Route path="/admin/tenants/:id" element={<Scope scope="admin"><DetailRoute/></Scope>}/>
    <Route path="/admin/tenants/:id/print-servers" element={<Scope scope="admin"><DetailRoute tab="print-servers"/></Scope>}/>
    <Route path="/admin/tenants/:id/print-servers/detail" element={<Scope scope="admin"><DetailRoute tab="print-server-detail"/></Scope>}/>
    <Route path="/admin/tenants/:id/users" element={<Scope scope="admin"><DetailRoute tab="users"/></Scope>}/>
    <Route path="*" element={<OutsideState kind="notFound"/>}/>
  </Routes></AuthenticatedLayout>;
}
