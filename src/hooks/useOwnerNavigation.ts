import { useSearchParams } from 'react-router-dom';
import type { OwnerVenue } from '../lib/types';

export type OwnerSection = 'dashboard' | 'details' | 'users' | 'print-servers';

// The URL records context, never grants access. Each selection must still belong
// to the current access response; a fresh multi-venue entry always opens Overview.
export function useOwnerNavigation(venues: OwnerVenue[]) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('venue');
  const selectedId = requested ?? (venues.length === 1 ? venues[0].id : '');
  const known = venues.some(venue => venue.id === selectedId);
  const requestedSection = params.get('section');
  const section: OwnerSection = requestedSection === 'details' || requestedSection === 'users' || requestedSection === 'print-servers' ? requestedSection : 'dashboard';
  // PE-443: a device sheet inside the Print Servers section (stable device id; still checked by the backend).
  const device = section === 'print-servers' ? params.get('device') ?? '' : '';
  const onSelect = (id: string) => {
    if (venues.some(venue => venue.id === id)) setParams({venue: id});
  };
  const onSection = (next: OwnerSection) => {
    if (known) setParams(next === 'dashboard' ? {venue: selectedId} : {venue: selectedId, section: next});
  };
  const onOverview = () => setParams({});
  return {venues, selectedId, known, section, device, onSelect, onSection, onOverview};
}
