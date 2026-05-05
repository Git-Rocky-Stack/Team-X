/**
 * EmployeeTelemetry — per-employee telemetry table with sortable columns.
 *
 * Columns: Name, Role, Total Runs, Total Tokens, Avg Latency, Cost, Tool Calls.
 * Click any column header to sort. Joined with employee data for name/role display.
 *
 * Phase 3 — M17.
 */

import type { TelemetryKindFilter } from '@team-x/shared-types';
import { ArrowDown, ArrowUp, ArrowUpDown, Users2 } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import {
  MissionInsetSurface,
  MissionSectionCard,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { useEmployees } from '@/hooks/use-employees.js';
import { telemetryRequestKind, useEmployeeStats } from '@/hooks/use-telemetry.js';

interface Props {
  companyId: string;
  kindFilter: TelemetryKindFilter;
}

type SortKey = 'name' | 'totalRuns' | 'totalTokens' | 'avgLatencyMs' | 'costUsd' | 'totalToolCalls';
type SortDir = 'asc' | 'desc';

function formatCost(usd: string | number): string {
  const value = typeof usd === 'string' ? Number.parseFloat(usd) : usd;
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function EmployeeTelemetry({ companyId, kindFilter }: Props) {
  const kind = telemetryRequestKind(kindFilter);
  const statsQuery = useEmployeeStats({ companyId, kind });
  const employeeQuery = useEmployees(companyId);
  const [sortKey, setSortKey] = useState<SortKey>('totalRuns');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const employeeMap = useMemo(() => {
    if (!employeeQuery.data) return new Map<string, { name: string; title: string }>();
    return new Map(
      employeeQuery.data.map((employee) => [
        employee.id,
        { name: employee.name, title: employee.title },
      ]),
    );
  }, [employeeQuery.data]);

  const rows = useMemo(() => {
    if (!statsQuery.data) return [];
    const enriched = statsQuery.data.map((row) => {
      const employee = employeeMap.get(row.employeeId);
      return {
        ...row,
        name: employee?.name ?? row.employeeId,
        title: employee?.title ?? '',
        costNum: Number.parseFloat(row.costUsd),
      };
    });

    enriched.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'totalRuns':
          comparison = a.totalRuns - b.totalRuns;
          break;
        case 'totalTokens':
          comparison = a.totalTokens - b.totalTokens;
          break;
        case 'avgLatencyMs':
          comparison = a.avgLatencyMs - b.avgLatencyMs;
          break;
        case 'costUsd':
          comparison = a.costNum - b.costNum;
          break;
        case 'totalToolCalls':
          comparison = a.totalToolCalls - b.totalToolCalls;
          break;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return enriched;
  }, [employeeMap, sortDir, sortKey, statsQuery.data]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  }

  if (statsQuery.isLoading || employeeQuery.isLoading) {
    return (
      <MissionSectionCard
        title="Employee breakdown"
        description="Loading per-employee analytics for the current telemetry filter."
      >
        <MissionStateBlock
          title="Loading employee telemetry"
          description="Operator output, latency, and tool-call analytics are syncing for this workspace."
          icon={Users2}
          data-telemetry-employees-state="loading"
        />
      </MissionSectionCard>
    );
  }

  if (statsQuery.isError || employeeQuery.isError) {
    return (
      <MissionSectionCard
        title="Employee breakdown"
        description="The employee analytics queries failed for the current telemetry slice."
        actions={
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
            onClick={() => {
              statsQuery.refetch();
              employeeQuery.refetch();
            }}
          >
            Retry
          </Button>
        }
      >
        <MissionStateBlock
          title="Employee telemetry could not load"
          description="Retry the employee stats and roster queries to restore the comparison table."
          icon={Users2}
          tone="danger"
          data-telemetry-employees-state="error"
        />
      </MissionSectionCard>
    );
  }

  if (rows.length === 0) {
    return (
      <MissionSectionCard
        title="Employee breakdown"
        description="No employee run history exists for the current telemetry filter."
      >
        <MissionStateBlock
          title="No employee telemetry yet"
          description="Employees will appear here once they process work and generate completed runs."
          icon={Users2}
          data-telemetry-employees-state="empty"
        />
      </MissionSectionCard>
    );
  }

  return (
    <MissionSectionCard
      title="Employee breakdown"
      description="Sortable run, token, latency, cost, and tool-call analytics per operator."
      className="overflow-hidden"
    >
      <MissionInsetSurface className="overflow-hidden rounded-[20px] bg-black/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-black/20">
              <Th col="name" label="Employee" onClick={toggleSort}>
                <SortIcon column="name" />
              </Th>
              <Th col="totalRuns" label="Runs" onClick={toggleSort} right>
                <SortIcon column="totalRuns" />
              </Th>
              <Th col="totalTokens" label="Tokens" onClick={toggleSort} right>
                <SortIcon column="totalTokens" />
              </Th>
              <Th col="avgLatencyMs" label="Avg Latency" onClick={toggleSort} right>
                <SortIcon column="avgLatencyMs" />
              </Th>
              <Th col="costUsd" label="Cost" onClick={toggleSort} right>
                <SortIcon column="costUsd" />
              </Th>
              <Th col="totalToolCalls" label="Tool Calls" onClick={toggleSort} right>
                <SortIcon column="totalToolCalls" />
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.employeeId}
                className="border-b border-white/10 transition-colors last:border-b-0 hover:bg-surface-100/20"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.title}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{row.totalRuns}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatTokens(row.totalTokens)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{row.avgLatencyMs}ms</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCost(row.costUsd)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.totalToolCalls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </MissionInsetSurface>
    </MissionSectionCard>
  );
}

function Th({
  col,
  label,
  onClick,
  right,
  children,
}: {
  col: SortKey;
  label: string;
  onClick: (key: SortKey) => void;
  right?: boolean;
  children: ReactNode;
}) {
  return (
    <th className={`px-4 py-3 text-xs font-medium ${right ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        className={`inline-flex items-center text-muted-foreground transition-colors hover:text-foreground ${
          right ? 'justify-end' : 'justify-start'
        }`}
        onClick={() => onClick(col)}
      >
        {label}
        {children}
      </button>
    </th>
  );
}
