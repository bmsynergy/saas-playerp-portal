import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAccess, getDirectory, getOwnerVenues, getTenant } from '../lib/api';
import { useAuth } from './useAuth';
export function useAccess() {
  const {session,recovery,invitation} = useAuth();
  const {pathname}=useLocation();
  return useQuery({queryKey:['access',session?.user.id,pathname], queryFn:({signal})=>getAccess(signal),enabled:!!session&&!recovery&&!invitation,refetchInterval:60_000});
}
export function useDirectory() {
  const {session} = useAuth();
  return useQuery({queryKey:['directory',session?.user.id],queryFn:({signal})=>getDirectory(signal),refetchInterval:60_000});
}
export function useTenantDetail(id: string) {
  const {session} = useAuth();
  return useQuery({queryKey:['tenant',session?.user.id,id],queryFn:({signal})=>getTenant(id,signal),refetchInterval:60_000});
}
export function useOwnerVenue(id: string) {
  const {session} = useAuth();
  return useQuery({queryKey:['owner-venue',session?.user.id,id],queryFn:({signal})=>getOwnerVenues(id,signal),enabled:!!id,refetchInterval:60_000});
}
