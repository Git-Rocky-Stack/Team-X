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
 *   - No new bus events, no new IPC channels.
 *   - Radix Sheet handles focus trap + Esc dismissal + `role="dialog"`.
 *   - Ask input is labeled; Cmd/Ctrl+Enter mirrors the existing
 *     `features/chat/composer.tsx` keymap.
 */

import { Loader2, Send, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { CopilotFeedbackSuggestion } from '@team-x/shared-types';

import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useAskCopilot, useCopilotInsights } from '@/hooks/use-copilot.js';
import { useSetCopilotWeights } from '@/hooks/use-settings.js';
import { useAppStore } from '@/store/app-store.js';

import { formatFeedbackSuggestionPrompt, sortBySeverity } from './copilot-helpers.js';
import { CopilotInsightCard } from './copilot-insight-card.js';

// ---------------------------------------------------------------------------

export function CopilotSidebar() {
  const open = useAppStore((s) => s.copilotSidebarOpen);
  const setOpen = useAppStore((s) => s.setCopilotSidebarOpen);
  const companyId = useAppStore((s) => s.companyId);
  const openThread = useAppStore((s) => s.openThread);

  const [askText, setAskText] = useState('');
  const [feedbackSuggestion, setFeedbackSuggestion] = useState<CopilotFeedbackSuggestion | null>(
    null,
  );

  const { data, isLoading, isError, refetch } = useCopilotInsights(companyId);
  const askMutation = useAskCopilot();
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

  const activeCount = sorted.length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
        data-copilot-sidebar-root=""
      >
        <SheetHeader className="border-b border-border px-6 py-4 text-left">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
            <SheetTitle className="text-base">Copilot</SheetTitle>
            <Badge
              variant="outline"
              className="ml-auto font-mono text-[10px] px-1.5"
              data-copilot-active-count={activeCount}
            >
              {activeCount} active
            </Badge>
          </div>
          <SheetDescription className="text-xs">
            Proactive insights — click an action to dispatch, or ask a free-form question below.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="px-4 py-4">
              {feedbackSuggestion && !isLoading && !isError && (
                <div
                  className="mb-3 rounded-md border border-border bg-surface-50 px-3 py-2"
                  data-copilot-feedback-suggestion=""
                >
                  <p className="text-xs font-medium text-foreground">
                    {formatFeedbackSuggestionPrompt(feedbackSuggestion)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={applyFeedbackSuggestion}
                      disabled={!companyId || setCopilotWeights.isPending}
                      data-copilot-feedback-apply=""
                      className="h-7 rounded-md bg-brand px-2.5 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={keepCurrentWeight}
                      disabled={setCopilotWeights.isPending}
                      className="h-7 rounded-md border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface-100 hover:text-foreground disabled:opacity-50"
                    >
                      Keep current
                    </button>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading insights" />
                </div>
              )}

              {isError && (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-foreground">Could not load insights</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The main-process IPC returned an error.
                  </p>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-100"
                  >
                    Retry
                  </button>
                </div>
              )}

              {!isLoading && !isError && sorted.length === 0 && (
                <div className="py-12 text-center" data-copilot-empty="">
                  <Sparkles
                    className="mx-auto h-8 w-8 text-muted-foreground/40"
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-sm font-medium text-foreground">All clear</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No active insights. The copilot re-analyzes the company on its configured
                    interval.
                  </p>
                </div>
              )}

              {!isLoading && !isError && sorted.length > 0 && (
                <ul className="flex flex-col gap-2" data-copilot-feed="">
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

        <div className="shrink-0 border-t border-border bg-surface-50 px-4 py-3">
          <label
            htmlFor="copilot-ask-input"
            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
          >
            Ask the copilot
          </label>
          <div className="mt-1.5 flex items-start gap-2">
            <Textarea
              id="copilot-ask-input"
              rows={2}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              onKeyDown={onAskKeyDown}
              placeholder="Why is the frontend team behind?"
              className="flex-1 resize-none text-sm"
              data-copilot-ask-input=""
              disabled={!companyId || askMutation.isPending}
            />
            <button
              type="button"
              onClick={() => void submitAsk()}
              disabled={!companyId || askMutation.isPending || askText.trim().length === 0}
              aria-label="Ask the copilot"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground disabled:opacity-40 disabled:hover:bg-background"
              data-copilot-ask-submit=""
            >
              {askMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Cmd/Ctrl+Enter to submit.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
