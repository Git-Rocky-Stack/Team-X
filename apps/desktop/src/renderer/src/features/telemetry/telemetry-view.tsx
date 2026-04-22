/**
 * TelemetryView — top-level Telemetry tab with 3 subviews:
 * Company (aggregate stats + daily charts), Employees (per-employee table),
 * Cost (by provider/model breakdown with date range filter).
 *
 * Phase 3 — M17.
 */

import { Activity, BarChart3, DollarSign, Gauge, Radar, Rows3, Users2 } from 'lucide-react';
import { type ComponentType, useMemo, useState } from 'react';

import type { TelemetryKindFilter } from '@team-x/shared-types';

import { Badge } from '@/components/ui/badge.js';
import {
  MissionControlRow,
  MissionHero,
  MissionMetricTile,
  MissionPageShell,
  MissionPill,
  MissionSegmentedButton,
  MissionSectionCard,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { telemetryRequestKind, useCompanyStats } from '@/hooks/use-telemetry.js';
import { type TelemetrySubview, useAppStore } from '@/store/app-store.js';

import { CompanyTelemetry } from './company-telemetry.js';
import { CostBreakdown } from './cost-breakdown.js';
import { EmployeeTelemetry } from './employee-telemetry.js';

interface SubtabDef {
  label: string;
  icon: ComponentType<{ className?: string }>;
  view: TelemetrySubview;
}

const SUBTABS: SubtabDef[] = [
  { label: 'Company', icon: BarChart3, view: 'company' },
  { label: 'Employees', icon: Users2, view: 'employees' },
  { label: 'Cost', icon: DollarSign, view: 'cost' },
];

const KIND_FILTER_LABELS: Record<TelemetryKindFilter, string> = {
  all: 'All',
  work: 'Work',
  agentic: 'Agentic',
  copilot: 'Copilot',
};

const KIND_FILTERS = Object.keys(KIND_FILTER_LABELS) as TelemetryKindFilter[];

const SUBVIEW_COPY: Record<TelemetrySubview, { title: string; description: string }> = {
  company: {
    title: 'Company telemetry',
    description:
      'Track run volume, usage trends, and performance signals across the full workspace.',
  },
  employees: {
    title: 'Employee telemetry',
    description:
      'Compare operator output, latency, and tool usage without leaving the analytics shell.',
  },
  cost: {
    title: 'Cost telemetry',
    description:
      'Inspect provider spend, model mix, and cost pressure in the same mission-language frame.',
  },
};

function formatCost(usd: string | number | null | undefined): string {
  if (usd === null || usd === undefined) return '--';
  const parsed = typeof usd === 'string' ? Number.parseFloat(usd) : usd;
  if (!Number.isFinite(parsed)) return '--';
  if (parsed === 0) return '$0.00';
  if (parsed < 0.01) return `$${parsed.toFixed(4)}`;
  return `$${parsed.toFixed(2)}`;
}

function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function TelemetrySubtabs() {
  const subview = useAppStore((s) => s.telemetrySubview);
  const setSubview = useAppStore((s) => s.setTelemetrySubview);

  return (
    <div className="flex flex-wrap items-center gap-2" data-telemetry-subtabs="">
      {SUBTABS.map((tab) => {
        const isActive = tab.view === subview;
        const Icon = tab.icon;
        return (
          <MissionSegmentedButton
            key={tab.view}
            data-telemetry-subtab={tab.view}
            onClick={() => setSubview(tab.view)}
            active={isActive}
            className="flex items-center gap-2"
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </MissionSegmentedButton>
        );
      })}
    </div>
  );
}

interface TelemetryKindFilterChipsProps {
  active?: TelemetryKindFilter;
  onChange: (filter: TelemetryKindFilter) => void;
}

export function TelemetryKindFilterChips({
  active = 'all',
  onChange,
}: TelemetryKindFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-telemetry-kind-filter-row="">
      {KIND_FILTERS.map((filter) => (
        <MissionSegmentedButton
          key={filter}
          data-telemetry-kind-filter={filter}
          aria-pressed={filter === active}
          onClick={() => onChange(filter)}
          active={filter === active}
        >
          {KIND_FILTER_LABELS[filter]}
        </MissionSegmentedButton>
      ))}
    </div>
  );
}

