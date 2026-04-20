import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ipc } from '@/lib/ipc.js';

export function useOrgChart(companyId: string | null) {
  return useQuery({
    queryKey: ['orgchart', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled` — queryFn only runs when companyId is non-null
    queryFn: () => ipc.orgchart.get(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

/**
 * Company-scoped org-chart invalidation for the read-side tree.
 * `useEmployeeEventSync` also invalidates this key when mounted; this
 * hook lets OrgChartView stand alone without depending on the employee
 * list surface being present in the same route.
 */
export function useOrgChartEventSync(companyId: string | null): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'employee.hired' &&
        event.type !== 'employee.fired' &&
        event.type !== 'employee.promoted' &&
        event.type !== 'employee.managerSet'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['orgchart', companyId] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
