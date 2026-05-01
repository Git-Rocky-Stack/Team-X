import { Building2, Check, ChevronsUpDown, Plus, RefreshCw, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CompanySettings } from './company-settings.js';
import { CreateCompanyDialog } from './create-company-dialog.js';

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
 * - Trigger and menu items stay inside the desktop-safe 40–44px target
 *   band after the mission-shell carry-forward widened the trigger into
 *   a two-line control block.
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
 * - hover   → AMOLED trigger fill + border-hover on
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
            'mission-workspace-trigger flex h-auto w-full items-center justify-between gap-3 rounded-[24px] border border-white/10 px-3 py-2.5 text-left transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            'data-[state=open]:border-border data-[state=open]:bg-black',
            isError ? 'text-destructive hover:bg-black' : 'text-foreground hover:bg-black',
            isLoading && 'cursor-wait opacity-70',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-black text-brand">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Workspace
              </span>
              {triggerLabel === null ? (
                <Skeleton className="h-3.5 w-24" />
              ) : (
                <span className="mt-1 block max-w-[220px] truncate text-sm font-semibold text-foreground">
                  {triggerLabel}
                </span>
              )}
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {isError
                  ? 'Reload workspace controls'
                  : activeCompany
                    ? 'Switch active company or open settings'
                    : 'Choose the active operating company'}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="min-w-[280px] rounded-[24px] border-white/10 bg-black p-2 shadow-2xl"
          data-workspace-switcher-content=""
        >
          <DropdownMenuLabel className="px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Mission scope
            </span>
            <span className="mt-1 block text-sm font-semibold text-foreground">Workspaces</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />

          {isError ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                refetch();
              }}
              className="rounded-[18px] px-3 py-2.5 text-destructive"
              data-workspace-switcher-state="error"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry loading workspaces
            </DropdownMenuItem>
          ) : companies.length === 0 ? (
            <DropdownMenuItem
              disabled
              className="rounded-[18px] px-3 py-2.5 text-muted-foreground"
              data-workspace-switcher-state="empty"
            >
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
                  className={cn(
                    'rounded-[18px] px-3 py-2.5',
                    isActive && 'border border-brand/25 bg-black font-semibold text-brand',
                  )}
                >
                  <Building2 className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{company.name}</span>
                  {isActive ? <Check className="ml-2 h-3.5 w-3.5 text-brand" /> : null}
                </DropdownMenuItem>
              );
            })
          )}

          <DropdownMenuSeparator className="bg-white/10" />

          {/*
           * Create-workspace CTA — LIVE as of the step (a+b) collapse.
           * No disabled "Soon" placeholder per Rocky's iron rule + the
           * 2026-04-19 ground-zero audit remediation.
           */}
          <DropdownMenuItem
            onSelect={() => setCreateOpen(true)}
            className="rounded-[18px] px-3 py-2.5"
            data-workspace-switcher-action="create-company"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            <span className="flex-1">Create workspace…</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setSettingsOpen(true)}
            disabled={!activeCompany || isError}
            className="rounded-[18px] px-3 py-2.5"
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
