import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';
import { displayName } from '../lib/access';

export function useOwnDisplayName(authorized: boolean) {
  const {session, loading} = useAuth();
  const id = session?.user.id;
  const profile = useQuery({
    queryKey: ['own-profile', id],
    enabled: authorized && !!id && !loading,
    staleTime: 60_000,
    queryFn: async ({signal}) => {
      // The browser session and existing RLS authorize this own-row read.
      const {data, error} = await supabase.from('staff_profiles')
        .select('first_name,last_name').eq('id', id!).abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return displayName(session?.user ?? {}, profile.isError ? null : profile.data);
}
