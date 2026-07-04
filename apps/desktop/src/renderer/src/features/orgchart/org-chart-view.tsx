import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { EmployeeProfileDialog, type EmployeeProfileSaveInput } from './employee-profile-dialog.js';
import { FireDialog } from './fire-dialog.js';
import { OrgChartTree } from './org-chart-tree.js';
import { PromoteDialog } from './promote-dialog.js';

import { Faceplate, SubviewState } from '@/components/console/index.js';
import { useFireEmployee } from '@/hooks/use-fire-employee.js';
import { useOrgChart, useOrgChartEventSync } from '@/hooks/use-org-chart.js';
import { usePromoteEmployee } from '@/hooks/use-promote-employee.js';
import { ROLE_OPTIONS } from '@/hooks/use-roles.js';
import { useSetManager } from '@/hooks/use-set-manager.js';
import { useUpdateEmployee } from '@/hooks/use-update-employee.js';
import { useAppStore } from '@/store/app-store.js';

interface OrgChartViewProps {
  companyId: string | null;
}

export function OrgChartView({ companyId }: OrgChartViewProps) {
  useOrgChartEventSync(companyId);
  const { data: orgChart, isLoading, isError, refetch } = useOrgChart(companyId);
  const fireEmployee = useFireEmployee(companyId ?? '');
  const updateEmployee = useUpdateEmployee(companyId ?? '');
  const promoteEmployee = usePromoteEmployee(companyId ?? '');
  const setManager = useSetManager(companyId ?? '');
  const setSelectedEmployee = useAppStore((state) => state.setSelectedEmployee);
  const [toast, setToast] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState<Employee | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<Employee | null>(null);
  const [fireTarget, setFireTarget] = useState<Employee | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [fireError, setFireError] = useState<string | null>(null);

  function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function handleSetManager(employeeId: string, managerId: string | null) {
    try {
      setToast(null);
      await setManager.mutateAsync({ employeeId, managerId });
      setToast('Reporting line updated.');
    } catch (error) {
      setToast(`Could not update reporting line. ${errorMessage(error)}`);
    }
  }

  async function handlePromote(employeeId: string, roleId: string) {
    const role = ROLE_OPTIONS.find((option) => option.id === roleId);
    try {
      setPromoteError(null);
      await promoteEmployee.mutateAsync({
        employeeId,
        newRoleId: roleId,
        optimisticLevel: role?.level,
        optimisticTitle: role?.name,
      });
      setPromoteTarget(null);
      setToast('Employee role updated.');
    } catch (error) {
      setPromoteError(errorMessage(error));
    }
  }

  async function handleSaveProfile(input: EmployeeProfileSaveInput) {
    const current = orgChart?.employees.find((employee) => employee.id === input.employeeId);
    const currentManagerId =
      orgChart?.edges.find((edge) => edge.reportId === input.employeeId)?.managerId ?? null;
    const role = ROLE_OPTIONS.find((option) => option.id === input.roleId);

    try {
      setProfileError(null);
      setToast(null);
      if (current && input.roleId !== current.roleId) {
        await promoteEmployee.mutateAsync({
          employeeId: input.employeeId,
          newRoleId: input.roleId,
          optimisticLevel: role?.level,
          optimisticTitle: role?.name,
        });
      }
      await updateEmployee.mutateAsync({
        employeeId: input.employeeId,
        name: input.name,
        title: input.title,
        modelPref: input.modelPref,
        providerPref: input.providerPref,
        avatar: input.avatar,
      });
      if (input.managerId !== currentManagerId) {
        await setManager.mutateAsync({
          employeeId: input.employeeId,
          managerId: input.managerId,
        });
      }
      setProfileTarget(null);
      setToast('Employee profile updated.');
    } catch (error) {
      setProfileError(errorMessage(error));
    }
  }

  async function handleFire(employeeId: string) {
    try {
      setFireError(null);
      await fireEmployee.mutateAsync(employeeId);
      setFireTarget(null);
      setToast('Employee removed.');
    } catch (error) {
      setFireError(errorMessage(error));
    }
  }

  if (companyId === null) {
    return (
      <section
        className="flex h-full flex-col justify-center px-6"
        data-org-chart-view=""
        data-org-chart-state="no-company"
      >
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No workspace selected"
          description="Choose or create a workspace to view its reporting structure."
        />
      </section>
    );
  }

  if (isLoading) {
    return (
      <section
        className="flex h-full flex-col justify-center px-6"
        data-org-chart-view=""
        data-org-chart-state="loading"
      >
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading org chart..." />
      </section>
    );
  }

  if (isError || !orgChart) {
    return (
      <section
        className="flex h-full flex-col justify-center px-6"
        data-org-chart-view=""
        data-org-chart-state="error"
      >
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Org chart could not load"
          action={
            <button
              type="button"
              className="cap px-3 py-1.5 text-button"
              data-org-chart-retry=""
              onClick={() => refetch()}
            >
              Retry
            </button>
          }
        />
      </section>
    );
  }

  if (orgChart.employees.length === 0) {
    return (
      <section
        className="flex h-full flex-col justify-center px-6"
        data-org-chart-view=""
        data-org-chart-state="empty"
      >
        <SubviewState
          lampLabel="STBY"
          lampTone="off"
          title="No employees yet"
          description="Hire your first role to build the org chart."
        />
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col" data-org-chart-view="">
      <div className="p-4 pb-0 lg:p-6 lg:pb-0">
        <Faceplate kicker="Org Chart" serial="REPORTING LINES">
          <h1 className="text-h1 text-foreground">Org chart</h1>
          <p className="text-caption text-silver-mute">
            Reporting lines are shown from company roots down.
          </p>
        </Faceplate>
      </div>

      <OrgChartTree
        employees={orgChart.employees}
        edges={orgChart.edges}
        rootIds={orgChart.rootIds}
        onChat={setSelectedEmployee}
        onProfile={(employee) => {
          setProfileError(null);
          setProfileTarget(employee);
        }}
        onPromote={(employee) => {
          setPromoteError(null);
          setPromoteTarget(employee);
        }}
        onFire={(employee) => {
          setFireError(null);
          setFireTarget(employee);
        }}
        onSetManager={handleSetManager}
      />

      {toast ? (
        <output
          className="fixed bottom-4 right-4 z-50 max-w-md rounded-card border border-[var(--hairline)] bg-background px-4 py-3 text-body text-foreground shadow-lg"
          data-org-chart-toast=""
        >
          {toast}
        </output>
      ) : null}

      <EmployeeProfileDialog
        companyId={companyId}
        employee={profileTarget}
        employees={orgChart.employees}
        currentManagerId={
          profileTarget
            ? (orgChart.edges.find((edge) => edge.reportId === profileTarget.id)?.managerId ?? null)
            : null
        }
        open={profileTarget !== null}
        onOpenChange={(open) => {
          if (!open) setProfileTarget(null);
        }}
        onSave={handleSaveProfile}
        error={profileError}
      />
      <PromoteDialog
        employee={promoteTarget}
        open={promoteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPromoteTarget(null);
        }}
        onPromote={handlePromote}
        error={promoteError}
      />
      <FireDialog
        employee={fireTarget}
        open={fireTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFireTarget(null);
        }}
        onFire={handleFire}
        error={fireError}
      />
    </section>
  );
}
