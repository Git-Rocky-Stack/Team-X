import type { ApprovalItemKind, ApprovalItemStatus } from '@team-x/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useApprovals(
  companyId: string | null,
  kind?: ApprovalItemKind,
  status?: ApprovalItemStatus,
) {
  return useQuery({
    queryKey: ['approvals', companyId, kind ?? null, status ?? null],
    queryFn: () => ipc.approvals.list({ companyId: companyId!, kind, status }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useReviewApproval(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.approvals.review,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['approvals', companyId] });
      qc.invalidateQueries({ queryKey: ['budgets', 'overview', companyId] });
      qc.invalidateQueries({ queryKey: ['budgets', 'approvals', companyId] });
      qc.invalidateQueries({ queryKey: ['authority-requests', companyId] });
      qc.invalidateQueries({ queryKey: ['authority', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['effective-authority', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
