import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HireEmployeeRequest } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useHireEmployee() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (req: HireEmployeeRequest) => ipc.employees.create(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
