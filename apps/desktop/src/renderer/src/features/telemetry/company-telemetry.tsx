/**
 * CompanyTelemetry — company-level aggregate stats and daily charts.
 *
 * Summary cards: total runs, total tokens, total cost, avg latency, tool calls.
 * Daily charts: tokens (AreaChart) and cost (AreaChart) over a 30-day window.
 *
 * Phase 3 — M17. Recomposed onto the Command Console primitives (Phase 7a);
 * charts read the console-token theme and mount inside display wells.
 */

import type { TelemetryKindFilter } from '@team-x/shared-types';
import { Activity, DollarSign, Gauge, Radar, Rows3 } from 'lucide-react';
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

import { CHART_GRID_STROKE, CHART_SERIES, CHART_TICK, CHART_TOOLTIP_STYLE } from './chart-theme.js';

import { Faceplate, MetricTile, RecessedWell, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
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
      <Faceplate kicker="Company overview" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          Loading aggregate performance and daily telemetry trends.
        </p>
        <div data-telemetry-company-state="loading">
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Loading company telemetry"
            description="Run volume, usage, and cost analytics are syncing for this workspace."
          />
        </div>
      </Faceplate>
    );
  }

  if (statsQuery.isError || dailyQuery.isError) {
    return (
      <Faceplate kicker="Company overview" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          The analytics shell is ready, but the company telemetry queries failed.
        </p>
        <div data-telemetry-company-state="error">
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Company telemetry could not load"
            description="Retry the company summary and daily usage queries to restore the analytics surface."
            action={
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  statsQuery.refetch();
                  dailyQuery.refetch();
                }}
              >
                Retry
              </Button>
            }
          />
        </div>
      </Faceplate>
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
      <Faceplate kicker="Company overview" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          Aggregate run volume, token usage, and performance across the current telemetry filter.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            label="Runs"
            value={stats.totalRuns.toLocaleString()}
            hint="Completed executions captured in telemetry."
            icon={Rows3}
            data-telemetry-stat="total-runs"
          />
          <MetricTile
            label="Tokens"
            value={formatTokens(stats.totalTokens)}
            hint="Prompt and completion volume combined."
            icon={Activity}
          />
          <MetricTile
            label="Cost"
            value={formatCost(stats.totalCostUsd)}
            hint="Tracked provider spend for this filter."
            icon={DollarSign}
          />
          <MetricTile
            label="Latency"
            value={`${stats.avgLatencyMs}ms`}
            hint="Average completion latency."
            icon={Gauge}
          />
          <MetricTile
            label="Tool calls"
            value={stats.totalToolCalls.toLocaleString()}
            hint="Tool executions recorded in run history."
            icon={Radar}
          />
        </div>
      </Faceplate>

      {isEmpty ? (
        <Faceplate kicker="Daily trends" bodyClassName="space-y-3">
          <p className="text-caption text-silver-mute">
            There is no completed run history for the current filter yet.
          </p>
          <div data-telemetry-company-state="empty">
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No telemetry activity yet"
              description="Start chatting with employees or running agentic work to populate company analytics."
            />
          </div>
        </Faceplate>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Faceplate kicker="Daily token usage" bodyClassName="space-y-3">
            <p className="text-caption text-silver-mute">
              Thirty-day token volume trend across the current run kind.
            </p>
            <RecessedWell className="p-3">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="telemetryTokenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_SERIES.tokens} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_SERIES.tokens} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="day"
                    tick={CHART_TICK}
                    tickFormatter={(value: string) => value.slice(5)}
                  />
                  <YAxis tick={CHART_TICK} tickFormatter={(value: number) => formatTokens(value)} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: unknown) => [Number(value ?? 0).toLocaleString(), 'Tokens']}
                    labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke={CHART_SERIES.tokens}
                    fill="url(#telemetryTokenGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </RecessedWell>
          </Faceplate>

          <Faceplate kicker="Daily cost" bodyClassName="space-y-3">
            <p className="text-caption text-silver-mute">
              Thirty-day cost trend for paid providers in the current telemetry slice.
            </p>
            <RecessedWell className="p-3">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="telemetryCostGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_SERIES.cost} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_SERIES.cost} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="day"
                    tick={CHART_TICK}
                    tickFormatter={(value: string) => value.slice(5)}
                  />
                  <YAxis tick={CHART_TICK} tickFormatter={(value: number) => formatCost(value)} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: unknown) => [formatCost(Number(value ?? 0)), 'Cost']}
                    labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke={CHART_SERIES.cost}
                    fill="url(#telemetryCostGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </RecessedWell>
          </Faceplate>
        </div>
      )}
    </div>
  );
}
