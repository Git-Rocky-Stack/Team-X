/**
 * TelemetryView — top-level Telemetry tab with 3 subviews:
 * Company (aggregate stats + daily charts), Employees (per-employee table),
 * Cost (by provider/model breakdown with date range filter).
 *
 * Phase 3 — M17.
 */

import { BarChart3, DollarSign, Users2 } from 'lucide-react';

import type { ComponentType } from 'react';

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

function TelemetrySubtabs() {
  const subview = useAppStore((s) => s.telemetrySubview);
  const setSubview = useAppStore((s) => s.setTelemetrySubview);

  return (
    <div className="flex items-center gap-1 border-b border-border px-4 py-2">
      {SUBTABS.map((tab) => {
        const isActive = tab.view === subview;
        const Icon = tab.icon;
        return (
          <button
            type="button"
            key={tab.view}
            onClick={() => setSubview(tab.view)}
            className={`
              flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors
              ${
                isActive
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-100'
              }
            `}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TelemetryView() {
  const companyId = useAppStore((s) => s.companyId);
  const subview = useAppStore((s) => s.telemetrySubview);

  if (!companyId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        No company loaded.
      </div>
    );
  }

  const cid = companyId;

  function renderSubview() {
    switch (subview) {
      case 'company':
        return <CompanyTelemetry companyId={cid} />;
      case 'employees':
        return <EmployeeTelemetry companyId={cid} />;
      case 'cost':
        return <CostBreakdown companyId={cid} />;
      default:
        return <CompanyTelemetry companyId={cid} />;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TelemetrySubtabs />
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">{renderSubview()}</div>
    </div>
  );
}
