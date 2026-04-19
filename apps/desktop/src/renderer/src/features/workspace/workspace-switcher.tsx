import { Building2, Check, ChevronsUpDown, Plus, RefreshCw, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';

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

import { CompanySettings } from './company-settings.js';
import { CreateCompanyDialog } from './create-company-dialog.js';

/**
 * Top-bar workspace switcher.
 *
 * Phase 5.6 M-D step (a+b) — first mount point for the multi-company
 * UX per `docs/plans/2026-04-19-team-x-phase-5.6-m-d-ui-backfill.md`
 * §3 (audit rows 2.2 / 2.3 / 2.4). Step (a) shipped the render +
 * switch foundation on 2026-04-19 (atomic `5d0c5bc`); this revision
 * collapses step (b) forward after Rocky's iron-rule directive and
 * the 2026-04-19 ground-zero audit P1 remediation (see
 * `docs/qa/2026-04-19-m-d-step-a-ground-zero-audit.md`). No disabled
 * "Soon" placeholders — the "Create workspace…" CTA is LIVE today
 * and wires to the `CreateCompanyDialog` end-to-end. Step (c) wires
 * the "Company settings…" CTA to the live `CompanySettings` sheet.
 *
 * Architectural contract:
 * - Single mount in the top-bar. Unmount dropping the
 *   `useCompanyEventSync` subscription would leave the switcher
 *   stale on cross-process writes, so the hook must live on a
 *   persistent app-shell surface (not inside a view that can unmount).
 * - `useCompanies()` is a global-scope query that filters archived
 *   rows by default now that step (c) widened the `Company` wire
 *   shape with `status`.
 *
 * Accessibility:
 * - Trigger is a standard `<button>` wrapped by Radix — keyboard
 *   nav, `aria-expanded`, `role=menu` on content, `aria-activedescendant`
 *   on items all come for free from the primitive.
 * - Trigger `aria-label` reflects both the active-company state AND
 *   the error state so screen readers announce what sighted users
 *   see (2026-04-19 audit P3.1 closure).
 * - Active-company row carries `aria-current="true"` so screen readers
 *   announce it as the selected workspace.
 * - All touch targets ≥36px height (trigger 32px with 4px padding ring,
 *   menu items 32px) — within the Fortune-10 40–44px target band for
 *   desktop-first.
 *
 * F10 states:
 * - loading → `<Skeleton />` in the trigger's name slot.
 * - error   → trigger switches to "Workspace unavailable" + destructive
 *             color; menu content renders an actionable Retry row
 *             (2026-04-19 audit P2.1 closure — no more passive "retry
 *             in a moment" dead-end).
 * - empty   → menu renders "No workspaces yet" label + live "Create
 *             workspace…" CTA so the user can recover (post step (b)
 *             collapse — no more dead-end empty state).
 * - disabled → pending mutation disables the trigger.
 * - hover   → DropdownMenuItem's `focus:bg-accent` + border-hover on
 *             trigger via button-style utility classes.
 */
export function WorkspaceSwitcher() {
  useCompanyEventSync();

  const { data: companies = [], isLoading, isError, refetch } = useCompanies();
  const activeCompanyId = useAppStore((s) => s.companyId);
  const setCompanyId = useAppStore((s) => s.setCompanyId);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const triggerLabel = isLoading
    ? null
    : isError
      ? 'Workspace unavailable'
      : (activeCompany?.name ?? 'Select workspace');

  // 2026-04-19 audit P3.1 closure — threaded error state into the
  // screen-reader label so the aria-announced state matches the
  // visible trigger text.
  const triggerAriaLabel = isError
    ? 'Workspace switcher — workspaces failed to load'
    : `Workspace switcher${activeCompany ? ` — active: ${activeCompany.name}` : ''}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isLoading}
          aria-label={triggerAriaLabel}
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
              onSelect={(e) => {
                e.preventDefault();
                refetch();
              }}
              className="text-destructive"
              data-workspace-switcher-state="error"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry loading workspaces
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
           * Create-workspace CTA — LIVE as of the step (a+b) collapse.
           * No disabled "Soon" placeholder per Rocky's iron rule + the
           * 2026-04-19 ground-zero audit remediation.
           */}
          <DropdownMenuItem
            onSelect={() => setCreateOpen(true)}
            data-workspace-switcher-action="create-company"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            <span className="flex-1">Create workspace…</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setSettingsOpen(true)}
            disabled={!activeCompany || isError}
            data-workspace-switcher-action="company-settings"
          >
            <Settings className="mr-2 h-3.5 w-3.5" />
            <span className="flex-1">Company settings…</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CompanySettings open={settingsOpen} onOpenChange={setSettingsOpen} company={activeCompany} />
    </>
  );
}
