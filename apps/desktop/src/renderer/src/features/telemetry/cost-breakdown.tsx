/**
 * CostBreakdown — cost analytics by provider and model.
 *
 * PieChart for provider-level cost distribution, BarChart for per-model cost,
 * and a date range filter (7d / 30d / 90d / all).
 *
 * Phase 3 — M17.
 */

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { TelemetryKindFilter } from '@team-x/shared-types';

import { useCostBreakdown } from '@/hooks/use-telemetry.js';

const DAY_MS = 86_400_000;

interface Props {
  companyId: string;
  kindFilter: TelemetryKindFilter;
}

type DateRange = '7d' | '30d' | '90d' | 'all';

const RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'All time', value: 'all' },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#d97706',
  ollama: '#22c55e',
  openai: '#3b82f6',
  google: '#ef4444',
  groq: '#a855f7',
  openrouter: '#ec4899',
  together: '#14b8a6',
  fireworks: '#f97316',
};

function getProviderColor(provider: string, index: number): string {
  const key = provider.toLowerCase();
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
  const fallback = ['#6366f1', '#84cc16', '#06b6d4', '#f43f5e', '#8b5cf6', '#eab308'];
  return fallback[index % fallback.length] ?? '#6366f1';
}

function formatCost(usd: string | number): string {
  const n = typeof usd === 'string' ? Number.parseFloat(usd) : usd;
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function CostBreakdown({ companyId }: Props) {
  const [range, setRange] = useState<DateRange>('30d');

  const now = useMemo(() => Date.now(), []);

  const req = useMemo(() => {
    if (range === 'all') return { companyId };
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return { companyId, fromMs: now - days * DAY_MS, toMs: now };
  }, [companyId, range, now]);

  const { data: rows, isLoading } = useCostBreakdown(req);

  // Aggregate by provider for pie chart
  const providerData = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const cost = Number.parseFloat(r.costUsd);
      map.set(r.provider, (map.get(r.provider) ?? 0) + cost);
    }
    return Array.from(map.entries())
      .map(([provider, cost]) => ({ provider, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [rows]);

  // Model data for bar chart
  const modelData = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => ({
      label: `${r.provider}/${r.model}`,
      provider: r.provider,
      model: r.model,
      cost: Number.parseFloat(r.costUsd),
      runs: r.totalRuns,
      tokens: r.totalTokens,
    }));
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading cost data...
      </div>
    );
  }

  const isEmpty = !rows || rows.length === 0;

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Period:</span>
        {RANGE_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => setRange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              range === opt.value
                ? 'bg-brand/10 text-brand'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-border bg-surface-50 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No cost data for this period. Runs with paid providers will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Provider pie chart */}
          <div className="rounded-lg border border-border bg-surface-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Cost by Provider</h3>
            {providerData.every((p) => p.cost === 0) ? (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                All runs are on free providers (cost = $0).
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={providerData}
                    dataKey="cost"
                    nameKey="provider"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={false}
                    labelLine={false}
                  >
                    {providerData.map((entry, i) => (
                      <Cell key={entry.provider} fill={getProviderColor(entry.provider, i)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-50)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    formatter={(v: unknown) => [formatCost(Number(v ?? 0)), 'Cost']}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    formatter={(value: string) => (
                      <span className="text-muted-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Model bar chart */}
          <div className="rounded-lg border border-border bg-surface-50 p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Cost by Model</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={modelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: number) => formatCost(v)}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface-50)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(v: unknown, _name: unknown, props: unknown) => {
                    const p = (props as { payload?: { runs?: number; tokens?: number } })?.payload;
                    const runs = p?.runs ?? 0;
                    const tokens = p?.tokens ?? 0;
                    return [
                      `${formatCost(Number(v ?? 0))} (${runs} runs, ${tokens.toLocaleString()} tokens)`,
                      'Cost',
                    ];
                  }}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {modelData.map((entry, i) => (
                    <Cell key={entry.label} fill={getProviderColor(entry.provider, i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary table */}
      {!isEmpty && (
        <div className="rounded-lg border border-border bg-surface-50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-100/50">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Provider
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Model
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Runs
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Tokens
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr
                  key={`${r.provider}-${r.model}`}
                  className="border-b border-border/50 transition-colors hover:bg-surface-100/30"
                >
                  <td className="px-3 py-2.5 font-medium text-foreground">{r.provider}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.model}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.totalRuns}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.totalTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCost(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
