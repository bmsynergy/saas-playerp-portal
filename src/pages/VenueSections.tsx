import type { ReactNode } from 'react';
import { Building2, Globe2, Mail, MapPin, Phone, Server, UsersRound } from 'lucide-react';
import type { OwnerVenue } from '../lib/types';
import { useLocale } from '../locales';

export type VenueSection = 'overview' | 'users' | 'print-servers';
type Tab = { section: VenueSection; label: string; icon: ReactNode; testId?: string };

export function VenueSectionTabs({ active, users, printServers, render }: {
  active: VenueSection; users: boolean; printServers: boolean;
  render: (tab: Tab, active: boolean) => ReactNode;
}) {
  const { t } = useLocale();
  if (!users && !printServers) return null;
  const tabs: Tab[] = [{ section: 'overview', label: t('venueDetails'), icon: <Building2 size={16}/> }];
  if (users) tabs.push({ section: 'users', label: t('identity.tab'), icon: <UsersRound size={16}/>, testId: 'venue-users-tab' });
  if (printServers) tabs.push({ section: 'print-servers', label: t('printServers'), icon: <Server size={16}/>, testId: 'venue-print-servers-tab' });
  return <nav className="detail-tabs" aria-label={t('identity.tabsLabel')}>{tabs.map(tab => render(tab, active === tab.section))}</nav>;
}

export function VenueDetailsPanel({ venue, scope }: { venue: OwnerVenue; scope: 'owner' | 'admin' }) {
  const { t } = useLocale();
  const items = scope === 'admin'
    ? [<DetailItem key="city" icon={<MapPin size={19}/>} label={t('city')} value={venue.city}/>, <DetailItem key="slug" icon={<Globe2 size={19}/>} label={t('slug')} value={venue.slug}/>]
    : [];
  return <section className={scope === 'admin' ? 'detail-panel' : 'owner-venue-card'} aria-labelledby="venue-details-title">
    <div className={`section-heading ${scope === 'owner' ? 'venue-details-heading' : ''}`}><div><p className="eyebrow">{t(scope === 'admin' ? 'venues' : 'ownerArea')}</p><h2 id="venue-details-title">{t('venueDetails')}</h2></div><span className="section-icon"><Building2 size={20}/></span></div>
    <div className="detail-grid">{items}<DetailItem icon={<MapPin size={19}/>} label={t('address')} value={venue.address}/><DetailItem icon={<Globe2 size={19}/>} label={t('timezone')} value={venue.timezone}/><DetailItem icon={<Phone size={19}/>} label={t('phone')} value={venue.phone}/><DetailItem icon={<Mail size={19}/>} label={t('email')} value={venue.email} isEmail/></div>
  </section>;
}

export function DetailItem({ icon, label, value, isEmail = false }: { icon: ReactNode; label: string; value: string | null; isEmail?: boolean }) {
  const { t } = useLocale();
  return <div className="detail-item"><span className="detail-item-icon" aria-hidden="true">{icon}</span><div><span className="detail-item-label">{label}</span>{value && isEmail ? <a href={`mailto:${value}`}>{value}</a> : <strong>{value || t('notProvided')}</strong>}</div></div>;
}
