import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useAgentImprovement(companyId: string | null) {
  return useQuery({
    queryKey: ['agent-improvement', companyId],
    queryFn: () => autonomyClient.agentImprovement.list(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useRunAgentImprovement(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['agent-improvement', companyId, 'run'],
    mutationFn: () =>
      autonomyClient.agentImprovement.run({
        companyId: requireString(companyId, 'companyId'),
      }),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['agent-improvement', companyId] });
      qc.invalidateQueries({ queryKey: ['tickets', companyId] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
