import { useQuery } from '@tanstack/react-query';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';

function requireString(value: string | null | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

export function useAutonomyDoctor(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['autonomy-doctor', companyId],
    enabled: Boolean(companyId),
    queryFn: () => autonomyClient.autonomyDoctor.run(requireString(companyId, 'companyId')),
    refetchOnWindowFocus: false,
  });
}
