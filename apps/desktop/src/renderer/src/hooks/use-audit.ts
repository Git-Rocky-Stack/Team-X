import { useMutation, useQuery } from '@tanstack/react-query';

import type { AuditExportRequest, AuditFilter } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useAuditEvents(filter: AuditFilter | null) {
  return useQuery({
    queryKey: ['audit', 'events', filter],
    queryFn: () => ipc.audit.list(filter!),
    enabled: filter !== null && filter.companyId.length > 0,
  });
}

export function useAuditStats(companyId: string | null) {
  return useQuery({
    queryKey: ['audit', 'stats', companyId],
    queryFn: () => ipc.audit.stats(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useAuditExport() {
  return useMutation({
    mutationFn: (req: AuditExportRequest) => ipc.audit.export(req),
  });
}
