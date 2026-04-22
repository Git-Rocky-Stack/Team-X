import { useQuery } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useInstalledExtensions(companyId: string | null) {
  return useQuery({
    queryKey: ['extensions', companyId],
    queryFn: () => ipc.extensions.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useAuthorityGrants(companyId: string | null, employeeId?: string | null) {
  return useQuery({
    queryKey: ['authority', companyId, employeeId ?? null],
    queryFn: () => ipc.authority.list({ companyId: companyId!, employeeId }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useMcpServers(companyId: string | null) {
  return useQuery({
    queryKey: ['mcp', companyId],
    queryFn: () => ipc.mcp.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}
