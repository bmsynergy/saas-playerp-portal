// PE-473 admin-only blocks of the Print Server sheet. Owner views never render these.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useLocale } from '../locales';
import type { FirmwareRing } from '../lib/firmwareEligibility';
import { blockerKey, channelSelectionValid, editionReasonKey, shortId, shortSha, showValidateButton, splitEditions, validationErrorKey,
  type CanaryValidation, type GeneralRequirements, type OtaChannel, type OtaEdition } from '../lib/psOtaDevice';
import { PortalDialog } from './PortalDialog';

type T = (key: string) => string;
const fill = (text: string, values: Record<string, string>) => Object.entries(values).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), text);
const coded = (t: T, r: { key: string; code: string | null }) => r.code ? fill(t(r.key), { code: r.code }) : t(r.key);
const ringName = (t: T, ring: string | null) => ring ? t(`firmware.ring.${ring}`) : t('notProvided');

export function ChannelBlock({ deviceId, channel, onChange }: { deviceId: string; channel: OtaChannel; onChange: () => void }) {
  const { t } = useLocale();
  const reason = channel.blocked_reason === 'update_in_progress' || channel.blocked_reason === 'device_not_active' ? t(`otaDevice.channel.blocked.${channel.blocked_reason}`) : t('otaDevice.channel.blocked.other');
  return <div className="ota-block" data-testid="admin-device-channel" aria-labelledby={`ota-channel-${deviceId}`} role="group">
    <h4 id={`ota-channel-${deviceId}`}>{t('otaDevice.channel.title')}</h4>
    <p><strong>{ringName(t, channel.ring)}</strong>{channel.groups.length > 0 && <> · {t('otaDevice.channel.group')}: {channel.groups.map(g => g.name).join(', ')}</>}</p>
    <p className="ps-cert-small">{t('otaDevice.channel.explain')}</p>
    <div className="staff-actions">
      <button type="button" className="button button-secondary" data-testid="admin-device-change-channel" disabled={!channel.can_change} onClick={onChange}>{t('otaDevice.channel.change')}</button>
    </div>
    {!channel.can_change && <p className="ps-cert-small">{reason}</p>}
  </div>;
}

