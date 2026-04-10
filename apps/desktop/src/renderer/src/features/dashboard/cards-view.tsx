import type { Employee } from '@team-x/shared-types';

import { useAppStore } from '@/store/app-store.js';

import { EmployeeCard } from './employee-card.js';

interface CardsViewProps {
  employees: Employee[];
}

export function CardsView({ employees }: CardsViewProps) {
  const employeeLive = useAppStore((s) => s.employeeLive);

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
      {employees.map((emp) => (
        <EmployeeCard key={emp.id} employee={emp} live={employeeLive[emp.id]} />
      ))}
    </div>
  );
}
