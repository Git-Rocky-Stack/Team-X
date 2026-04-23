import { useQuery } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useOperators(companyId: string | null) {
  return useQuery({
    queryKey: ['operators', companyId],
    queryFn: () => ipc.operators.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}
