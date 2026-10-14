import { FilterX } from 'lucide-react';
import { useLocale } from '../locales';

type Props = { disabled: boolean; onClick: () => void; testId?: string; className?: string };

export function ClearFiltersButton({ disabled, onClick, testId, className = '' }: Props) {
  const { t } = useLocale();
  return <button type="button" className={`clear-filters-button ${className}`.trim()} disabled={disabled} onClick={onClick} data-testid={testId}><FilterX size={15} aria-hidden="true"/>{t('ps.filter.clear')}</button>;
}
