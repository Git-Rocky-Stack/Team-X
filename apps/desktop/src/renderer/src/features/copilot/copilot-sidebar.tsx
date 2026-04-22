/**
 * CopilotSidebar (Phase 5 — M34 T5).
 *
 * Right-side toggleable panel that surfaces the Copilot Service's
 * proactive insights. Opened via `Cmd+Shift+K` / toolbar Sparkles
 * button / dashboard widget "View all" link — all three point at the
 * same `copilotSidebarOpen` slice in `useAppStore`.
 *
 * Layout (top to bottom):
 *   - Header: title + active-count badge + close button.
 *   - Filters + export controls: category/severity chips, company/all
 *     scope, and local CSV/JSON export.
 *   - Feed: `<article role="listitem">` per insight, sorted
 *     critical > warning > info, then newest-first within severity.
 *   - Ask input: bordered textarea pinned to the bottom, Cmd/Ctrl+Enter
 *     to submit. On success, closes the sidebar and opens the chat
 *     drawer on the returned system-copilot thread id so the user
 *     watches the answer stream via the existing M31 step-transcript
 *     layout — zero duplicated wire code.
 *
 * Invariants honoured:
 *   - Renderer is a pure view (all IPC via hooks).
 *   - Export is read-only: no new bus events.
 *   - Radix Sheet handles focus trap + Esc dismissal + `role="dialog"`.
 *   - Ask input is labeled; Cmd/Ctrl+Enter mirrors the existing
 *     `features/chat/composer.tsx` keymap.
 */

import { Loader2, Send, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  COPILOT_CATEGORIES,
  COPILOT_EXPORT_FORMATS,
  COPILOT_EXPORT_SCOPES,
  type CopilotCategory,
  type CopilotExportFormat,
  type CopilotExportRequest,
  type CopilotExportScope,
  type CopilotFeedbackSuggestion,
  type CopilotSeverity,
} from '@team-x/shared-types';

import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet.js';
import { Textarea } from '@/components/ui/textarea.js';
import {
  MissionInsetSurface,
  MissionSegmentedButton,
  MissionSheetHeader,
  MissionStateBlock,
} from '@/features/mission/mission-shell.js';
import { useAskCopilot, useCopilotExport, useCopilotInsights } from '@/hooks/use-copilot.js';
import { useSetCopilotWeights } from '@/hooks/use-settings.js';
import { useAppStore } from '@/store/app-store.js';

import { formatFeedbackSuggestionPrompt, sortBySeverity } from './copilot-helpers.js';
import { CopilotInsightCard } from './copilot-insight-card.js';

// ---------------------------------------------------------------------------

const FILTER_ALL = 'all';
const COPILOT_SEVERITY_FILTERS: readonly CopilotSeverity[] = ['critical', 'warning', 'info'];
type CategoryFilter = typeof FILTER_ALL | CopilotCategory;
type SeverityFilter = typeof FILTER_ALL | CopilotSeverity;

const CATEGORY_FILTERS: readonly CategoryFilter[] = [FILTER_ALL, ...COPILOT_CATEGORIES];
const SEVERITY_FILTERS: readonly SeverityFilter[] = [FILTER_ALL, ...COPILOT_SEVERITY_FILTERS];

function formatCategoryLabel(category: CategoryFilter): string {
  switch (category) {
    case 'all':
      return 'All';
    case 'operational':
      return 'Operational';
    case 'cost':
      return 'Cost';
    case 'org':
      return 'Org';
    case 'workflow':
      return 'Workflow';
    case 'anomaly':
      return 'Anomaly';
  }
}

