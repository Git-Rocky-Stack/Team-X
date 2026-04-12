/**
 * CompanyTelemetry — company-level aggregate stats and daily charts.
 *
 * Summary cards: total runs, total tokens, total cost, avg latency, tool calls.
 * Daily charts: tokens (AreaChart) and cost (AreaChart) over a 30-day window.
 *
 * Phase 3 — M17.
 */

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

import { useCompanyStats, useDailyUsage } from '@/hooks/use-telemetry.js';

const DAY_MS = 86_400_000;

interface Props {
  companyId: string;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-50 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

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

export function CompanyTelemetry({ companyId }: Props) {
  const now = useMemo(() => Date.now(), []);
  const thirtyDaysAgo = now - 30 * DAY_MS;

  const { data: stats, isLoading: statsLoading } = useCompanyStats(companyId);
  const { data: daily, isLoading: dailyLoading } = useDailyUsage(companyId, thirtyDaysAgo, now);

  if (statsLoading || dailyLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading telemetry...
      </div>
    );
  }

  const s = stats ?? {
    totalRuns: 0,
    totalTokens: 0,
    totalCostUsd: '0',
    avgLatencyMs: 0,
    totalToolCalls: 0,
  };

  const chartData = (daily ?? []).map((d) => ({
    day: d.day,
    tokens: d.totalTokens,
    prompt: d.promptTokens,
    completion: d.completionTokens,
    cost: Number.parseFloat(d.costUsd),
    runs: d.totalRuns,
  }));

  const isEmpty = s.totalRuns === 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Runs" value={s.totalRuns.toLocaleString()} />
        <StatCard label="Total Tokens" value={formatTokens(s.totalTokens)} />
        <StatCard label="Total Cost" value={formatCost(s.totalCostUsd)} />
        <StatCard label="Avg Latency" value={`${s.avgLatencyMs}ms`} />
        <StatCard label="Tool Calls" value={s.totalToolCalls.toLocaleString()} />
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-border bg-surface-50 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No completed runs yet. Start chatting with employees to generate telemetry data.
          </p>
        </div>
      ) : (
        <>
          {/* Daily token usage chart */}
          <div className="rounded-lg border border-border bg-surface-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              Daily Token Usage (30 days)
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFAA2024" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FFAA2024" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: number) => formatTokens(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-50)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(v: unknown) => [Number(v ?? 0).toLocaleString(), 'Tokens']}
                  labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#FFAA2024"
                  fill="url(#tokenGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Daily cost chart */}
          <div className="rounded-lg border border-border bg-surface-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Daily Cost (30 days)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: number) => formatCost(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-50)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(v: unknown) => [formatCost(Number(v ?? 0)), 'Cost']}
                  labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#22c55e"
                  fill="url(#costGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
