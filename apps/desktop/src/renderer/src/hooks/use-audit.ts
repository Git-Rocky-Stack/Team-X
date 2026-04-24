import { useMutation, useQuery } from '@tanstack/react-query';

import type { AuditExportRequest, AuditFilter } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';
import { requireString, requireValue } from '@/lib/required.js';

export function useAuditEvents(filter: AuditFilter | null) {
  return useQuery({
    queryKey: ['audit', 'events', filter],
    queryFn: () => ipc.audit.list(requireValue(filter, 'filter')),
    enabled: filter !== null && filter.companyId.length > 0,
  });
}

export function useAuditStats(companyId: string | null) {
  return useQuery({
    queryKey: ['audit', 'stats', companyId],
    queryFn: () => ipc.audit.stats(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useAuditExport() {
  return useMutation({
    mutationFn: (req: AuditExportRequest) => ipc.audit.export(req),
  });
}