function formatSeverityLabel(severity: SeverityFilter): string {
  switch (severity) {
    case 'all':
      return 'All';
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
}

function formatScopeLabel(scope: CopilotExportScope): string {
  return scope === 'company' ? 'Company' : 'All companies';
}

function formatExportFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function CopilotSidebar() {
  const open = useAppStore((s) => s.copilotSidebarOpen);
  const setOpen = useAppStore((s) => s.setCopilotSidebarOpen);
  const companyId = useAppStore((s) => s.companyId);
  const openThread = useAppStore((s) => s.openThread);

  const [askText, setAskText] = useState('');
  const [feedbackSuggestion, setFeedbackSuggestion] = useState<CopilotFeedbackSuggestion | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(FILTER_ALL);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(FILTER_ALL);
  const [exportScope, setExportScope] = useState<CopilotExportScope>('company');

  const insightFilters = useMemo(
    () => ({
      ...(categoryFilter !== FILTER_ALL ? { category: categoryFilter } : {}),
      ...(severityFilter !== FILTER_ALL ? { severity: severityFilter } : {}),
    }),
    [categoryFilter, severityFilter],
  );

  const { data, isLoading, isError, refetch } = useCopilotInsights(companyId, insightFilters);
  const askMutation = useAskCopilot();
  const exportMutation = useCopilotExport();
  const setCopilotWeights = useSetCopilotWeights();

  const sorted = useMemo(() => (data?.insights ? sortBySeverity(data.insights) : []), [data]);

  async function submitAsk() {
    if (!companyId) return;
    const text = askText.trim();
    if (!text) return;
    if (askMutation.isPending) return;

    try {
      const { threadId } = await askMutation.mutateAsync({ companyId, text });
      setAskText('');
      setOpen(false);
      // Hand off to the chat drawer with the M31 step-transcript layout.
      // `isCopilotThread: true` flips the drawer into read-only mode and
      // shows the live agent step stream — no new UI needed here.
      openThread({
        threadId,
        isAgentThread: false,
        employeeId: null,
        isCopilotThread: true,
      });
    } catch {
      // React Query surfaces the error state; the textarea keeps the
      // user's text so they can retry.
    }
  }

  function onAskKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submitAsk();
    }
  }

  function applyFeedbackSuggestion() {
    if (!companyId || !feedbackSuggestion) return;
    setCopilotWeights.mutate(
      { companyId, weights: { [feedbackSuggestion.category]: feedbackSuggestion.suggestedWeight } },
      { onSuccess: () => setFeedbackSuggestion(null) },
    );
  }

  function keepCurrentWeight() {
    setFeedbackSuggestion(null);
  }

  function buildExportRequest(format: CopilotExportFormat): CopilotExportRequest {
    return {
      format,
      scope: exportScope,
      ...(exportScope === 'company' && companyId ? { companyId } : {}),
      ...(categoryFilter !== FILTER_ALL ? { category: categoryFilter } : {}),
      ...(severityFilter !== FILTER_ALL ? { severity: severityFilter } : {}),
    };
  }

  function submitExport(format: CopilotExportFormat) {
    if (exportScope === 'company' && !companyId) return;
    exportMutation.mutate(buildExportRequest(format));
  }

  const activeCount = sorted.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="mission-shell flex w-full flex-col overflow-hidden border-l border-white/10 bg-background/95 p-0 sm:max-w-md"
        data-copilot-sidebar-root=""
      >
        <div className="mission-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex h-full flex-col">
          <MissionSheetHeader
            eyebrow="Copilot command"
            icon={Sparkles}
            title={<SheetTitle className="text-base">Copilot</SheetTitle>}
            badge={
              <Badge
                variant="outline"
                className="border-white/10 bg-black/20 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                data-copilot-active-count={activeCount}
              >
                {activeCount} active
              </Badge>
            }
            description={
              <SheetDescription className="m-0 text-sm leading-6">
                Review proactive insights, export the current queue, or route a free-form request
                into the existing chat transcript flow.
              </SheetDescription>
            }
          />

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-4 px-4 py-4">
                <div
                  className="mission-chrome-panel rounded-[24px] border border-white/10 p-4"
                  data-copilot-export-controls=""
                >
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Category
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORY_FILTERS.map((category) => (
                          <MissionSegmentedButton
                            key={category}
                            onClick={() => setCategoryFilter(category)}
                            aria-pressed={categoryFilter === category}
                            data-copilot-category-filter={category}
                            active={categoryFilter === category}
                            compact
                          >
                            {formatCategoryLabel(category)}
                          </MissionSegmentedButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Severity
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SEVERITY_FILTERS.map((severity) => (
                          <MissionSegmentedButton
                            key={severity}
                            onClick={() => setSeverityFilter(severity)}
                            aria-pressed={severityFilter === severity}
                            data-copilot-severity-filter={severity}
                            active={severityFilter === severity}
                            compact
                          >
                            {formatSeverityLabel(severity)}
                          </MissionSegmentedButton>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Export
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {COPILOT_EXPORT_SCOPES.map((scope) => (
                          <MissionSegmentedButton
                            key={scope}
                            onClick={() => setExportScope(scope)}
                            aria-pressed={exportScope === scope}
                            data-copilot-export-scope={scope}
                            active={exportScope === scope}
                            compact
                          >
                            {formatScopeLabel(scope)}
                          </MissionSegmentedButton>
                        ))}
                        {COPILOT_EXPORT_FORMATS.map((format) => (
                          <MissionSegmentedButton
                            key={format}
                            onClick={() => submitExport(format)}
                            disabled={
                              exportMutation.isPending || (exportScope === 'company' && !companyId)
                            }
                            data-copilot-export-format={format}
                            active
                            compact
                            className="border-brand/25"
                          >
                            {format === 'csv' ? 'CSV' : 'JSON'}
                          </MissionSegmentedButton>
                        ))}
                      </div>
                      {exportMutation.isSuccess && (
                        <p
                          className="mt-3 text-xs leading-5 text-muted-foreground"
                          data-copilot-export-status=""
                        >
                          Exported {exportMutation.data.rowCount} insight
                          {exportMutation.data.rowCount === 1 ? '' : 's'} to{' '}
                          {formatExportFileName(exportMutation.data.filePath)}
                          {exportMutation.data.truncated ? ' (truncated)' : ''}
                        </p>
                      )}
                      {exportMutation.isError && (
                        <p className="mt-3 text-xs text-destructive" data-copilot-export-error="">
                          Export failed. Try again.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {feedbackSuggestion && !isLoading && !isError && (
                  <MissionInsetSurface className="p-4" data-copilot-feedback-suggestion="">
                    <p className="text-xs font-medium leading-5 text-foreground">
                      {formatFeedbackSuggestionPrompt(feedbackSuggestion)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <MissionSegmentedButton
                        type="button"
                        onClick={applyFeedbackSuggestion}
                        disabled={!companyId || setCopilotWeights.isPending}
                        data-copilot-feedback-apply=""
                        active
                        compact
                      >
                        Apply
                      </MissionSegmentedButton>
                      <MissionSegmentedButton
                        type="button"
                        onClick={keepCurrentWeight}
                        disabled={setCopilotWeights.isPending}
                        compact
                      >
                        Keep current
                      </MissionSegmentedButton>
                    </div>
                  </MissionInsetSurface>
                )}

                {isLoading && (
                  <MissionInsetSurface className="px-4 py-10">
                    <MissionStateBlock
                      title="Loading copilot insights"
                      description="The proactive insight queue is syncing for the active workspace."
                      icon={Loader2}
                    />
                  </MissionInsetSurface>
                )}

                {isError && (
                  <MissionInsetSurface className="px-5 py-6">
                    <MissionStateBlock
                      title="Could not load insights"
                      description="The main-process IPC returned an error."
                      tone="danger"
                      action={
                        <MissionSegmentedButton type="button" onClick={() => refetch()} compact>
                          Retry
                        </MissionSegmentedButton>
                      }
                    />
                  </MissionInsetSurface>
                )}

                {!isLoading && !isError && sorted.length === 0 && (
                  <MissionInsetSurface className="px-5 py-6" data-copilot-empty="">
                    <MissionStateBlock
                      title="All clear"
                      description="No active insights. The copilot re-analyzes the company on its configured interval."
                      icon={Sparkles}
                    />
                  </MissionInsetSurface>
                )}

                {!isLoading && !isError && sorted.length > 0 && (
                  <ul className="flex flex-col gap-3" data-copilot-feed="">
                    {sorted.map((insight) => (
                      <CopilotInsightCard
                        key={insight.id}
                        insight={insight}
                        variant="sidebar"
                        onFeedbackSuggestion={setFeedbackSuggestion}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-black/20 px-4 py-4">
            <MissionInsetSurface className="p-4">
              <label
                htmlFor="copilot-ask-input"
                className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
              >
                Ask the copilot
              </label>
              <div className="mt-2 flex items-start gap-3">
                <Textarea
                  id="copilot-ask-input"
                  rows={2}
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  onKeyDown={onAskKeyDown}
                  placeholder="Why is the frontend team behind?"
                  className="flex-1 resize-none border-white/10 bg-black/20 text-sm"
                  data-copilot-ask-input=""
                  disabled={!companyId || askMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => void submitAsk()}
                  disabled={!companyId || askMutation.isPending || askText.trim().length === 0}
                  aria-label="Ask the copilot"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-black/20 text-muted-foreground transition-colors hover:bg-black/30 hover:text-foreground disabled:opacity-40 disabled:hover:bg-black/20"
                  data-copilot-ask-submit=""
                >
                  {askMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Cmd/Ctrl+Enter to submit.</p>
            </MissionInsetSurface>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
