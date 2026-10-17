// Admin-only presentation of the PE-474 device channel and installable editions.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../locales';
import type { FirmwareRing } from '../lib/firmwareLifecycle';
import { type NewerBlocked, type OtaChannel, type OtaEdition } from '../lib/psOtaDevice';
import { PortalDialog } from './PortalDialog';

const RINGS: FirmwareRing[]=['lab','canary','general'];
export function ChannelBlock({ deviceId, channel, onChange }: {deviceId:string;channel:OtaChannel;onChange:()=>void}) {
  const {t}=useLocale();
  return <div className="ota-block" data-testid="admin-device-channel" aria-labelledby={`ota-channel-${deviceId}`} role="group">
    <h4 id={`ota-channel-${deviceId}`}>{t('otaDevice.channel.title')}</h4>
    <p><strong>{t(`ota.ring.${channel.ring}`)}</strong> · {t('pe474.channels.revision').replace('{n}',String(channel.revision))}</p>
    <p className="ps-cert-small">{t('pe474.channels.deviceRule')}</p>
    {channel.deployment_groups.length>0&&<p className="ps-cert-small">{t('pe474.channels.deploymentGroups')}: {channel.deployment_groups.map(g=>g.name).join(', ')}</p>}
    <div className="staff-actions"><button type="button" className="button button-secondary" data-testid="admin-device-change-channel" disabled={!channel.can_change} onClick={onChange}>{t('otaDevice.channel.change')}</button><Link className="staff-action-link" to={channel.href}>{t('pe474.channels.manage')}</Link></div>
    {!channel.can_change&&channel.blocked_reason&&<p className="ps-cert-small">{t(`adminDevice.reason.${channel.blocked_reason}`)}</p>}
  </div>;
}
export function ChannelDialog({channel,serial,busy,error,onCancel,onConfirm}:{channel:OtaChannel;serial:string;busy:boolean;error:string;onCancel:()=>void;onConfirm:(ring:FirmwareRing)=>void}) {
  const {t}=useLocale();
  const [ring,setRing]=useState<FirmwareRing>(channel.ring);
  return <PortalDialog title={t('pe474.channels.change')} titleId="ota-channel-dialog" descriptionId="ota-channel-dialog-desc" onClose={onCancel} dismissible={!busy} testId="admin-device-channel-dialog" actions={<><button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>{t('staff.cancel')}</button><button type="button" className="button button-primary" disabled={busy||ring===channel.ring} onClick={()=>onConfirm(ring)}>{t('staff.confirm')}</button></>}>
    <p id="ota-channel-dialog-desc">{t('pe474.channels.confirm').replace('{serial}',serial).replace('{from}',t(`ota.ring.${channel.ring}`)).replace('{to}',t(`ota.ring.${ring}`))}</p>
    <fieldset className="ota-channel-options"><legend>{t('otaDevice.channel.title')}</legend>{RINGS.map(r=><label key={r} className="ota-radio"><input type="radio" name="ota-channel" value={r} checked={ring===r} disabled={busy} onChange={()=>setRing(r)}/><span>{t(`ota.ring.${r}`)}</span></label>)}</fieldset>
    <p className="ps-dialog-warning">{t('pe474.channels.noInstall')}</p>
    {error&&<p role="alert" className="form-error">{error}</p>}
  </PortalDialog>;
}
export function EditionPicker({editions,value,onChange,disabled,editionsTotal,reason,newerBlocked}:{editions:OtaEdition[];value:string|null;onChange:(id:string)=>void;disabled:boolean;editionsTotal?:number;reason?:string|null;newerBlocked?:NewerBlocked|null}) {
  const {t}=useLocale();
  const textReason=()=>{
    if(reason==='newer_not_enabled'&&newerBlocked)return t('pe474.device.newerNotEnabled').replace('{version}',newerBlocked.version).replace('{channel}',newerBlocked.channel?t(`ota.ring.${newerBlocked.channel}`):t('notProvided'));
    if(reason==='newer_incompatible'&&newerBlocked)return t('pe474.device.newerIncompatible').replace('{version}',newerBlocked.version);
    const key=`adminDevice.reason.${reason??'up_to_date'}`;return t(key)===key?t('otaDevice.edition.none'):t(key);
  };
  if(!editions.length)return <p className="ps-cert-small" data-testid="admin-device-editions">{textReason()}</p>;
  return <fieldset className="ota-editions" data-testid="admin-device-editions"><legend>{t('otaDevice.edition.title')}</legend>
    {editions.map(e=><label key={e.edition_id} className="ota-radio"><input type="radio" name="ota-edition" value={e.edition_id} checked={value===e.edition_id} disabled={disabled||!e.selectable} onChange={()=>onChange(e.edition_id)}/><span><strong>{e.version}</strong> · <span className="ps-mono">{e.sha256_short??'—'}</span>{e.reason&&<small className="ota-reason"> · {t(`adminDevice.reason.${e.reason}`)}</small>}</span></label>)}
    {editionsTotal!==undefined&&<small className="ps-cert-small">{t('pe474.device.editionsCount').replace('{shown}',String(editions.length)).replace('{total}',String(editionsTotal))}</small>}
  </fieldset>;
}
