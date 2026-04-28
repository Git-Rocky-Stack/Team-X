import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  Employee,
  EmployeesUpdateRequest,
  EmployeesUpdateResponse,
  OrgchartGetResponse,
} from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

interface MutationContext {
  previousEmployees?: Employee[];
  previousOrgChart?: OrgchartGetResponse;
}

export function useUpdateEmployee(companyId: string) {
  const queryClient = useQueryClient();
  const employeesKey = ['employees', companyId] as const;
  const orgChartKey = ['orgchart', companyId] as const;

  return useMutation<EmployeesUpdateResponse, Error, EmployeesUpdateRequest, MutationContext>({
    mutationFn: (req) => ipc.employees.update(req),
    onMutate: async (patch) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: employeesKey }),
        queryClient.cancelQueries({ queryKey: orgChartKey }),
      ]);
      const previousEmployees = queryClient.getQueryData<Employee[]>(employeesKey);
      const previousOrgChart = queryClient.getQueryData<OrgchartGetResponse>(orgChartKey);

      const applyPatch = (employee: Employee): Employee => {
        if (employee.id !== patch.employeeId) return employee;
        const next: Employee = {
          ...employee,
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        };
        if (patch.modelPref !== undefined) {
          const trimmed = patch.modelPref?.trim() ?? '';
          if (trimmed) next.modelPref = trimmed;
          else next.modelPref = undefined;
        }
        if (patch.providerPref !== undefined) {
          const trimmed = patch.providerPref?.trim() ?? '';
          if (trimmed) next.providerPref = trimmed;
          else next.providerPref = undefined;
        }
        if (patch.avatar !== undefined) {
          const trimmed = patch.avatar?.trim() ?? '';
          if (trimmed) next.avatar = trimmed;
          else next.avatar = undefined;
        }
        return next;
      };

      if (previousEmployees) {
        queryClient.setQueryData<Employee[]>(employeesKey, previousEmployees.map(applyPatch));
      }
      if (previousOrgChart) {
        queryClient.setQueryData<OrgchartGetResponse>(orgChartKey, {
          ...previousOrgChart,
          employees: previousOrgChart.employees.map(applyPatch),
        });
      }

      return { previousEmployees, previousOrgChart };
    },
    onSuccess: ({ employee }) => {
      queryClient.setQueryData<Employee[]>(employeesKey, (current) =>
        current?.map((row) => (row.id === employee.id ? employee : row)),
      );
      queryClient.setQueryData<OrgchartGetResponse>(orgChartKey, (current) =>
        current
          ? {
              ...current,
              employees: current.employees.map((row) => (row.id === employee.id ? employee : row)),
            }
          : current,
      );
    },
    onError: (_error, _variables, context) => {
      if (context?.previousEmployees) {
        queryClient.setQueryData(employeesKey, context.previousEmployees);
      }
      if (context?.previousOrgChart) {
        queryClient.setQueryData(orgChartKey, context.previousOrgChart);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: employeesKey });
      queryClient.invalidateQueries({ queryKey: orgChartKey });
    },
  });
}
