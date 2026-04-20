import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EmployeesPromoteResponse, OrgchartGetResponse } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

interface PromoteEmployeeVariables {
  employeeId: string;
  newRoleId: string;
  optimisticLevel?: string;
  optimisticTitle?: string;
}

interface MutationContext {
  previousOrgChart?: OrgchartGetResponse;
}

export function usePromoteEmployee(companyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['orgchart', companyId] as const;

  return useMutation<EmployeesPromoteResponse, Error, PromoteEmployeeVariables, MutationContext>({
    mutationFn: ({ employeeId, newRoleId }) => ipc.employees.promote({ employeeId, newRoleId }),
    onMutate: async ({ employeeId, newRoleId, optimisticLevel, optimisticTitle }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousOrgChart = queryClient.getQueryData<OrgchartGetResponse>(queryKey);

      if (previousOrgChart) {
        queryClient.setQueryData<OrgchartGetResponse>(queryKey, {
          ...previousOrgChart,
          employees: previousOrgChart.employees.map((employee) =>
            employee.id === employeeId
              ? {
                  ...employee,
                  roleId: newRoleId,
                  level: optimisticLevel ?? employee.level,
                  title: optimisticTitle ?? employee.title,
                }
              : employee,
          ),
        });
      }

      return { previousOrgChart };
    },
    onSuccess: (response) => {
      queryClient.setQueryData<OrgchartGetResponse>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          employees: current.employees.map((employee) =>
            employee.id === response.employeeId
              ? {
                  ...employee,
                  roleId: response.newRoleId,
                  level: response.newLevel,
                  title: response.newTitle,
                }
              : employee,
          ),
        };
      });
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
