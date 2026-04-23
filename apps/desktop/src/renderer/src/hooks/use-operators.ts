import { useQuery } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';

export function useOperators(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', companyId],
    queryFn: () => autonomyClient.operators.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}