export function ChannelDialog({ channel, serial, busy, error, onCancel, onConfirm }: { channel: OtaChannel; serial: string; busy: boolean; error: string; onCancel: () => void; onConfirm: (ring: FirmwareRing, groupId: string | null) => void }) {
  const { t } = useLocale();
  const [ring, setRing] = useState<FirmwareRing>(channel.ring);
  const option = channel.options.find(o => o.ring === ring);
  const [groupId, setGroupId] = useState<string | null>(channel.groups.find(g => g.ring === channel.ring)?.id ?? option?.groups[0]?.id ?? null);
  const pick = (next: FirmwareRing) => { setRing(next); const o = channel.options.find(x => x.ring === next); setGroupId(next === 'general' ? null : (channel.groups.find(g => g.ring === next && o?.groups.some(x => x.id === g.id))?.id ?? o?.groups[0]?.id ?? null)); };
  const valid = channelSelectionValid(channel, ring, groupId);
  return <PortalDialog title={t('otaDevice.channel.dialogTitle')} titleId="ota-channel-dialog" descriptionId="ota-channel-dialog-desc" onClose={onCancel} dismissible={!busy} testId="admin-device-channel-dialog"
    actions={<><button type="button" className="button button-primary" disabled={busy || !valid} onClick={() => onConfirm(ring, ring === 'general' ? null : groupId)}>{t('otaDevice.channel.confirm')}</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>{t('staff.cancel')}</button></>}>
    <p id="ota-channel-dialog-desc">{fill(t('otaDevice.channel.dialogLead'), { serial, ring: ringName(t, channel.ring) })}</p>
    <p className="ps-dialog-warning">{t('otaDevice.channel.noInstall')}</p>
    <fieldset className="ota-channel-options"><legend>{t('otaDevice.channel.title')}</legend>
      {channel.options.map(o => {
        const disabled = o.ring !== 'general' && !o.groups.length;
        return <label key={o.ring} className="ota-radio"><input type="radio" name="ota-channel" value={o.ring} checked={ring === o.ring} disabled={disabled || busy} onChange={() => pick(o.ring)}/>
          <span>{ringName(t, o.ring)}{disabled && <small> · {t('otaDevice.channel.noGroup')}</small>}</span></label>;
      })}
    </fieldset>
    {ring !== 'general' && option && option.groups.length > 0 && <label className="field"><span>{t('otaDevice.channel.group')}</span>
      <select value={groupId ?? ''} disabled={busy} onChange={e => setGroupId(e.target.value || null)}>{option.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
    {ring === 'general' && <p className="ps-cert-small">{t('otaDevice.channel.generalNote')}</p>}
    {!valid && <p className="ps-cert-small">{t('otaDevice.channel.sameSelection')}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </PortalDialog>;
}

export function EditionPicker({ editions, value, onChange, disabled }: { editions: OtaEdition[]; value: string | null; onChange: (id: string) => void; disabled: boolean }) {
  const { t } = useLocale();
  if (!editions.length) return <p className="ps-cert-small" data-testid="admin-device-editions">{t('otaDevice.edition.none')}</p>;
  const { main, other } = splitEditions(editions);
  const row = (e: OtaEdition) => <label key={e.edition_id} className="ota-radio">
    <input type="radio" name="ota-edition" value={e.edition_id} checked={value === e.edition_id} disabled={disabled || !e.selectable} onChange={() => onChange(e.edition_id)}/>
    <span><strong>{e.version}</strong> · <span className="ps-mono" title={e.sha256 ?? undefined}>{shortSha(e.sha256)}</span> · {e.enabled_rings.length ? e.enabled_rings.map(r => ringName(t, r)).join(', ') : t('otaDevice.edition.noRings')}
      {e.installed && <> · {t('otaDevice.edition.installed')}</>}
      {!e.selectable && <small className="ota-reason"> — {coded(t, editionReasonKey(e.reason))}</small>}</span>
  </label>;
  return <fieldset className="ota-editions" data-testid="admin-device-editions"><legend>{t('otaDevice.edition.title')}</legend>
    {main.map(row)}
    {!main.some(e => e.selectable) && <p className="ps-cert-small">{t('otaDevice.edition.noneSelectableShort')}</p>}
    {other.length > 0 && <details className="ota-other-editions"><summary>{t('otaDevice.edition.others').replace('{count}', String(other.length))}</summary>{other.map(row)}</details>}
  </fieldset>;
}

export function CanaryValidationBlock({ deviceId, canary, busy, onValidate, onChangeChannel }: { deviceId: string; canary: CanaryValidation; busy: boolean; onValidate: () => void; onChangeChannel: (() => void) | null }) {
  const { t } = useLocale();
  if (canary.status === 'not_needed') return <div className="ota-block" role="group" aria-labelledby={`ota-canary-${deviceId}`} data-testid="admin-device-canary">
    <h4 id={`ota-canary-${deviceId}`}>{t('otaDevice.canary.title')}</h4><p className="ps-cert-small">{t('otaDevice.canary.status.not_needed')}</p></div>;
  const e = canary.edition, target = canary.target;
  const disabledReason = !canary.can_validate ? (canary.blockers.length ? t('otaDevice.canary.disabledBlockers') : t('otaDevice.canary.disabledOther')) : null;
  return <div className="ota-block" role="group" aria-labelledby={`ota-canary-${deviceId}`} data-testid="admin-device-canary">
    <h4 id={`ota-canary-${deviceId}`}>{t('otaDevice.canary.title')}</h4>
    <p data-testid="admin-device-canary-status"><strong>{t(`otaDevice.canary.status.${canary.status}`)}</strong></p>
    {e && <dl className="ota-facts">
      <div><dt>{t('version')}</dt><dd>{e.version}</dd></div>
      <div><dt>{t('otaDevice.canary.edition')}</dt><dd className="ps-mono" title={e.edition_id}>{shortId(e.edition_id)}</dd></div>
      <div><dt>SHA-256</dt><dd className="ps-mono" title={e.sha256 ?? undefined}>{shortSha(e.sha256)}</dd></div>
      {canary.receipt_target_id && <div><dt>{t('otaDevice.canary.receipt')}</dt><dd>{fill(t('otaDevice.canary.receiptValue'), { target: shortId(canary.receipt_target_id), ring: ringName(t, canary.receipt_ring) })}</dd></div>}
    </dl>}
    {canary.updater_supports_validation !== true && canary.status !== 'confirmed' && <p className="ps-dialog-warning" data-testid="admin-device-updater-warning">
      {canary.updater_supports_validation === false ? fill(t('otaDevice.canary.updaterUnsupported'), { version: canary.updater_version ?? '?' }) : t('otaDevice.canary.updaterUnknown')}</p>}
    {canary.blockers.length > 0 && <ul className="ota-list" data-testid="admin-device-canary-blockers">{canary.blockers.map(b => <li key={b}>
      <XCircle size={14} aria-hidden="true"/> <span>{coded(t, blockerKey(b))}</span>
      {b === 'channel_not_canary' && onChangeChannel && <button type="button" className="staff-action-link" onClick={onChangeChannel}>{t('otaDevice.channel.change')}</button>}
      {b === 'canary_ring_disabled' && <Link className="staff-action-link" to="/admin/print-servers/firmwares">{t('otaDevice.general.openFirmwares')}</Link>}
    </li>)}</ul>}
    {target && <div className="ota-target" data-testid="admin-device-canary-target">
      <p>{fill(t('otaDevice.canary.targetLine'), { id: shortId(target.id), status: t(`otaDevice.target.${target.status}`) === `otaDevice.target.${target.status}` ? target.status : t(`otaDevice.target.${target.status}`) })}
        {target.phase && <> · {target.phase}</>}{target.progress !== null && <> · {target.progress}%</>}</p>
      {canary.status === 'failed' && <p className="form-error" role="alert">{coded(t, validationErrorKey(target.error_code))}</p>}
    </div>}
    {canary.status === 'in_progress' && <p className="firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('otaDevice.canary.waiting')}</p>}
    {showValidateButton(canary) && <div className="firmware-update-action">
      <button type="button" id={`ota-validate-${deviceId}`} className="button button-primary" data-testid="admin-device-validate" disabled={!canary.can_validate || busy} onClick={onValidate}>
        <ShieldCheck size={15} aria-hidden="true"/>{t('otaDevice.canary.validate')}</button>
      {disabledReason && <p className="ps-cert-small">{disabledReason}</p>}
    </div>}
  </div>;
}

export function ValidateDialog({ canary, serial, installed, busy, error, onCancel, onConfirm }: { canary: CanaryValidation; serial: string; installed: string; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useLocale();
  const e = canary.edition!;
  return <PortalDialog title={t('otaDevice.canary.dialogTitle')} titleId="ota-validate-dialog" descriptionId="ota-validate-dialog-desc" onClose={onCancel} dismissible={!busy} testId="admin-device-validate-dialog"
    actions={<><button type="button" className="button button-primary" disabled={busy} onClick={onConfirm}>{t('otaDevice.canary.validate')}</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>{t('staff.cancel')}</button></>}>
    <p id="ota-validate-dialog-desc">{fill(t('otaDevice.canary.dialogLead'), { serial, version: installed })}</p>
    <dl className="ota-facts">
      <div><dt>{t('printServer')}</dt><dd>{serial}</dd></div>
      <div><dt>{t('version')}</dt><dd>{e.version}</dd></div>
      <div><dt>{t('otaDevice.canary.edition')}</dt><dd className="ps-mono">{e.edition_id}</dd></div>
      <div><dt>SHA-256</dt><dd className="ps-mono">{e.sha256 ?? '—'}</dd></div>
    </dl>
    <p className="ps-dialog-warning">{t('otaDevice.canary.dialogNoInstall')}</p>
    <p>{t('otaDevice.canary.dialogProof')}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
  </PortalDialog>;
}

export function GeneralRequirementsBlock({ deviceId, general, onChangeChannel, canChangeChannel }: { deviceId: string; general: GeneralRequirements; onChangeChannel: () => void; canChangeChannel: boolean }) {
  const { t } = useLocale();
  const focusValidate = () => document.getElementById(`ota-validate-${deviceId}`)?.focus();
  return <div className="ota-block" role="group" aria-labelledby={`ota-general-${deviceId}`} data-testid="admin-device-general-requirements">
    <h4 id={`ota-general-${deviceId}`}>{t('otaDevice.general.title')}{general.edition && <> · {general.edition.version}</>}</h4>
    <ul className="ota-list">{general.items.map(item => <li key={item.key} data-met={item.met}>
      {item.met ? <CheckCircle2 size={14} aria-label={t('otaDevice.general.met')}/> : <XCircle size={14} aria-label={t('otaDevice.general.notMet')}/>}
      <span>{t(`otaDevice.general.item.${item.key}`) === `otaDevice.general.item.${item.key}` ? item.key : t(`otaDevice.general.item.${item.key}`)}</span>
      {!item.met && item.action === 'change_channel' && <button type="button" className="staff-action-link" disabled={!canChangeChannel} onClick={onChangeChannel}>{t('otaDevice.channel.change')}</button>}
      {!item.met && item.action === 'install_updater' && <small className="ota-reason">{t('otaDevice.general.installUpdater')}</small>}
      {!item.met && item.action === 'validate' && <button type="button" className="staff-action-link" onClick={focusValidate}>{t('otaDevice.general.goValidate')}</button>}
      {!item.met && item.action === 'open_firmwares' && item.href && <Link className="staff-action-link" to={item.href}>{t('otaDevice.general.openFirmwares')}</Link>}
    </li>)}</ul>
    <p className="ps-cert-small">{general.eligible ? t('otaDevice.general.eligible') : t('otaDevice.general.never')}</p>
  </div>;
}
