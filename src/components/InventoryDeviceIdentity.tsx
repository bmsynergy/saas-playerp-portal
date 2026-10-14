import type { AdminDeviceDetail } from '../lib/psAdminDevice';
import { useLocale } from '../locales';

type Props = { device: AdminDeviceDetail['device'] };

export function InventoryDeviceIdentity({ device }: Props) {
  const { t } = useLocale();
  return <dl className="inventory-device-identity" data-testid="inventory-device-identity">
    <div><dt>{t('dev.serial')}</dt><dd className="ps-mono">{device.serial}</dd></div>
    <div><dt>{t('ps.hostname')}</dt><dd className="ps-mono">{device.hostname}</dd></div>
    <div><dt>{t('fw.model')}</dt><dd>{device.model}</dd></div>
    <div><dt>{t('fw.arch')}</dt><dd>{device.arch}</dd></div>
    <div><dt>{t('adminDevice.label')}</dt><dd>{device.label || t('notProvided')}</dd></div>
    <div><dt>{t('state')}</dt><dd>{t(`dev.deviceStatus.${device.status}`)}</dd></div>
    <div><dt>{t('inv.venue')}</dt><dd>{device.venue_name || t('inv.unassigned')}</dd></div>
  </dl>;
}
