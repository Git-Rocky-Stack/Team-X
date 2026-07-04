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
import { Loader2, Send } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatFeedbackSuggestionPrompt, sortBySeverity } from './copilot-helpers.js';
import { CopilotInsightCard } from './copilot-insight-card.js';

import { RecessedWell, StripeHeader, SubviewState, Tag } from '@/components/console/index.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useAskCopilot, useCopilotExport, useCopilotInsights } from '@/hooks/use-copilot.js';
import { useSetCopilotWeights } from '@/hooks/use-settings.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

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

function formatAskError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Copilot could not start that request. Check provider settings and try again.';
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
  const askErrorMessage = askMutation.isError ? formatAskError(askMutation.error) : null;

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
        className="flex w-full flex-col overflow-hidden border-l border-[var(--hairline)] bg-background p-0 sm:max-w-md"
        data-copilot-sidebar-root=""
      >
        <div className="relative flex h-full flex-col">
          <div className="border-b border-[var(--hairline)] px-5 py-4">
            <StripeHeader kicker="Copilot Command" className="mb-3">
              <Tag mono data-copilot-active-count={activeCount}>
                {activeCount} active
              </Tag>
            </StripeHeader>
            <SheetTitle className="text-h3">Copilot</SheetTitle>
            <SheetDescription className="m-0 mt-1 text-caption text-silver-mute">
              Review proactive insights, export the current queue, or route a free-form request into
              the existing chat transcript flow.
            </SheetDescription>
          </div>

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-4 px-4 py-4">
                <RecessedWell className="p-4" data-copilot-export-controls="">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-eyebrow-sm text-silver-mute">Category</p>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORY_FILTERS.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setCategoryFilter(category)}
                            aria-pressed={categoryFilter === category}
                            data-copilot-category-filter={category}
                            className={cn(
                              'nav-tile',
                              categoryFilter === category && 'nav-tile-active',
                            )}
                          >
                            {formatCategoryLabel(category)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-eyebrow-sm text-silver-mute">Severity</p>
                      <div className="flex flex-wrap gap-2">
                        {SEVERITY_FILTERS.map((severity) => (
                          <button
                            key={severity}
                            type="button"
                            onClick={() => setSeverityFilter(severity)}
                            aria-pressed={severityFilter === severity}
                            data-copilot-severity-filter={severity}
                            className={cn(
                              'nav-tile',
                              severityFilter === severity && 'nav-tile-active',
                            )}
                          >
                            {formatSeverityLabel(severity)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-eyebrow-sm text-silver-mute">Export</p>
                      <div className="flex flex-wrap gap-2">
                        {COPILOT_EXPORT_SCOPES.map((scope) => (
                          <button
                            key={scope}
                            type="button"
                            onClick={() => setExportScope(scope)}
                            aria-pressed={exportScope === scope}
                            data-copilot-export-scope={scope}
                            className={cn('nav-tile', exportScope === scope && 'nav-tile-active')}
                          >
                            {formatScopeLabel(scope)}
                          </button>
                        ))}
                        {COPILOT_EXPORT_FORMATS.map((format) => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => submitExport(format)}
                            disabled={
                              exportMutation.isPending || (exportScope === 'company' && !companyId)
                            }
                            data-copilot-export-format={format}
                            className="cap"
                          >
                            {format === 'csv' ? 'CSV' : 'JSON'}
                          </button>
                        ))}
                      </div>
                      {exportMutation.isSuccess && (
                        <p
                          className="mt-3 text-caption text-silver-mute"
                          data-copilot-export-status=""
                        >
                          Exported {exportMutation.data.rowCount} insight
                          {exportMutation.data.rowCount === 1 ? '' : 's'} to{' '}
                          {formatExportFileName(exportMutation.data.filePath)}
                          {exportMutation.data.truncated ? ' (truncated)' : ''}
                        </p>
                      )}
                      {exportMutation.isError && (
                        <p
                          className="mt-3 text-caption text-destructive"
                          data-copilot-export-error=""
                        >
                          Export failed. Try again.
                        </p>
                      )}
                    </div>
                  </div>
                </RecessedWell>

                {feedbackSuggestion && !isLoading && !isError && (
                  <RecessedWell className="p-4" data-copilot-feedback-suggestion="">
                    <p className="text-caption text-foreground">
                      {formatFeedbackSuggestionPrompt(feedbackSuggestion)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={applyFeedbackSuggestion}
                        disabled={!companyId || setCopilotWeights.isPending}
                        data-copilot-feedback-apply=""
                        className="nav-tile nav-tile-active"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={keepCurrentWeight}
                        disabled={setCopilotWeights.isPending}
                        className="nav-tile"
                      >
                        Keep current
                      </button>
                    </div>
                  </RecessedWell>
                )}

                {isLoading && (
                  <SubviewState
                    lampLabel="STBY"
                    lampTone="hold"
                    title="Loading copilot insights"
                    description="The proactive insight queue is syncing for the active workspace."
                  />
                )}

                {isError && (
                  <SubviewState
                    lampLabel="NO-GO"
                    lampTone="nogo"
                    title="Could not load insights"
                    description="The main-process IPC returned an error."
                    action={
                      <button type="button" className="nav-tile" onClick={() => refetch()}>
                        Retry
                      </button>
                    }
                  />
                )}

                {!isLoading && !isError && sorted.length === 0 && (
                  <div data-copilot-empty="">
                    <SubviewState
                      lampLabel="STBY"
                      lampTone="off"
                      title="All clear"
                      description="No active insights. The copilot re-analyzes the company on its configured interval."
                    />
                  </div>
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

          <div className="shrink-0 border-t border-[var(--hairline)] px-4 py-4">
            <RecessedWell className="p-4">
              <label htmlFor="copilot-ask-input" className="text-eyebrow-sm text-silver-mute">
                Ask the copilot
              </label>
              <div className="mt-2 flex items-start gap-3">
                <Textarea
                  id="copilot-ask-input"
                  rows={2}
                  value={askText}
                  onChange={(e) => {
                    if (askMutation.isError) askMutation.reset();
                    setAskText(e.target.value);
                  }}
                  onKeyDown={onAskKeyDown}
                  placeholder="Why is the frontend team behind?"
                  className="flex-1 resize-none text-body"
                  data-copilot-ask-input=""
                  disabled={!companyId || askMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => void submitAsk()}
                  disabled={!companyId || askMutation.isPending || askText.trim().length === 0}
                  aria-label="Ask the copilot"
                  className="cap-armed flex h-11 w-11 shrink-0 items-center justify-center"
                  data-copilot-ask-submit=""
                >
                  {askMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              {askErrorMessage && (
                <p
                  className="mt-2 text-caption text-destructive"
                  role="alert"
                  data-copilot-ask-error=""
                >
                  {askErrorMessage}
                </p>
              )}
              <p className="mt-2 text-caption text-silver-mute">Cmd/Ctrl+Enter to submit.</p>
            </RecessedWell>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
