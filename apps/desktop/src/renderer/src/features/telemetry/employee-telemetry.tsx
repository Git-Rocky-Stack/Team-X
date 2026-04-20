/**
 * EmployeeTelemetry — per-employee telemetry table with sortable columns.
 *
 * Columns: Name, Role, Total Runs, Total Tokens, Avg Latency, Cost, Tool Calls.
 * Click any column header to sort. Joined with employee data for name/role display.
 *
 * Phase 3 — M17.
 */

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useEmployees } from '@/hooks/use-employees.js';
import { useEmployeeStats } from '@/hooks/use-telemetry.js';

interface Props {
  companyId: string;
}

type SortKey = 'name' | 'totalRuns' | 'totalTokens' | 'avgLatencyMs' | 'costUsd' | 'totalToolCalls';
type SortDir = 'asc' | 'desc';

function formatCost(usd: string | number): string {
  const n = typeof usd === 'string' ? Number.parseFloat(usd) : usd;
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function EmployeeTelemetry({ companyId }: Props) {
  const { data: stats, isLoading: statsLoading } = useEmployeeStats({ companyId });
  const { data: employees, isLoading: empLoading } = useEmployees(companyId);
  const [sortKey, setSortKey] = useState<SortKey>('totalRuns');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const empMap = useMemo(() => {
    if (!employees) return new Map<string, { name: string; title: string }>();
    return new Map(employees.map((e) => [e.id, { name: e.name, title: e.title }]));
  }, [employees]);

  const rows = useMemo(() => {
    if (!stats) return [];
    const enriched = stats.map((s) => {
      const emp = empMap.get(s.employeeId);
      return {
        ...s,
        name: emp?.name ?? s.employeeId,
        title: emp?.title ?? '',
        costNum: Number.parseFloat(s.costUsd),
      };
    });

    enriched.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'totalRuns':
          cmp = a.totalRuns - b.totalRuns;
          break;
        case 'totalTokens':
          cmp = a.totalTokens - b.totalTokens;
          break;
        case 'avgLatencyMs':
          cmp = a.avgLatencyMs - b.avgLatencyMs;
          break;
        case 'costUsd':
          cmp = a.costNum - b.costNum;
          break;
        case 'totalToolCalls':
          cmp = a.totalToolCalls - b.totalToolCalls;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return enriched;
  }, [stats, empMap, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  }

  if (statsLoading || empLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading employee telemetry...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-50 p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No completed runs yet. Employees will appear here once they process tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-50 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-100/50">
            <Th col="name" label="Employee" onClick={toggleSort}>
              <SortIcon col="name" />
            </Th>
            <Th col="totalRuns" label="Runs" onClick={toggleSort} right>
              <SortIcon col="totalRuns" />
            </Th>
            <Th col="totalTokens" label="Tokens" onClick={toggleSort} right>
              <SortIcon col="totalTokens" />
            </Th>
            <Th col="avgLatencyMs" label="Avg Latency" onClick={toggleSort} right>
              <SortIcon col="avgLatencyMs" />
            </Th>
            <Th col="costUsd" label="Cost" onClick={toggleSort} right>
              <SortIcon col="costUsd" />
            </Th>
            <Th col="totalToolCalls" label="Tool Calls" onClick={toggleSort} right>
              <SortIcon col="totalToolCalls" />
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.employeeId}
              className="border-b border-border/50 transition-colors hover:bg-surface-100/30"
            >
              <td className="px-3 py-2.5">
                <div className="font-medium text-foreground">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.title}</div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.totalRuns}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatTokens(row.totalTokens)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.avgLatencyMs}ms</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatCost(row.costUsd)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.totalToolCalls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  children: React.ReactNode;
}) {
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-muted-foreground ${
        right ? 'text-right' : 'text-left'
      }`}
      onClick={() => onClick(col)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(col);
      }}
    >
      {label}
      {children}
    </th>
  );
}
