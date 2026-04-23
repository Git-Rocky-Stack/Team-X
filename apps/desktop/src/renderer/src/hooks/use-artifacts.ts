import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

export function useArtifacts(companyId: string | null, limit = 100) {
  return useQuery({
    queryKey: ['artifacts', companyId, limit],
    queryFn: () => ipc.artifacts.list({ companyId: companyId!, limit }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useArtifactEventSync(companyId: string | null, limit = 100): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'routine.runCompleted' &&
        event.type !== 'approval.reviewed' &&
        event.type !== 'vault.file_created'
      ) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['artifacts', companyId, limit] });
    });
    return unsubscribe;
  }, [companyId, limit, queryClient]);
}
