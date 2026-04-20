import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrgchartGetResponse } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

interface SetManagerVariables {
  employeeId: string;
  managerId: string | null;
}

interface MutationContext {
  previousOrgChart?: OrgchartGetResponse;
}

export function useSetManager(companyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['orgchart', companyId] as const;

  return useMutation<void, Error, SetManagerVariables, MutationContext>({
    mutationFn: ({ employeeId, managerId }) => ipc.employees.setManager({ employeeId, managerId }),
    onMutate: async ({ employeeId, managerId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousOrgChart = queryClient.getQueryData<OrgchartGetResponse>(queryKey);

      if (previousOrgChart) {
        const nextEdges = previousOrgChart.edges.filter((edge) => edge.reportId !== employeeId);
        if (managerId !== null) {
          nextEdges.push({
            id: `optimistic-${employeeId}`,
            managerId,
            reportId: employeeId,
            createdAt: Date.now(),
          });
        }

        queryClient.setQueryData<OrgchartGetResponse>(queryKey, {
          ...previousOrgChart,
          edges: nextEdges,
          rootIds:
            managerId === null
              ? Array.from(new Set([...previousOrgChart.rootIds, employeeId]))
              : previousOrgChart.rootIds.filter((rootId) => rootId !== employeeId),
        });
      }

      return { previousOrgChart };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousOrgChart) {
        queryClient.setQueryData(queryKey, context.previousOrgChart);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['employees', companyId] });
    },
  });
}
