import type { Employee } from '@team-x/shared-types';
import { RefreshCw } from 'lucide-react';

import { EmployeeCard } from './employee-card.js';

import { RecessedWell, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAppStore } from '@/store/app-store.js';

function SkeletonCard() {
  return (
    <RecessedWell className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-5 w-12 rounded-md" />
      </div>
      <Skeleton className="h-3 w-24" />
    </RecessedWell>
  );
}

interface CardsViewProps {
  employees: Employee[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function CardsView({ employees, isLoading, isError, onRetry }: CardsViewProps) {
  const employeeLive = useAppStore((s) => s.employeeLive);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col p-6">
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load employees"
          action={
            onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="flex h-full flex-col p-6">
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No employees yet"
          description="Hire employees to populate the roster grid."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
      {employees.map((emp) => (
        <EmployeeCard key={emp.id} employee={emp} live={employeeLive[emp.id]} />
      ))}
    </div>
  );
}
