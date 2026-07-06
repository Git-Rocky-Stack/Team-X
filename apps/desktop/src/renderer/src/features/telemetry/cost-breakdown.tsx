/**
 * CostBreakdown — cost analytics by provider and model.
 *
 * PieChart for provider-level cost distribution, BarChart for per-model cost,
 * and a date range filter (7d / 30d / 90d / all).
 *
 * Phase 3 — M17. Recomposed onto the Command Console primitives (Phase 7a);
 * the categorical provider palette reads chart-theme's LED + metal family.
 */

import type { TelemetryKindFilter } from '@team-x/shared-types';
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

import {
  CHART_GRID_STROKE,
  CHART_TICK,
  CHART_TOOLTIP_STYLE,
  getProviderSeriesColor,
} from './chart-theme.js';

import { Faceplate, RecessedWell, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { telemetryRequestKind, useCostBreakdown } from '@/hooks/use-telemetry.js';
import { cn } from '@/lib/utils.js';

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
      <Faceplate kicker="Cost analytics" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          Loading provider and model-level cost breakdowns.
        </p>
        <div data-telemetry-cost-state="loading">
          <SubviewState
            lampLabel="SYNC"
            lampTone="hold"
            title="Loading cost telemetry"
            description="Provider spend and model mix analytics are syncing for the selected time range."
          />
        </div>
      </Faceplate>
    );
  }

  if (breakdownQuery.isError) {
    return (
      <Faceplate kicker="Cost analytics" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          The cost breakdown query failed for the current telemetry slice.
        </p>
        <div data-telemetry-cost-state="error">
          <SubviewState
            lampLabel="NO-GO"
            lampTone="nogo"
            title="Cost telemetry could not load"
            description="Retry the provider and model breakdown query to restore cost analytics."
            action={
              <Button type="button" variant="outline" onClick={() => breakdownQuery.refetch()}>
                Retry
              </Button>
            }
          />
        </div>
      </Faceplate>
    );
  }

  const rows = breakdownQuery.data ?? [];
  const isEmpty = rows.length === 0;

  return (
    <div className="grid gap-6">
      <Faceplate kicker="Cost analytics" bodyClassName="space-y-3">
        <p className="text-caption text-silver-mute">
          Inspect provider spend and model mix across a selectable time horizon.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <span className="px-2 text-eyebrow-sm text-muted-foreground">Period</span>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
                className={cn(
                  'nav-tile px-3 py-1.5 text-button-sm',
                  range === option.value && 'nav-tile-active',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Faceplate>

      {isEmpty ? (
        <Faceplate kicker="Cost analytics" bodyClassName="space-y-3">
          <p className="text-caption text-silver-mute">
            No paid-provider telemetry exists for the current period and run filter.
          </p>
          <div data-telemetry-cost-state="empty">
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No cost data for this period"
              description="Runs with paid providers will populate provider and model cost analytics here."
            />
          </div>
        </Faceplate>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Faceplate kicker="Cost by provider" bodyClassName="space-y-3">
              <p className="text-caption text-silver-mute">
                Aggregate spend split by provider for the selected period.
              </p>
              {providerData.every((provider) => provider.cost === 0) ? (
                <RecessedWell className="flex min-h-[260px] items-center justify-center p-3">
                  <p className="text-body text-[var(--display-fg)] opacity-70">
                    All runs are on free providers for this period.
                  </p>
                </RecessedWell>
              ) : (
                <RecessedWell className="p-3">
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
                          <Cell
                            key={entry.provider}
                            fill={getProviderSeriesColor(entry.provider, index)}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: unknown) => [formatCost(Number(value ?? 0)), 'Cost']}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '11px' }}
                        formatter={(value: string) => (
                          <span className="text-[var(--display-fg)] opacity-70">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </RecessedWell>
              )}
            </Faceplate>

            <Faceplate kicker="Cost by model" bodyClassName="space-y-3">
              <p className="text-caption text-silver-mute">
                Model-level spend and usage within the selected telemetry window.
              </p>
              <RecessedWell className="p-3">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={modelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                    <XAxis
                      type="number"
                      tick={CHART_TICK}
                      tickFormatter={(value: number) => formatCost(value)}
                    />
                    <YAxis type="category" dataKey="model" tick={CHART_TICK} width={120} />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
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
                        <Cell
                          key={entry.label}
                          fill={getProviderSeriesColor(entry.provider, index)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </RecessedWell>
            </Faceplate>
          </div>

          <Faceplate kicker="Provider summary" bodyClassName="space-y-3">
            <p className="text-caption text-silver-mute">
              Raw provider and model totals for the current period.
            </p>
            <RecessedWell className="overflow-hidden p-0">
              <table className="w-full text-body">
                <thead>
                  <tr className="border-b border-[var(--display-border)]">
                    <th className="px-4 py-3 text-left text-label text-[var(--display-fg)] opacity-60">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-label text-[var(--display-fg)] opacity-60">
                      Model
                    </th>
                    <th className="px-4 py-3 text-right text-label text-[var(--display-fg)] opacity-60">
                      Runs
                    </th>
                    <th className="px-4 py-3 text-right text-label text-[var(--display-fg)] opacity-60">
                      Tokens
                    </th>
                    <th className="px-4 py-3 text-right text-label text-[var(--display-fg)] opacity-60">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.provider}-${row.model}`}
                      className="border-b border-[var(--display-border)] transition-colors last:border-b-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--display-fg)]">
                        {row.provider}
                      </td>
                      <td className="px-4 py-3 text-code-sm text-[var(--display-fg)] opacity-70">
                        {row.model}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--display-fg)]">
                        {row.totalRuns}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--display-fg)]">
                        {row.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--display-fg)]">
                        {formatCost(row.costUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RecessedWell>
          </Faceplate>
        </>
      )}
    </div>
  );
}
