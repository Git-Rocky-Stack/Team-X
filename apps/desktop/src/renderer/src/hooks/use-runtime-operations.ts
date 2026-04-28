import { useQuery } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useRuntimeOperations(companyId: string | null) {
  return useQuery({
    queryKey: ['runtime-operations', companyId],
    queryFn: () => autonomyClient.runtimeOperations.snapshot(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
    refetchInterval: 3000,
  });
}
