import { useQuery } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

export function useOperators(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', companyId],
    queryFn: () => autonomyClient.operators.list(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useSharingReadiness(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', 'sharing-readiness', companyId],
    queryFn: () => autonomyClient.operators.readiness(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}
