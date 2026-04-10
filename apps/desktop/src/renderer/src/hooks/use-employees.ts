import { useQuery } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useEmployees(companyId: string | null) {
  return useQuery({
    queryKey: ['employees', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled` — queryFn only runs when companyId is non-null
    queryFn: () => ipc.employees.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}
