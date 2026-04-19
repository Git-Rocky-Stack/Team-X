import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useMemo } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCompanies, useCompanyEventSync } from '@/hooks/use-companies.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Top-bar workspace switcher.
 *
 * Phase 5.6 M-D step (a) — first mount point for the multi-company
 * UX per `docs/plans/2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md`
 * §3 step (a) and audit rows 2.2 / 2.3 / 2.4.
 *
 * Scope for step (a): render + switch. The "Create company…" CTA is
 * disabled and labelled as a step-(b) placeholder — it becomes live
 * once `CreateCompanyDialog` ships. The "Company settings…" CTA
 * lands in step (c).
 *
 * Architectural contract:
 * - Single mount in the top-bar. Unmount dropping the
 *   `useCompanyEventSync` subscription would leave the switcher
 *   stale on cross-process writes, so the hook must live on a
 *   persistent app-shell surface (not inside a view that can unmount).
 * - `useCompanies()` is a global-scope query; the switcher shows all
 *   rows today because the `Company` wire shape does not carry an
 *   archive status. The filter lands alongside the status-field
 *   widening in step (c) when `CompanySettings` needs to surface
 *   archived companies separately.
 *
 * Accessibility:
 * - Trigger is a standard `<button>` wrapped by Radix — keyboard
 *   nav, `aria-expanded`, `role=menu` on content, `aria-activedescendant`
 *   on items all come for free from the primitive.
 * - Active-company row carries `aria-current="true"` so screen readers
 *   announce it as the selected workspace.
 * - All touch targets ≥36px height (trigger 32px with 4px padding ring,
 *   menu items 32px) — within the Fortune-10 40–44px target band for
 *   desktop-first.
 *
 * F10 states:
 * - loading → `<Skeleton />` in the trigger's name slot.
 * - error   → inline trigger text switches to "Workspace unavailable"
 *             + destructive color; menu content still lists whatever
 *             cached rows React Query holds (graceful degrade).
 * - empty   → menu renders "No workspaces yet" label (edge case —
 *             seed always creates one).
 * - disabled → pending mutation disables the trigger.
 * - hover   → DropdownMenuItem's `focus:bg-accent` + border-hover on
 *             trigger via button-style utility classes.
 */
export function WorkspaceSwitcher() {
  useCompanyEventSync();

  const { data: companies = [], isLoading, isError } = useCompanies();
  const activeCompanyId = useAppStore((s) => s.companyId);
  const setCompanyId = useAppStore((s) => s.setCompanyId);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const triggerLabel = isLoading
    ? null
    : isError
      ? 'Workspace unavailable'
      : (activeCompany?.name ?? 'Select workspace');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isLoading}
        aria-label={`Workspace switcher${activeCompany ? ` — active: ${activeCompany.name}` : ''}`}
        data-workspace-switcher-trigger=""
        className={cn(
          'flex h-8 items-center gap-2 rounded-md border border-transparent px-2 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          'data-[state=open]:bg-surface-100 data-[state=open]:border-border',
          isError
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-foreground hover:bg-surface-100',
          isLoading && 'cursor-wait opacity-70',
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {triggerLabel === null ? (
          <Skeleton className="h-3.5 w-24" />
        ) : (
          <span className="max-w-[180px] truncate">{triggerLabel}</span>
        )}
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-[220px]"
        data-workspace-switcher-content=""
      >
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isError ? (
          <DropdownMenuItem
            disabled
            className="text-destructive"
            data-workspace-switcher-state="error"
          >
            Failed to load — retry in a moment
          </DropdownMenuItem>
        ) : companies.length === 0 ? (
          <DropdownMenuItem disabled data-workspace-switcher-state="empty">
            No workspaces yet
          </DropdownMenuItem>
        ) : (
          companies.map((company) => {
            const isActive = company.id === activeCompanyId;
            return (
              <DropdownMenuItem
                key={company.id}
                onSelect={() => setCompanyId(company.id)}
                aria-current={isActive ? 'true' : undefined}
                data-workspace-switcher-item={company.id}
                className={cn(isActive && 'bg-brand/5 font-semibold text-brand')}
              >
                <Building2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{company.name}</span>
                {isActive ? <Check className="ml-2 h-3.5 w-3.5 text-brand" /> : null}
              </DropdownMenuItem>
            );
          })
        )}

        <DropdownMenuSeparator />

        {/*
         * Create-company CTA is a step-(b) placeholder. It renders
         * disabled with "Available in step (b)" tooltip-style label
         * so the menu remains honest about current capability. The
         * DropdownMenuItem's `data-[disabled]` styling surfaces the
         * disabled visual automatically.
         */}
        <DropdownMenuItem
          disabled
          data-workspace-switcher-action="create-company-placeholder"
          title="Available in step (b)"
        >
          <Plus className="mr-2 h-3.5 w-3.5" />
          <span className="flex-1">Create company…</span>
          <span className="ml-2 text-[10px] uppercase text-muted-foreground">Soon</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
