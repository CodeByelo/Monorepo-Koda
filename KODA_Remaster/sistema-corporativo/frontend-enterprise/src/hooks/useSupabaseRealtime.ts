import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useOrgStore, type OrgState } from '../store/useOrgStore';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const useSupabaseRealtime = (table: string, filter?: string) => {
  const [data, setData] = useState<any[]>([]);
  const [status, setStatus] = useState<'connecting' | 'synced' | 'error'>('connecting');
  const currentOrg = useOrgStore((state: OrgState) => state.currentOrg);

  useEffect(() => {
    if (!currentOrg) return;

    setStatus('connecting');

    const channel = supabase
      .channel(`realtime:${table}:${currentOrg.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter || `tenant_id=eq.${currentOrg.id}`,
        },
        (payload: any) => {
          setData((prev) => {
            if (payload.eventType === 'INSERT') {
              return [payload.new, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((row) => (row.id === payload.new.id ? payload.new : row));
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((row) => row.id !== payload.old.id);
            }
            return prev;
          });
        }
      )
      .subscribe((nextStatus: string) => {
        if (nextStatus === 'SUBSCRIBED') setStatus('synced');
        if (nextStatus === 'CHANNEL_ERROR') setStatus('error');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, currentOrg]);

  return { data, status };
};
