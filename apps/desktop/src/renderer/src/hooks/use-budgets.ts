import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BudgetScopeKind } from '@team-x/shared-types';

import { autonomyClient } from '@/features/autonomy/autonomy-client.js';
import { requireString } from '@/lib/required.js';

function invalidateBudgetQueries(qc: ReturnType<typeof useQueryClient>, companyId: string | null) {
  if (!companyId) return;
  qc.invalidateQueries({ queryKey: ['budgets', 'overview', companyId] });
  qc.invalidateQueries({ queryKey: ['budgets', 'policies', companyId] });
  qc.invalidateQueries({ queryKey: ['budgets', 'ledger', companyId] });
  qc.invalidateQueries({ queryKey: ['budgets', 'approvals', companyId] });
}

export function useBudgetOverview(companyId: string | null) {
  return useQuery({
    queryKey: ['budgets', 'overview', companyId],
    queryFn: () => autonomyClient.budgets.getOverview(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useBudgetPolicies(companyId: string | null) {
  return useQuery({
    queryKey: ['budgets', 'policies', companyId],
    queryFn: () => autonomyClient.budgets.listPolicies(requireString(companyId, 'companyId')),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useBudgetLedger(
  companyId: string | null,
  scopeKind?: BudgetScopeKind | null,
  scopeRefId?: string | null,
  limit = 16,
) {
  return useQuery({
    queryKey: ['budgets', 'ledger', companyId, scopeKind ?? null, scopeRefId ?? null, limit],
    queryFn: () =>
      autonomyClient.budgets.listLedger({
        companyId: requireString(companyId, 'companyId'),
        scopeKind: scopeKind ?? undefined,
        scopeRefId: scopeRefId ?? undefined,
        limit,
      }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useBudgetApprovals(companyId: string | null) {
  return useQuery({
    queryKey: ['budgets', 'approvals', companyId],
    queryFn: () =>
      autonomyClient.budgets.listApprovals({
        companyId: requireString(companyId, 'companyId'),
        status: 'pending',
      }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCreateBudgetPolicy(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.budgets.createPolicy,
    onSuccess: () => invalidateBudgetQueries(qc, companyId),
  });
}

export function useUpdateBudgetPolicy(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: autonomyClient.budgets.updatePolicy,
    onSuccess: () => invalidateBudgetQueries(qc, companyId),
  });
}

export function useDeleteBudgetPolicy(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyId: string) => autonomyClient.budgets.deletePolicy(policyId),
    onSuccess: () => invalidateBudgetQueries(qc, companyId),
  });
}
