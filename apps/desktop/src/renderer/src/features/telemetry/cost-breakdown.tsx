/**
 * CostBreakdown — cost analytics by provider and model.
 *
 * PieChart for provider-level cost distribution, BarChart for per-model cost,
 * and a date range filter (7d / 30d / 90d / all).
 *
 * Phase 3 — M17.
 */

import { DollarSign } from 'lucide-react';
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

import { Button } from '@/components/ui/button.js';
import {
  MissionControlRow,
  MissionInsetSurface,
  MissionSectionCard,
  MissionSegmentedButton,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { telemetryRequestKind, useCostBreakdown } from '@/hooks/use-telemetry.js';

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
  const value = typeof usd === 'string' ? Number.parseFloat(usd) : usd;
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function CostBreakdown({ companyId, kindFilter }: Props) {
  const [range, setRange] = useState<DateRange>('30d');
  const now = useMemo(() => Date.now(), []);
  const kind = telemetryRequestKind(kindFilter);

  const request = useMemo(() => {
    if (range === 'all') return { companyId, kind };
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return { companyId, fromMs: now - days * DAY_MS, toMs: now, kind };
  }, [companyId, kind, now, range]);

  const breakdownQuery = useCostBreakdown(request);

  const providerData = useMemo(() => {
    if (!breakdownQuery.data) return [];
    const map = new Map<string, number>();
    for (const row of breakdownQuery.data) {
      const cost = Number.parseFloat(row.costUsd);
      map.set(row.provider, (map.get(row.provider) ?? 0) + cost);
    }
    return Array.from(map.entries())
      .map(([provider, cost]) => ({ provider, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [breakdownQuery.data]);

  const modelData = useMemo(() => {
    if (!breakdownQuery.data) return [];
    return breakdownQuery.data.map((row) => ({
      label: `${row.provider}/${row.model}`,
      provider: row.provider,
      model: row.model,
      cost: Number.parseFloat(row.costUsd),
      runs: row.totalRuns,
      tokens: row.totalTokens,
    }));
  }, [breakdownQuery.data]);

  if (breakdownQuery.isLoading) {
    return (
      <MissionSectionCard
        title="Cost analytics"
        description="Loading provider and model-level cost breakdowns."
      >
        <MissionStateBlock
          title="Loading cost telemetry"
          description="Provider spend and model mix analytics are syncing for the selected time range."
          icon={DollarSign}
          data-telemetry-cost-state="loading"
        />
      </MissionSectionCard>
    );
  }

  if (breakdownQuery.isError) {
    return (
      <MissionSectionCard
        title="Cost analytics"
        description="The cost breakdown query failed for the current telemetry slice."
        actions={
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
            onClick={() => breakdownQuery.refetch()}
          >
            Retry
          </Button>
        }
      >
        <MissionStateBlock
          title="Cost telemetry could not load"
          description="Retry the provider and model breakdown query to restore cost analytics."
          icon={DollarSign}
          tone="danger"
          data-telemetry-cost-state="error"
        />
      </MissionSectionCard>
    );
  }

  const rows = breakdownQuery.data ?? [];
  const isEmpty = rows.length === 0;

  return (
    <div className="grid gap-6">
      <MissionSectionCard
        title="Cost analytics"
        description="Inspect provider spend and model mix across a selectable time horizon."
      >
        <MissionControlRow className="justify-between gap-3 px-3 py-3">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Period
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((option) => (
              <MissionSegmentedButton
                key={option.value}
                onClick={() => setRange(option.value)}
                active={range === option.value}
              >
                {option.label}
              </MissionSegmentedButton>
            ))}
          </div>
        </MissionControlRow>
      </MissionSectionCard>

      {isEmpty ? (
        <MissionSectionCard
          title="Cost analytics"
          description="No paid-provider telemetry exists for the current period and run filter."
        >
          <MissionStateBlock
            title="No cost data for this period"
            description="Runs with paid providers will populate provider and model cost analytics here."
            icon={DollarSign}
            data-telemetry-cost-state="empty"
          />
        </MissionSectionCard>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <MissionSectionCard
              title="Cost by provider"
              description="Aggregate spend split by provider for the selected period."
            >
              {providerData.every((provider) => provider.cost === 0) ? (
                <MissionInsetSurface className="flex min-h-[260px] items-center justify-center border-dashed text-sm text-muted-foreground">
                  All runs are on free providers for this period.
                </MissionInsetSurface>
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
                      {providerData.map((entry, index) => (
                        <Cell key={entry.provider} fill={getProviderColor(entry.provider, index)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                      formatter={(value: unknown) => [formatCost(Number(value ?? 0)), 'Cost']}
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
            </MissionSectionCard>

            <MissionSectionCard
              title="Cost by model"
              description="Model-level spend and usage within the selected telemetry window."
            >
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={modelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value: number) => formatCost(value)}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown, _name: unknown, props: unknown) => {
                      const payload = (props as { payload?: { runs?: number; tokens?: number } })
                        ?.payload;
                      const runs = payload?.runs ?? 0;
                      const tokens = payload?.tokens ?? 0;
                      return [
                        `${formatCost(Number(value ?? 0))} (${runs} runs, ${tokens.toLocaleString()} tokens)`,
                        'Cost',
                      ];
                    }}
                  />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                    {modelData.map((entry, index) => (
                      <Cell key={entry.label} fill={getProviderColor(entry.provider, index)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </MissionSectionCard>
          </div>

          <MissionSectionCard
            title="Provider summary"
            description="Raw provider and model totals for the current period."
            className="overflow-hidden"
          >
            <MissionInsetSurface className="overflow-hidden rounded-[20px] bg-black/15">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      Model
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      Runs
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      Tokens
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.provider}-${row.model}`}
                      className="border-b border-white/10 transition-colors last:border-b-0 hover:bg-surface-100/20"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{row.provider}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.model}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.totalRuns}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCost(row.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MissionInsetSurface>
          </MissionSectionCard>
        </>
      )}
    </div>
  );
}
