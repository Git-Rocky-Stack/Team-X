import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrgchartGetResponse } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

interface MutationContext {
  previousOrgChart?: OrgchartGetResponse;
}

export function useFireEmployee(companyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['orgchart', companyId] as const;

  return useMutation<void, Error, string, MutationContext>({
    mutationFn: (employeeId: string) => ipc.employees.fire({ employeeId }),
    onMutate: async (employeeId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousOrgChart = queryClient.getQueryData<OrgchartGetResponse>(queryKey);

      if (previousOrgChart) {
        const removedManagerEdges = previousOrgChart.edges.filter(
          (edge) => edge.managerId === employeeId,
        );
        const orphanedReportIds = removedManagerEdges.map((edge) => edge.reportId);
        queryClient.setQueryData<OrgchartGetResponse>(queryKey, {
          ...previousOrgChart,
          employees: previousOrgChart.employees.filter((employee) => employee.id !== employeeId),
          edges: previousOrgChart.edges.filter(
            (edge) => edge.managerId !== employeeId && edge.reportId !== employeeId,
          ),
          rootIds: Array.from(
            new Set([
              ...previousOrgChart.rootIds.filter((rootId) => rootId !== employeeId),
              ...orphanedReportIds,
            ]),
          ),
        });
      }

      return { previousOrgChart };
    },
    onError: (_error, _employeeId, context) => {
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
