import { RefreshCw } from 'lucide-react';
import { useLocale } from '../locales';

type Props = {
  disabled: boolean;
  onClick: () => void;
  reason?: string | null;
  loading?: boolean;
  testId?: string;
};

// Presentation shared by the venue and platform views. The reason stays outside
// the disabled button so it remains readable and available to assistive technology.
export function FirmwareUpdateAction({ disabled, onClick, reason, loading = false, testId }: Props) {
  const { t } = useLocale();
  return <div className="firmware-update-action">
    <button type="button" className="button button-primary" data-testid={testId} disabled={disabled || loading} onClick={onClick}>
      <RefreshCw size={15} aria-hidden="true"/>{t('adminDevice.update')}
    </button>
    {reason && <p className="ps-cert-small">{reason}</p>}
    {loading && <p className="firmware-loading-status" role="status"><span className="spinner" aria-hidden="true"/>{t('firmware.sending')}</p>}
  </div>;
}