export function TelemetryView() {
  const companyId = useAppStore((s) => s.companyId);
  const subview = useAppStore((s) => s.telemetrySubview);
  const [kindFilter, setKindFilter] = useState<TelemetryKindFilter>('all');

  const kind = telemetryRequestKind(kindFilter);
  const summaryQuery = useCompanyStats(companyId ? { companyId, kind } : null);

  const activeSubviewCopy = SUBVIEW_COPY[subview];
  const summaryBadges = useMemo(() => {
    const kindLabel = KIND_FILTER_LABELS[kindFilter];
    return {
      subview: SUBTABS.find((tab) => tab.view === subview)?.label ?? 'Company',
      kind: kindLabel,
    };
  }, [kindFilter, subview]);

  if (!companyId) {
    return (
      <MissionPageShell data-telemetry-view="">
        <MissionHero
          eyebrow="Analytics command"
          title="Telemetry"
          description="Open a workspace to inspect company usage, employee output, and provider spend."
          icon={BarChart3}
        />
        <MissionSectionCard
          title="Telemetry scope"
          description="A workspace is required before analytics can load."
        >
          <MissionStateBlock
            title="No workspace loaded"
            description="Choose or create a workspace to unlock the telemetry dashboard and analytics breakdowns."
            icon={Radar}
            data-telemetry-view-state="no-company"
          />
        </MissionSectionCard>
      </MissionPageShell>
    );
  }

  const summary = summaryQuery.data;
  const renderedSubview = (() => {
    switch (subview) {
      case 'company':
        return <CompanyTelemetry companyId={companyId} kindFilter={kindFilter} />;
      case 'employees':
        return <EmployeeTelemetry companyId={companyId} kindFilter={kindFilter} />;
      case 'cost':
        return <CostBreakdown companyId={companyId} kindFilter={kindFilter} />;
      default:
        return <CompanyTelemetry companyId={companyId} kindFilter={kindFilter} />;
    }
  })();

  return (
    <MissionPageShell data-telemetry-view="">
      <MissionHero
        eyebrow="Analytics command"
        title="Telemetry"
        description={activeSubviewCopy.description}
        icon={BarChart3}
        badge={
          <Badge
            variant="outline"
            className="border-white/10 bg-black/20 text-[10px] font-mono text-muted-foreground"
          >
            {activeSubviewCopy.title}
          </Badge>
        }
        meta={
          <MissionControlRow density="compact" className="gap-2 px-3 py-2">
            <MissionPill uppercase>{summaryBadges.subview}</MissionPill>
            <MissionPill mono>{summaryBadges.kind}</MissionPill>
            <MissionPill tone={summaryQuery.isError ? 'danger' : 'default'} mono>
              {summaryQuery.isError ? 'Summary unavailable' : 'Live analytics'}
            </MissionPill>
          </MissionControlRow>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MissionMetricTile
            label="Runs"
            value={summaryQuery.isLoading ? '--' : `${summary?.totalRuns ?? 0}`}
            hint="Completed runs captured for the active telemetry scope."
            icon={Rows3}
          />
          <MissionMetricTile
            label="Tokens"
            value={summaryQuery.isLoading ? '--' : formatTokens(summary?.totalTokens)}
            hint="Prompt plus completion volume across the active filter."
            icon={Activity}
          />
          <MissionMetricTile
            label="Cost"
            value={summaryQuery.isLoading ? '--' : formatCost(summary?.totalCostUsd)}
            hint="Provider spend inside the current telemetry slice."
            icon={DollarSign}
          />
          <MissionMetricTile
            label="Latency"
            value={summaryQuery.isLoading ? '--' : `${summary?.avgLatencyMs ?? 0}ms`}
            hint="Average completion latency across the selected run kind."
            icon={Gauge}
          />
        </div>
      </MissionHero>

      <MissionSectionCard
        title="Telemetry scope"
        description="Switch analytics views and filter run kind without leaving the telemetry shell."
        data-telemetry-controls=""
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <MissionControlRow density="compact" className="px-2 py-2">
            <TelemetrySubtabs />
          </MissionControlRow>
          <MissionControlRow density="compact" className="justify-between px-2 py-2 xl:justify-end">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Kind
            </span>
            <TelemetryKindFilterChips active={kindFilter} onChange={setKindFilter} />
          </MissionControlRow>
        </div>
      </MissionSectionCard>

      {renderedSubview}
    </MissionPageShell>
  );
}
