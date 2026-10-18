import { channelsReturnTo } from './lib/channelNavigation';
import { invalidatePsViews } from './lib/psInvalidation';
import { PrintDashboardPage } from './pages/PrintDashboardPage';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { destination, preferredScope, chooseScope, safeNext, canManageRings } from './lib/access';
import { getStaff, staffRequest, staffErrorKey, acceptInvitation } from './lib/staff';
import { StaffPage, type StaffMember } from './pages/StaffPage';
import { getVenueUsers, venueUsersRequest, type VenueUser, type VenueUserAction, type VenueUserInvite } from './lib/venueUsers';
import { VenueUsersTab } from './pages/VenueUsersTab';
import { getOwnerUsers, ownerUsersRequest, type OwnerUser, type OwnerUserAction, type OwnerUserInvite } from './lib/ownerUsers';
import { OwnerUsersSection } from './pages/OwnerUsersSection';
import { InvitationPage } from './pages/InvitationPage';
import { bindPrintServer, createEnrollment, getInventory, getPanelState, printServerApi, psErrorKey, setPrinterPrintServer, withFailureHook, SelectionRequiredError } from './lib/printServerApi';
import { adminSheetHref, deviceName, getVenueDevices, ownerSheetHref, type VenueDevice } from './lib/psVenueDevices';
import { getResolvedDevice, unlinkDevice, type ResolvedDevice } from './lib/psResolvedDevice';
import { psLinkErrorText } from './lib/psLink';
import { PsLinkStateBadge } from './components/PsLinkStateBadge';
import { VenuePrintServersPage } from './pages/VenuePrintServersPage';
import { PrintServersListPage } from './pages/PrintServersListPage';
import { getPsVenueOverview } from './lib/psVenueOverview';
import { InventoryDeviceSheet } from './components/InventoryDeviceSheet';
import { PsDeviceLinkPanel } from './components/PsDeviceLinkPanel';
import { PsDeviceSetup } from './components/PsDeviceSetup';
import { getAdminDeviceSheet } from './lib/psAdminDeviceSheet';
import { PortalDialog } from './components/PortalDialog';
import { PrintServerDetailPage } from './pages/PrintServerDetailPage';
import { PrintFirmwaresPage } from './pages/PrintFirmwaresPage';
import { PrintChannelsPage } from './pages/PrintChannelsPage';
import { PrintDevicesPage } from './pages/PrintDevicesPage';
import { getInventoryDevices } from './lib/psDevice';
import { assignDevice } from './lib/psDevice';
import { VenueCombobox } from './components/VenueCombobox';
import type { AdminVenueOption } from './lib/psAdminDevice';
import { PrintUpdatesPage } from './pages/PrintUpdatesPage';
import { getOtaOverview } from './lib/ota';
import { Brand } from './components/Brand';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Unlink } from 'lucide-react';
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
import { getMcpVenues, getMcpVenue, saveMcpVenue, mcpErrorKey, type McpFilters, type McpSave } from './lib/mcp';
import { McpVenueEditor } from './components/McpVenueEditor';
import { AdminMcpPage } from './pages/AdminMcpPage';
import { IntegrationsMcpSection } from './pages/IntegrationsMcpSection';

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
  if((section==='users'||section==='integrations')&&selected.is_owner!==true)return <StateView kind="denied"/>;
  return <OwnerPage key={selectedId} venues={venues.map(venue=>venue.id===selectedId?selected:venue)} selectedId={selectedId} section={section} onSelect={onSelect}
    users={section==='users'&&selected.is_owner===true?<OwnerUsersData key={selectedId} venueId={selectedId}/>:undefined}
    integrations={section==='integrations'&&selected.is_owner===true?<McpIntegrationData key={selectedId} venueId={selectedId}/>:undefined}
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
// PE-464: both surfaces share detail cache, editor and transactional save.
function McpIntegrationData({venueId,onDirtyChange,admin=false}:{venueId:string;onDirtyChange?:(dirty:boolean)=>void;admin?:boolean}) {
  const {session,expire}=useAuth();
  const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const key=['mcp-venue',session?.user.id,venueId];
  const data=useQuery({queryKey:key,queryFn:({signal})=>getMcpVenue(venueId,signal),refetchInterval:30_000});
  useEffect(()=>{
    if(data.error&&mcpErrorKey(data.error)==='sessionExpired')void expire();
    if(data.error&&mcpErrorKey(data.error)==='accessDenied')void queryClient.invalidateQueries({queryKey:['access']});
  },[data.error,expire]);
  const save=async(input:McpSave)=>{
    setBusy(true);setError(null);
    try {
      const result=await saveMcpVenue(input);
      queryClient.setQueryData(key,result);
      void queryClient.invalidateQueries({queryKey:['mcp-directory']});
      return result;
    } catch(e) {
      const code=mcpErrorKey(e);setError(code);
      if(code==='sessionExpired')await expire();
      if(code==='accessDenied')void queryClient.invalidateQueries({queryKey:['access']});
      throw e;
    } finally {setBusy(false);}
  };
  const reload=async()=>{const result=await data.refetch({throwOnError:true});setError(null);return result.data!;};
  if(data.error&&mcpErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.data) {
    const props={data:data.data,busy,error,onSave:save,onReload:reload,onDirtyChange};
    return admin?<McpVenueEditor {...props}/>:<IntegrationsMcpSection {...props}/>;
  }
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
function McpAdminRoute() {
  const access=useAccess();
  return access.data?.can_manage_staff ? <McpAdminData/> : <StateView kind="denied"/>;
}
function McpAdminData() {
  const {session,expire}=useAuth();
  const [filters,setFilters]=useState<McpFilters>({search:'',owner_search:'',status:'all',page:1,page_size:25});
  const data=useQuery({queryKey:['mcp-directory',session?.user.id,filters],queryFn:({signal})=>getMcpVenues(filters,signal)});
  useEffect(()=>{if(data.error&&mcpErrorKey(data.error)==='sessionExpired')void expire();},[data.error,expire]);
  if(data.error&&mcpErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  return <AdminMcpPage filters={filters} onFilters={setFilters} list={data.data} loading={data.isFetching}
    error={data.error?mcpErrorKey(data.error):null}
    onRetry={()=>{void data.refetch();}}/>;
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
  if (!(tab==='mcp'?access.data?.can_manage_staff:access.data?.can_view_tenants)) return <StateView kind="denied"/>;
  // Venue Users and Print Servers retain the existing platform Admin gate.
  const canManageUsers=access.data!.can_manage_staff;
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
    mcp={canManageUsers?<McpIntegrationData key={id} venueId={id} admin/>:undefined}
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
function PrintServersRoute({detail=false,list=false,firmwares=false,channels=false,inventory=false,updates=false,device=false}:{detail?:boolean;list?:boolean;firmwares?:boolean;channels?:boolean;inventory?:boolean;updates?:boolean;device?:boolean}) {
  const access=useAccess(); const {venueId='',id=''}=useParams();
  if (!access.data?.can_manage_staff) return <StateView kind="denied"/>;
  if (firmwares) return <PrintFirmwaresPage/>;
  if (channels) return canManageRings(access.data) ? <PrintChannelsPage/> : <StateView kind="denied"/>;
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
// OTA of the Print Server app (PE-385): platform Admin only; ps_ota_admin_overview answers 42501 otherwise.
function PrintUpdatesData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-ota',session?.user.id],queryFn:({signal})=>getOtaOverview(signal),refetchInterval:10_000});
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  if(data.data)return <PrintUpdatesPage data={data.data} refreshing={data.isFetching} onRefresh={async()=>{await data.refetch({throwOnError:true});await queryClient.invalidateQueries({queryKey:['ps-ota-page']},{throwOnError:true});}}/>;
  return <StateView kind="loading"/>;
}
function PsRefreshWarning({onRetry}:{onRetry:()=>Promise<unknown>}) {
  const {t}=useLocale();
  return <div className="staff-notice" role="alert"><span>{t('fw.refreshFailed')}</span><button type="button" className="button button-secondary" onClick={()=>{void onRetry().catch(()=>undefined);}}>{t('retry')}</button></div>;
}
// Inventory of Print Server units: platform Admin only; portal_ps_devices answers 42501 otherwise.
function PrintDevicesData() {
  const {session,expire}=useAuth();
  const data=useQuery({queryKey:['ps-devices',session?.user.id],queryFn:({signal})=>getInventoryDevices(signal),refetchInterval:30_000});
  const venues=useDirectory();
  useEffect(()=>{if(data.error&&psErrorKey(data.error)==='sessionExpired') void expire();},[data.error,expire]);
  if(data.isError&&psErrorKey(data.error)==='accessDenied')return <StateView kind="denied"/>;
  if((data.isError&&!data.data)||(venues.isError&&!venues.data))return <StateView kind="error" onRetry={()=>{void data.refetch();void venues.refetch();}}/>;
  if(data.data&&venues.data)return <>{(data.isError||venues.isError)&&<PsRefreshWarning onRetry={()=>invalidatePsViews(queryClient)}/>}<PrintDevicesPage devices={data.data} venues={venues.data} onChanged={()=>invalidatePsViews(queryClient)}/></>;
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
const venueListHref=(scope:'owner'|'admin',venueId:string,selected?:string)=>scope==='admin'?`/admin/tenants/${encodeURIComponent(venueId)}/print-servers${selected?`?selected=${encodeURIComponent(selected)}`:''}`:`/?venue=${encodeURIComponent(venueId)}&section=print-servers${selected?`&selected=${encodeURIComponent(selected)}`:''}`;
const sheetHref=(scope:'owner'|'admin',venueId:string,id:string)=>scope==='admin'?`${adminSheetHref(id)}?fromVenue=${encodeURIComponent(venueId)}`:ownerSheetHref(venueId,id);
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
  if(data.data)return <VenuePrintServersPage data={data.data} choose={choose} hrefFor={(device:VenueDevice)=>sheetHref(scope,venue.id,device.link?.device_id??device.inventory_device_id??device.id)}
    extra={scope==='admin'&&data.data.can_manage?<AddPrintServer venueId={venue.id}/>:undefined}
    onAssignPrinter={async(printerId,printServerId)=>{await setPrinterPrintServer(printerId,printServerId);await invalidatePsViews(queryClient);}}/>;
  if(data.isError)return <StateView kind="error" onRetry={()=>void data.refetch()}/>;
  return <StateView kind="loading"/>;
}
function AddPrintServer({venueId}:{venueId:string}) {
  const {t}=useLocale();
  return <div className="venue-ps-add" data-testid="venue-ps-add"><Link className="button button-primary" data-testid="venue-ps-add-submit" to={`/admin/print-servers/inventory?create=1&fromVenue=${encodeURIComponent(venueId)}`}>{t('psm.addPs')}</Link></div>;
}
// A device URL always resolves to its inventory identity before another read or action.
function DeviceSheetData({id,scope,expectedVenueId}:{id:string;scope:'owner'|'admin';expectedVenueId?:string}) {
  const {session}=useAuth(); const {t}=useLocale(); const navigate=useNavigate(); const location=useLocation();
  const directory=useDirectory(scope==='admin');
  const ref=useQuery({queryKey:['ps-device-resolve',session?.user.id,id],queryFn:({signal})=>getResolvedDevice(id,signal),retry:false,refetchInterval:15_000});
  usePsFailure(ref.error);
  if(ref.isError&&(!ref.data||['accessDenied','sessionExpired','ps.error.printServerNotFound'].includes(psErrorKey(ref.error))))return <StateView kind={psErrorKey(ref.error)==='accessDenied'?'denied':psErrorKey(ref.error)==='ps.error.printServerNotFound'?'notFound':'error'} onRetry={()=>void ref.refetch()}/>;
  if(!ref.data)return <StateView kind="loading"/>;
  const r=ref.data;
  if(expectedVenueId&&r.venue?.id!==expectedVenueId)return <StateView kind="denied"/>;
  const params=new URLSearchParams(location.search);
  const fromVenue=params.get('fromVenue');
  // A return context is accepted only when the resolver confirms this exact venue.
  const venueId=r.venue?.id;
  if(scope==='admin'&&!venueId&&fromVenue&&directory.isPending)return <StateView kind="loading"/>;
  const returnVenue=venueId??(scope==='admin'&&fromVenue&&directory.data?.some(item=>item.id===fromVenue)?fromVenue:null);
  const returnVenueName=returnVenue?(r.venue?.id===returnVenue?r.venue.name:directory.data?.find(item=>item.id===returnVenue)?.name??t('printServers')):null;
  const channelsBack=scope==='admin'?channelsReturnTo(location.state?.channelsReturnTo):null;
  const back=channelsBack?{href:channelsBack,label:t('pe474.channels.title')}:returnVenue?{href:venueListHref(scope,returnVenue,r.device_id),label:returnVenueName??t('printServers')}:{href:'/admin/print-servers/inventory',label:t('inv.title')};
  if(id!==r.device_id){
    const canonical=scope==='owner'&&venueId?ownerSheetHref(venueId,r.device_id):r.canonical_path;
    return <Navigate to={canonical+(scope==='admin'&&returnVenue?`?fromVenue=${encodeURIComponent(returnVenue)}`:'')} state={channelsBack?{channelsReturnTo:channelsBack}:undefined} replace/>;
  }
  const staff=scope==='admin'&&r.is_staff;
  return <PsDeviceSheet key={r.device_id} device={r} staff={staff} scope={scope} back={back} stale={ref.isError}
    onChanged={()=>invalidatePsViews(queryClient)} onCanonicalNavigate={path=>navigate(path,{replace:true,state:channelsBack?{channelsReturnTo:channelsBack}:undefined})}/>;
}
function PsDeviceSheet({device,staff,scope,back,stale,onChanged,onCanonicalNavigate}:{device:ResolvedDevice;staff:boolean;scope:'owner'|'admin';back:{href:string;label:string};stale:boolean;onChanged:()=>Promise<unknown>;onCanonicalNavigate:(path:string)=>void}) {
  const {t}=useLocale();
  // PE-486: Setup only for platform super_admin in the admin scope; owners never read access for it.
  const access=useAccess(staff);
  const setup=staff&&canManageRings(access.data);
  const [confirm,setConfirm]=useState<{deviceId:string;rev:number;venueName:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const [assignVenue,setAssignVenue]=useState<AdminVenueOption|null>(null);
  const venue=device.venue;
  const runtime=device.runtime;
  const sync=device.link.sync;
  const ack=device.compat.capabilities.link_ack;
  const unlinkAck=device.compat.capabilities.unlink_ack;
  const unlinkAllowed=staff&&device.capabilities.unlink.allowed&&device.capabilities.unlink.expected_rev!==null&&!stale;
  const available=ack.available.filter(item=>!item.retired).map(item=>`${item.version}${item.enabled_rings.length?` (${item.enabled_rings.join(', ')})`: ` (${t('ps469.noRing')})`}`).join(', ');
  async function unlink(){
    if(!confirm||busy||confirm.deviceId!==device.device_id)return;
    setBusy(true);setError('');setNotice('');
    try {
      await unlinkDevice(confirm.deviceId,confirm.rev);
      if(!alive.current){await onChanged();return;}
      setConfirm(null);
      setNotice(t('ps469.unlinked'));
      onCanonicalNavigate(`${device.canonical_path}${venue?`?fromVenue=${encodeURIComponent(venue.id)}`:''}`);
      await onChanged();
    } catch(err) {
      setConfirm(null);
      setError(psLinkErrorText(err,t,t(errorCode(err)))+' '+t('ps469.reloadNext'));
      await onChanged().catch(()=>undefined);
    } finally {setBusy(false);}
  }
  async function assign(){
    if(!assignVenue||!device.capabilities.assign.allowed||busy||device.venue)return;
    setBusy(true);setError('');setNotice('');
    try {await assignDevice(device.device_id,assignVenue.id);setNotice(t('ps469.assigned').replace('{venue}',assignVenue.name));await onChanged();}
    catch(err){setError(psLinkErrorText(err,t,t(errorCode(err)))+' '+t('ps469.reloadNext'));await onChanged().catch(()=>undefined);}
    finally {setBusy(false);}
  }
  return <div className="page-stack staff-page ps469-sheet" data-testid="ps-device-sheet" data-device-id={device.device_id}>
    <nav className="ps469-breadcrumb" aria-label={t('ps469.breadcrumb')}><Link to={back.href} data-testid="ps-sheet-back"><ArrowLeft size={16}/>{back.label}</Link><span aria-hidden="true">/</span><span aria-current="page">{device.display_name}</span></nav>
    <header className="page-heading detail-heading ps469-header"><div><p className="eyebrow">{t('printServer')}</p><h1 data-testid="ps-device-title">{device.display_name}</h1><p className="ps469-subtitle"><span className="ps-mono">{device.serial}</span><span aria-hidden="true">·</span>{venue?venue.name:t('inv.unassigned')}</p></div>
      <div className="ps469-statuses"><span className={`server-status ${runtime?(runtime.online?'server-online':'server-offline'):'server-pending'}`} data-testid="ps-connection-state"><span className="badge-dot"/>{runtime?t(runtime.online?'ps.state.online':'ps.state.offline'):t('ps469.noRuntime')}</span><PsLinkStateBadge state={device.link.state}/></div>
    </header>
    {stale&&<PsRefreshWarning onRetry={()=>invalidatePsViews(queryClient)}/>}
    {error&&<p className="form-error" role="alert" data-testid="ps-unlink-error"><AlertTriangle size={17}/>{error}</p>}
    {notice&&<p className="staff-notice" role="status">{notice}</p>}
    <nav className="ps469-sections" aria-label={t('ps469.sections')}><a href="#ps469-overview">{t('ps469.summary')}</a>{!device.link.prepared&&<a href="#ps469-preparation">{t('psLink.prep.title')}</a>}<a href="#ps469-wifi">{t('ps469.wifi')}</a>{staff&&runtime&&venue&&<a href="#ps469-compat">{t('ps469.compatibility')}</a>}{setup&&<a href="#ps-setup">{t('psSetup.nav')}</a>}<a href="#ps469-firmware">{t('stockSheet.firmware')}</a>{runtime&&venue&&<><a href="#ps469-certificates">{t('ps469.certificates')}</a><a href="#ps469-printers">{t('ps469.printers')}</a><a href="#ps469-queue">{t('ps469.queue')}</a></>}</nav>
    <section id="ps469-overview" className="ps469-overview" aria-label={t('ps469.summary')}>
      <div className="ps469-sync" data-testid="ps-link-sync"><strong>{sync?.confirmed?t(sync.scope==='unlinked'?'ps469.unlinkConfirmed':'ps469.syncConfirmed'):venue?t('ps469.syncPending'):t('ps469.stock')}</strong>
        {venue&&!sync?.confirmed&&<p>{ack.supported===false?t('ps469.compatNeeded').replace('{installed}',device.compat.installed_version??t('notProvided')).replace('{required}',ack.required_version):t('ps469.waitAck')}{available&&` ${t('ps469.available')}: ${available}.`}</p>}
        {venue&&sync?.confirmed&&<p>{t('ps469.ackAt').replace('{rev}',String(sync.rev))}</p>}
        {!venue&&<p>{device.link.prepared?t('ps469.preparedStock'):t('ps469.unpreparedStock')}</p>}
        {!venue&&runtime&&sync&&!sync.confirmed&&<p>{unlinkAck.supported===false?t('ps469.unlinkAckNeeded').replace('{installed}',device.compat.installed_version??t('notProvided')).replace('{required}',unlinkAck.required_version):t('ps469.waitAck')}</p>}
      </div>
      <section className="detail-panel ps469-compat" id={staff&&runtime&&venue?'ps469-compat':'ps469-firmware'} aria-labelledby="ps469-compat-title"><h2 id="ps469-compat-title">{t('ps469.compatibility')}</h2><dl className="dev-facts">{(!staff||!runtime||!venue)&&<div><dt>{t('ps469.installed')}</dt><dd className="ps-mono">{device.compat.installed_version??t('dash.unknownVersion')}</dd></div>}<div><dt>{t('ps469.requiredLinkAck')}</dt><dd className="ps-mono">{ack.required_version}</dd></div><div><dt>{t('ps469.requiredWeb')}</dt><dd className="ps-mono">{device.compat.capabilities.web_activation.required_version}</dd></div></dl><p className="ps-cert-small">{available?`${t('ps469.available')}: ${available}.`:t('ps469.noAvailable')}</p></section>
      <PsDeviceLinkPanel key={device.device_id} link={device.link} isStaff={staff} canEdit={device.capabilities.set_label.allowed} compact preparationEntry={device.preparation_entry} installedVersion={device.compat.installed_version} onChanged={onChanged}/>
      {!venue&&staff&&<section className="detail-panel ps469-assign"><h2>{t('ps469.assignTitle')}</h2><p>{t('ps469.assignLead')}</p><div className="ps469-assign-controls"><VenueCombobox value={assignVenue} onChange={setAssignVenue} disabled={busy||!device.capabilities.assign.allowed} testId="ps469-assign-venue"/><button type="button" className="button button-primary" data-testid="ps469-assign" disabled={!assignVenue||busy||!device.capabilities.assign.allowed} onClick={()=>void assign()}>{t('inv.assign')}</button></div></section>}
      {venue&&staff&&<div className="detail-panel ps469-unlink"><h2>{t('ps469.unlinkTitle')}</h2><p>{t('ps469.unlinkLead')}</p><button type="button" className="button button-secondary ps-danger" data-testid="ps-unlink" disabled={!unlinkAllowed||busy} onClick={()=>setConfirm({deviceId:device.device_id,rev:device.capabilities.unlink.expected_rev!,venueName:venue.name})}><Unlink size={16}/>{t('ps469.unlink')}</button>
        {!unlinkAllowed&&<p className="ps-cert-small">{stale?t('ps469.reloadNext'):t('ps469.unlinkForbidden')}</p>}
        {unlinkAck.supported===false&&<p className="ps-cert-small">{t('ps469.unlinkAckNeeded').replace('{installed}',device.compat.installed_version??t('notProvided')).replace('{required}',unlinkAck.required_version)}</p>}</div>}
    </section>
    {setup&&<PsDeviceSetup key={`setup:${device.device_id}`} device={device}/>}
    {staff&&(!runtime||!venue)?<InventoryDeviceSheetData key={device.device_id} deviceId={device.device_id}/>:null}
    {runtime&&venue&&<div id="ps469-operations"><PrintServerSheetData key={`${device.device_id}:${runtime.print_server_id}`} deviceId={device.device_id} printServerId={runtime.print_server_id} venueId={venue.id} venueName={venue.name} scope={scope} back={back} canManage={device.can_manage}/></div>}
    {confirm&&<PortalDialog title={t('ps469.unlinkTitle')} titleId="ps469-unlink-title" descriptionId="ps469-unlink-body" testId="ps-unlink-confirm" alert dismissible={!busy} onClose={()=>setConfirm(null)} actions={<><button type="button" className="button button-primary ps-danger-solid" data-testid="ps-unlink-submit" disabled={busy} onClick={()=>void unlink()}>{t(busy?'ps.working':'ps469.unlink')}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>setConfirm(null)}>{t('staff.cancel')}</button></>}><p id="ps469-unlink-body">{t('ps469.unlinkConfirm').replace('{name}',device.display_name).replace('{serial}',device.serial).replace('{venue}',confirm.venueName)}</p></PortalDialog>}
  </div>;
}
function InventoryDeviceSheetData({deviceId}:{deviceId:string}) {
  const {session}=useAuth(); const {t}=useLocale();
  const sheet=useQuery({queryKey:['ps-admin-device-sheet',session?.user.id,deviceId],
    queryFn:({signal})=>getAdminDeviceSheet(deviceId,signal),retry:false,gcTime:0,staleTime:0});
  usePsFailure(sheet.error);
  // Never retain an old credential view after a denied refresh.
  if(sheet.isError)return <StateView kind={psErrorKey(sheet.error)==='accessDenied'?'denied':'error'} onRetry={()=>void sheet.refetch()}/>;
  if(!sheet.data||sheet.isFetching)return <StateView kind="loading"/>;
  return <div data-testid="ps-inventory-sheet"><InventoryDeviceSheet key={deviceId} sheet={sheet.data} compact/></div>;
}
function PrintServerSheetData({deviceId,printServerId,venueId,venueName,scope,back,canManage}:{deviceId:string;printServerId:string;venueId:string;venueName:string;scope:'owner'|'admin';back:{href:string;label:string};canManage:boolean}) {
  const {session}=useAuth(); const {t}=useLocale();
  const state=useQuery({queryKey:['ps-state',scope,session?.user.id,venueId,printServerId],
    queryFn:({signal})=>getPanelState(venueId,signal,scope,printServerId),refetchInterval:10_000});
  const api=useBoundApi(printServerId);
  usePsFailure(state.error);
  if(state.error instanceof SelectionRequiredError)return <div className="staff-notice" role="alert"><span>{t('ps.error.selectionRequired')}</span><Link to={back.href}>{back.label}</Link></div>;
  if(state.error&&psErrorKey(state.error)==='accessDenied')return <StateView kind="denied"/>;
  if(state.error&&psErrorKey(state.error)==='sessionExpired')return <StateView kind="loading"/>;
  const refresh=()=>invalidatePsViews(queryClient);
  if(state.data)return <PrintServerDetailPage scope={scope} embedded deviceId={deviceId} printServerId={printServerId} replaceTargets={[]}
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
    <Route path="/admin/mcp" element={<Scope scope="admin"><McpAdminRoute/></Scope>}/>
    {/* PE-328: the global user list is retired; venue users live in each venue's Users tab. */}
    <Route path="/admin/users" element={<Navigate to="/admin/tenants" replace/>}/>
    <Route path="/admin/users/:id" element={<Navigate to="/admin/tenants" replace/>}/>
    <Route path="/admin/print-servers" element={<Scope scope="admin"><PrintServersRoute/></Scope>}/>
    <Route path="/admin/print-servers/list" element={<Scope scope="admin"><PrintServersRoute list/></Scope>}/>
    <Route path="/admin/print-servers/inventory" element={<Scope scope="admin"><PrintServersRoute inventory/></Scope>}/>
    <Route path="/admin/print-servers/firmwares" element={<Scope scope="admin"><PrintServersRoute firmwares/></Scope>}/>
    <Route path="/admin/print-servers/channels" element={<Scope scope="admin"><PrintServersRoute channels/></Scope>}/>
    <Route path="/admin/print-servers/updates" element={<Scope scope="admin"><PrintServersRoute updates/></Scope>}/>
    <Route path="/admin/print-servers/devices/:id" element={<Scope scope="admin"><PrintServersRoute device/></Scope>}/>
    <Route path="/admin/print-servers/:venueId" element={<Scope scope="admin"><PrintServersRoute detail/></Scope>}/>
    <Route path="/admin/tenants" element={<Scope scope="admin"><DirectoryRoute/></Scope>}/>
    <Route path="/admin/tenants/:id" element={<Scope scope="admin"><DetailRoute/></Scope>}/>
    <Route path="/admin/tenants/:id/print-servers" element={<Scope scope="admin"><DetailRoute tab="print-servers"/></Scope>}/>
    <Route path="/admin/tenants/:id/print-servers/detail" element={<Scope scope="admin"><DetailRoute tab="print-server-detail"/></Scope>}/>
    <Route path="/admin/tenants/:id/mcp" element={<Scope scope="admin"><DetailRoute tab="mcp"/></Scope>}/>
    <Route path="/admin/tenants/:id/users" element={<Scope scope="admin"><DetailRoute tab="users"/></Scope>}/>
    <Route path="*" element={<OutsideState kind="notFound"/>}/>
  </Routes></AuthenticatedLayout>;
}
