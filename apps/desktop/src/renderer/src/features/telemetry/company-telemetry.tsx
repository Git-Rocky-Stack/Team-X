/**
 * CompanyTelemetry — company-level aggregate stats and daily charts.
 *
 * Summary cards: total runs, total tokens, total cost, avg latency, tool calls.
 * Daily charts: tokens (AreaChart) and cost (AreaChart) over a 30-day window.
 *
 * Phase 3 — M17.
 */

import type { TelemetryKindFilter } from '@team-x/shared-types';
import { Activity, BarChart3, DollarSign, Gauge, Radar, Rows3 } from 'lucide-react';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';


import { Button } from '@/components/ui/button.js';
import {
  MissionMetricTile,
  MissionSectionCard,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { telemetryRequestKind, useCompanyStats, useDailyUsage } from '@/hooks/use-telemetry.js';

const DAY_MS = 86_400_000;

interface Props {
  companyId: string;
  kindFilter: TelemetryKindFilter;
}

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

export function CompanyTelemetry({ companyId, kindFilter }: Props) {
  const now = useMemo(() => Date.now(), []);
  const thirtyDaysAgo = now - 30 * DAY_MS;
  const kind = telemetryRequestKind(kindFilter);

  const statsQuery = useCompanyStats({ companyId, kind });
  const dailyQuery = useDailyUsage({
    companyId,
    fromMs: thirtyDaysAgo,
    toMs: now,
    kind,
  });

  if (statsQuery.isLoading || dailyQuery.isLoading) {
    return (
      <MissionSectionCard
        title="Company overview"
        description="Loading aggregate performance and daily telemetry trends."
      >
        <MissionStateBlock
          title="Loading company telemetry"
          description="Run volume, usage, and cost analytics are syncing for this workspace."
          icon={Radar}
          data-telemetry-company-state="loading"
        />
      </MissionSectionCard>
    );
  }

  if (statsQuery.isError || dailyQuery.isError) {
    return (
      <MissionSectionCard
        title="Company overview"
        description="The analytics shell is ready, but the company telemetry queries failed."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
              onClick={() => {
                statsQuery.refetch();
                dailyQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        }
      >
        <MissionStateBlock
          title="Company telemetry could not load"
          description="Retry the company summary and daily usage queries to restore the analytics surface."
          icon={BarChart3}
          tone="danger"
          data-telemetry-company-state="error"
        />
      </MissionSectionCard>
    );
  }

  const stats = statsQuery.data ?? {
    totalRuns: 0,
    totalTokens: 0,
    totalCostUsd: '0',
    avgLatencyMs: 0,
    totalToolCalls: 0,
  };

  const chartData = (dailyQuery.data ?? []).map((day) => ({
    day: day.day,
    tokens: day.totalTokens,
    cost: Number.parseFloat(day.costUsd),
  }));

  const isEmpty = stats.totalRuns === 0;

  return (
    <div className="grid gap-6">
      <MissionSectionCard
        title="Company overview"
        description="Aggregate run volume, token usage, and performance across the current telemetry filter."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MissionMetricTile
            label="Runs"
            value={stats.totalRuns.toLocaleString()}
            hint="Completed executions captured in telemetry."
            icon={Rows3}
            data-telemetry-stat="total-runs"
          />
          <MissionMetricTile
            label="Tokens"
            value={formatTokens(stats.totalTokens)}
            hint="Prompt and completion volume combined."
            icon={Activity}
          />
          <MissionMetricTile
            label="Cost"
            value={formatCost(stats.totalCostUsd)}
            hint="Tracked provider spend for this filter."
            icon={DollarSign}
          />
          <MissionMetricTile
            label="Latency"
            value={`${stats.avgLatencyMs}ms`}
            hint="Average completion latency."
            icon={Gauge}
          />
          <MissionMetricTile
            label="Tool calls"
            value={stats.totalToolCalls.toLocaleString()}
            hint="Tool executions recorded in run history."
            icon={Radar}
          />
        </div>
      </MissionSectionCard>

      {isEmpty ? (
        <MissionSectionCard
          title="Daily trends"
          description="There is no completed run history for the current filter yet."
        >
          <MissionStateBlock
            title="No telemetry activity yet"
            description="Start chatting with employees or running agentic work to populate company analytics."
            icon={BarChart3}
            data-telemetry-company-state="empty"
          />
        </MissionSectionCard>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <MissionSectionCard
            title="Daily token usage"
            description="Thirty-day token volume trend across the current run kind."
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="telemetryTokenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c53439" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#c53439" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value: number) => formatTokens(value)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown) => [Number(value ?? 0).toLocaleString(), 'Tokens']}
                  labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#c53439"
                  fill="url(#telemetryTokenGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </MissionSectionCard>

          <MissionSectionCard
            title="Daily cost"
            description="Thirty-day cost trend for paid providers in the current telemetry slice."
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="telemetryCostGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value: number) => formatCost(value)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: unknown) => [formatCost(Number(value ?? 0)), 'Cost']}
                  labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#22c55e"
                  fill="url(#telemetryCostGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </MissionSectionCard>
        </div>
      )}
    </div>
  );
}
