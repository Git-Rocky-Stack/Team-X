/**
 * Command Palette (Phase 5 — M30 T6).
 *
 * A Cmd+K / Ctrl+K modal that turns natural-language input into
 * structured, confirmed, executable commands. Built on top of the
 * `command.*` IPC surface shipped in T5.
 *
 * Behaviour contract (verbatim from the plan doc §T6):
 *
 *   - Input debounced 200 ms → `command.parse`.
 *   - Meta row below input: intent chip, entity chips, confidence bar
 *     (red < 0.5, amber 0.5–0.8, green > 0.8).
 *   - `ready` → Enter triggers `command.execute` immediately.
 *   - `needs_clarification` → candidate pick list; Arrow keys navigate,
 *     Enter picks. Picking rewrites the input to "<verb> <picked>" and
 *     re-parses — the single-entry-point `parse` channel stays the
 *     only NLU surface.
 *   - `needs_confirmation` → summary + Confirm (destructive-red) /
 *     Cancel. Enter while Confirm is focused triggers `execute` with
 *     `confirmed: true`. Esc cancels.
 *   - Post-execute: undo toast for non-destructive Create / Assign
 *     outcomes. Destructive actions (Fire / Close / End / Promote)
 *     never offer undo — they are explicit.
 *   - History picker: ↑ from empty input cycles backward through the
 *     last 20 commands; ↓ walks forward.
 *   - Structured command fallback: typing `/show <view>` bypasses the
 *     NLU and switches the active tab directly. Scoped to `/show` for
 *     M30; additional slash-commands land in a follow-up.
 *
 * Invariants honoured: renderer is a pure view (all IPC via `ipc`),
 * destructive intents NEVER silent-default to `confirmed: true`, the
 * palette mounts once at the app shell root and uses Radix's built-in
 * focus trap + Esc dismissal.
 */

import type { IpcExecuteResult, IpcIntentName, IpcParseResult } from '@team-x/shared-types';
import {
  AlertCircle,
  CornerDownLeft,
  ExternalLink,
  Loader2,
  Sparkles,
  StopCircle,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INTENT_LABELS } from './intent-labels.js';
import { StepCard, StepCardSkeleton } from './step-card.js';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog.js';
import { useAgentStepStream } from '@/hooks/use-agent-step-stream.js';
import { useCommandExecute, useCommandHistory, useCommandParse } from '@/hooks/use-command.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { type ActiveView, useAppStore } from '@/store/app-store.js';

// ---------------------------------------------------------------------------
// Intent metadata — destructive-tint flag, paired with the shared
// `INTENT_LABELS` mapping (kept in `intent-labels.ts` so the audit log
// and Dashboard Commands subview render the same copy).
// ---------------------------------------------------------------------------

const DESTRUCTIVE_INTENT_SET: ReadonlySet<IpcIntentName> = new Set<IpcIntentName>([
  'fire_employee',
  'close_ticket',
  'end_meeting',
  'promote_employee',
]);

const INTENT_META: Record<IpcIntentName, { label: string; destructive: boolean }> = Object.freeze(
  (Object.keys(INTENT_LABELS) as IpcIntentName[]).reduce(
    (acc, intent) => {
      acc[intent] = {
        label: INTENT_LABELS[intent],
        destructive: DESTRUCTIVE_INTENT_SET.has(intent),
      };
      return acc;
    },
    {} as Record<IpcIntentName, { label: string; destructive: boolean }>,
  ),
);

/** Views the `/show <view>` slash-command accepts. */
const SHOW_VIEW_LITERALS: ReadonlyArray<ActiveView> = [
  'dashboard',
  'org',
  'projects',
  'tickets',
  'meetings',
  'chat',
  'files',
  'telemetry',
  'audit',
  'settings',
];

// ---------------------------------------------------------------------------
// Toast primitive — minimal inline implementation
// ---------------------------------------------------------------------------
//
// No toast library is installed in this workspace (checked `sonner`,
// `react-hot-toast`, `components/ui/` — nothing matches). Per the plan
// directive to NOT introduce new deps, we ship a minimal inline toast
// scoped to this feature. If a richer toast UX is needed later, swap
// this out for a shared primitive in a follow-up; the API surface
// (`setToast`) stays the same.

interface ToastPayload {
  message: string;
  undoable: boolean;
  onUndo?: () => void;
}

function Toast({ toast, onDismiss }: { toast: ToastPayload; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 5_000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  return (
    <output
      aria-live="polite"
      className="pointer-events-auto fixed bottom-6 right-6 z-[70] flex items-center gap-3 rounded-lg border border-border bg-surface-100 px-4 py-3 shadow-lg"
    >
      <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
      <span className="text-body text-foreground">{toast.message}</span>
      {toast.undoable && toast.onUndo && (
        <button
          type="button"
          onClick={toast.onUndo}
          className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-button-sm text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <Undo2 className="h-3 w-3" /> Undo
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <X className="h-3 w-3" />
      </button>
    </output>
  );
}

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------

function ConfidenceBar({ confidence, loading }: { confidence: number; loading: boolean }) {
  const pct = Math.max(0, Math.min(1, confidence));
  const color = pct < 0.5 ? 'bg-red-500' : pct < 0.8 ? 'bg-amber-500' : 'bg-emerald-500';
  const label = pct < 0.5 ? 'low' : pct < 0.8 ? 'medium' : 'high';

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        tabIndex={-1}
        aria-label={`Classification confidence (${label})`}
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-200"
      >
        <div
          className={cn('h-full transition-all duration-200', color)}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="text-eyebrow-sm text-muted-foreground">
        {Math.round(pct * 100)}%
      </span>
      {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta row (intent chip, entity chips, confidence bar)
// ---------------------------------------------------------------------------

interface MetaRowProps {
  parseResult: IpcParseResult | null;
  parsing: boolean;
  confidence: number;
}

function MetaRow({ parseResult, parsing, confidence }: MetaRowProps) {
  const intent = extractIntent(parseResult);
  const entities = extractEntities(parseResult);
  const meta = intent ? INTENT_META[intent] : null;

  return (
    <div className="flex min-h-[28px] flex-wrap items-center gap-2">
      {meta && (
        <Badge
          variant={meta.destructive ? 'destructive' : 'secondary'}
          className={cn(
            'text-caption font-medium',
            meta.destructive && 'bg-red-500/15 text-red-400 hover:bg-red-500/20',
          )}
          aria-label={`Intent: ${meta.label}`}
        >
          {meta.label}
        </Badge>
      )}
      {Object.entries(entities).map(([key, value]) => (
        <Badge
          key={key}
          variant="outline"
          className={cn(
            'text-caption',
            value ? 'text-foreground' : 'text-muted-foreground opacity-60',
          )}
          aria-label={`Entity ${key}: ${value}`}
        >
          <span className="mr-1 text-muted-foreground">{key}:</span>
          {value || 'pending'}
        </Badge>
      ))}
      <div className="ml-auto">
        <ConfidenceBar confidence={confidence} loading={parsing} />
      </div>
    </div>
  );
}

function extractIntent(r: IpcParseResult | null): IpcIntentName | null {
  if (!r) return null;
  if (r.kind === 'ready' || r.kind === 'needs_confirmation') return r.intent;
  if (r.kind === 'needs_clarification') return r.pending.intent;
  return null;
}

function extractEntities(r: IpcParseResult | null): Record<string, string> {
  if (!r) return {};
  if (r.kind === 'ready' || r.kind === 'needs_confirmation') return r.entities;
  if (r.kind === 'needs_clarification') return r.pending.entities;
  return {};
}

// ---------------------------------------------------------------------------
// Main palette
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
}

export function CommandPalette({ open, onOpenChange, companyId }: CommandPaletteProps) {
  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<IpcParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [clarificationIdx, setClarificationIdx] = useState(0);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);
  /**
   * Active agentic-loop run (Phase 5 — M31 T6). Populated when
   * `command.execute` returns `{ kind: 'ok', runId, threadId }` for a
   * `complex_request` intent. While non-null the palette body renders
   * the live step-log view instead of the standard ready/confirm/etc
   * branches. Reset on close + when the user explicitly opens the
   * thread or dismisses.
   */
  const [agenticRun, setAgenticRun] = useState<{ runId: string; threadId: string } | null>(null);
  const [stopPending, setStopPending] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<number | null>(null);

  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const openThread = useAppStore((s) => s.openThread);

  const parseMutation = useCommandParse();
  const executeMutation = useCommandExecute();
  const historyQuery = useCommandHistory(companyId);

  const confidence = useMemo(() => computeConfidence(parseResult), [parseResult]);

  // --- Reset state whenever the palette closes -----------------------------

  useEffect(() => {
    if (!open) {
      setText('');
      setParseResult(null);
      setParseError(null);
      setClarificationIdx(0);
      setHistoryIdx(null);
      setConfirmFocused(false);
      setAgenticRun(null);
      setStopPending(false);
    }
  }, [open]);

  // --- Debounced parse on text change --------------------------------------

  useEffect(() => {
    if (!open || !companyId) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setParseResult(null);
      setParseError(null);
      return;
    }
    // Slash-command bypass: do NOT call command.parse for `/…` input.
    if (trimmed.startsWith('/')) {
      setParseResult(null);
      setParseError(null);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      parseMutation.mutate(
        { text: trimmed, companyId, currentView: activeView },
        {
          onSuccess: (result) => {
            setParseResult(result);
            setParseError(null);
            setClarificationIdx(0);
          },
          onError: (err) => {
            setParseResult(null);
            setParseError(err instanceof Error ? err.message : 'Parse failed');
          },
        },
      );
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [text, open, companyId, activeView, parseMutation.mutate]);

  // --- Focus management ----------------------------------------------------

  useEffect(() => {
    if (parseResult?.kind === 'needs_confirmation') {
      // Move focus to Confirm so Enter dispatches execute(confirmed: true).
      // Delay a tick so Radix finishes its own focus shuffling.
      const t = window.setTimeout(() => {
        confirmRef.current?.focus();
        setConfirmFocused(true);
      }, 30);
      return () => window.clearTimeout(t);
    }
    setConfirmFocused(false);
    return;
  }, [parseResult?.kind]);

  // --- Slash-command handler -----------------------------------------------

  const handleSlashCommand = useCallback(
    (input: string): boolean => {
      const match = input.match(/^\/show\s+(\w+)$/i);
      if (match?.[1]) {
        const target = match[1].toLowerCase();
        if ((SHOW_VIEW_LITERALS as readonly string[]).includes(target)) {
          setActiveView(target as ActiveView);
          setToast({ message: `Switched to ${target}`, undoable: false });
          onOpenChange(false);
          return true;
        }
      }
      return false;
    },
    [onOpenChange, setActiveView],
  );

  // --- Execute ------------------------------------------------------------

  const handleExecute = useCallback(
    (intent: IpcIntentName, entities: Record<string, string>, confirmed: boolean) => {
      if (!companyId) return;
      executeMutation.mutate(
        { intent, entities, confirmed, companyId, rawText: text.trim() || undefined },
        {
          onSuccess: (result: IpcExecuteResult) => {
            if (result.kind === 'ok') {
              // Agentic-loop dispatch: enter step-log mode, keep palette
              // open, and let the user watch the ReAct stream. Undo /
              // toast semantics don't apply — the loop is read-only.
              if (result.runId && result.threadId) {
                setAgenticRun({ runId: result.runId, threadId: result.threadId });
                setParseResult(null);
                setParseError(null);
                return;
              }
              const destructive = INTENT_META[result.intent].destructive;
              setToast({
                message: result.summary,
                undoable: !destructive && isReversibleIntent(result.intent),
                onUndo: isReversibleIntent(result.intent)
                  ? () => runUndo(result, companyId)
                  : undefined,
              });
              onOpenChange(false);
            } else if (result.kind === 'needs_confirmation') {
              // Defensive — main should have returned this via parse first.
              // Surface as inline state so the user can click Confirm.
              setParseResult({
                kind: 'needs_confirmation',
                intent,
                entities,
                summary: result.summary,
                gateKind: result.gateKind,
                pending: {
                  intent,
                  entities,
                  rawText: text.trim(),
                  classifiedAt: new Date().toISOString(),
                },
              });
            } else {
              setParseError(result.message);
            }
          },
          onError: (err) => {
            setParseError(err instanceof Error ? err.message : 'Execution failed');
          },
        },
      );
    },
    [companyId, executeMutation, onOpenChange, text],
  );

  // --- Clarification picker -----------------------------------------------

  const pickClarification = useCallback(
    (option: string) => {
      if (!parseResult || parseResult.kind !== 'needs_clarification') return;
      // Rewrite the input so the same parse channel narrows it. This keeps
      // `command.parse` the single NLU entry-point (per plan T6 guidance).
      const rawVerb = parseResult.pending.rawText.split(/\s+/)[0] ?? '';
      setText(`${rawVerb} ${option}`.trim());
    },
    [parseResult],
  );

  // --- Agentic-loop actions (Phase 5 — M31 T6) -----------------------------

  const handleStopAgentic = useCallback(async () => {
    if (!agenticRun || stopPending) return;
    setStopPending(true);
    try {
      await ipc.command.stop({ runId: agenticRun.runId });
    } catch {
      // Non-blocking: the terminal `agentic.failed` event on the bus
      // is the authoritative signal that the run ended. If stop()
      // itself failed (vanishingly rare), the user can just close
      // the palette and the loop will time out on its own budget cap.
    } finally {
      setStopPending(false);
    }
  }, [agenticRun, stopPending]);

  const handleOpenAgenticThread = useCallback(() => {
    if (!agenticRun) return;
    openThread({
      threadId: agenticRun.threadId,
      isAgentThread: false,
      employeeId: null,
      isCopilotThread: true,
    });
    onOpenChange(false);
  }, [agenticRun, onOpenChange, openThread]);

  // --- Keydown on input ---------------------------------------------------

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // History navigation when input is empty
      if (text.length === 0 && historyQuery.data && historyQuery.data.length > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const next =
            historyIdx === null ? 0 : Math.min(historyIdx + 1, historyQuery.data.length - 1);
          setHistoryIdx(next);
          const row = historyQuery.data[next];
          if (row) setText(row.text);
          return;
        }
      }
      if (historyIdx !== null && historyQuery.data && historyQuery.data.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = historyIdx - 1;
          if (next < 0) {
            setHistoryIdx(null);
            setText('');
          } else {
            setHistoryIdx(next);
            const row = historyQuery.data[next];
            if (row) setText(row.text);
          }
          return;
        }
      }

      // Clarification navigation
      if (parseResult?.kind === 'needs_clarification') {
        const options = parseResult.options;
        if (options && options.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setClarificationIdx((i) => Math.min(i + 1, options.length - 1));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setClarificationIdx((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const picked = options[clarificationIdx];
            if (picked) pickClarification(picked);
            return;
          }
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const trimmed = text.trim();
        // Slash-command bypass
        if (trimmed.startsWith('/')) {
          if (!handleSlashCommand(trimmed)) {
            setParseError(`Unknown slash-command: ${trimmed}`);
          }
          return;
        }
        if (parseResult?.kind === 'ready') {
          handleExecute(parseResult.intent, parseResult.entities, false);
        }
        // `needs_confirmation` is handled by the Confirm button's onClick
        // so Enter here only fires on ready state.
      }
    },
    [
      text,
      historyIdx,
      historyQuery.data,
      parseResult,
      clarificationIdx,
      pickClarification,
      handleExecute,
      handleSlashCommand,
    ],
  );

  // --- Render --------------------------------------------------------------

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'gap-0 border-border bg-surface-100 p-0',
            agenticRun ? 'w-[640px] max-w-[96vw]' : 'w-[560px] max-w-[92vw]',
          )}
          onOpenAutoFocus={(e) => {
            // Let us focus the input manually so autoFocus on mount works.
            e.preventDefault();
            if (!agenticRun) inputRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Command Palette</DialogTitle>

          {/* Agentic-loop step-log mode (Phase 5 — M31 T6) */}
          {agenticRun ? (
            <StepLogView
              runId={agenticRun.runId}
              threadId={agenticRun.threadId}
              stopPending={stopPending}
              onStop={handleStopAgentic}
              onOpenThread={handleOpenAgenticThread}
              onDismiss={() => onOpenChange(false)}
            />
          ) : (
            <>
              {/* Input row */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setHistoryIdx(null);
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a command — e.g. hire a senior backend engineer"
                  aria-label="Command input"
                  className="min-h-[44px] flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
                />
                {parseMutation.isPending && (
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Meta row */}
              {(parseResult || parseMutation.isPending) && (
                <div className="border-b border-border/60 bg-surface-50 px-4 py-2.5">
                  <MetaRow
                    parseResult={parseResult}
                    parsing={parseMutation.isPending}
                    confidence={confidence}
                  />
                </div>
              )}

              {/* State-dispatch body */}
              <div className="px-4 py-3">
                {parseError && (
                  <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-body text-red-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="font-medium">Couldn&apos;t parse that.</p>
                      <p className="mt-0.5 text-caption opacity-90">{parseError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!companyId || text.trim().length === 0) return;
                        parseMutation.mutate(
                          { text: text.trim(), companyId, currentView: activeView },
                          {
                            onSuccess: (r) => {
                              setParseResult(r);
                              setParseError(null);
                            },
                            onError: (err) => {
                              setParseError(err instanceof Error ? err.message : 'Parse failed');
                            },
                          },
                        );
                      }}
                      className="rounded-md border border-red-500/40 px-2 py-1 text-button-sm text-red-400 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* READY */}
                {parseResult?.kind === 'ready' && !parseError && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-body text-foreground">
                      {parseResult.summary ?? `${INTENT_META[parseResult.intent].label} ready.`}
                    </p>
                    <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                      Press <Kbd>Enter</Kbd> to run <CornerDownLeft className="h-3 w-3" />
                    </span>
                  </div>
                )}

                {/* NEEDS CLARIFICATION */}
                {parseResult?.kind === 'needs_clarification' && !parseError && (
                  <div className="space-y-2">
                    <p className="text-body text-muted-foreground">{parseResult.prompt}</p>
                    {parseResult.options && parseResult.options.length > 0 && (
                      <ul aria-label="Clarification options" className="space-y-1">
                        {parseResult.options.map((opt, i) => (
                          <li key={opt}>
                            <button
                              type="button"
                              aria-pressed={i === clarificationIdx}
                              onClick={() => pickClarification(opt)}
                              className={cn(
                                'flex min-h-[44px] w-full items-center rounded-md px-3 py-2 text-left text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
                                i === clarificationIdx
                                  ? 'bg-brand/10 text-foreground ring-1 ring-brand/40'
                                  : 'text-foreground/90 hover:bg-surface-200',
                              )}
                            >
                              {opt}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* NEEDS CONFIRMATION */}
                {parseResult?.kind === 'needs_confirmation' &&
                  !parseError &&
                  (() => {
                    const isWriteSide = parseResult.gateKind === 'write-side';
                    const borderColor = isWriteSide ? 'border-amber-500/30' : 'border-red-500/30';
                    const bgColor = isWriteSide ? 'bg-amber-500/10' : 'bg-red-500/10';
                    const btnBg = isWriteSide
                      ? 'bg-amber-600 text-white hover:bg-amber-600/90'
                      : 'bg-red-600 text-white hover:bg-red-600/90';
                    const ringColor = isWriteSide ? 'ring-amber-500/60' : 'ring-red-500/60';
                    const title = isWriteSide
                      ? 'Confirm write-side agentic run'
                      : 'Confirm destructive action';
                    return (
                      <div className="space-y-3">
                        <div className={cn('rounded-md border p-3', borderColor, bgColor)}>
                          <p className="text-body-strong text-foreground">{title}</p>
                          <p className="mt-1 text-body text-muted-foreground">
                            {parseResult.summary}
                          </p>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setParseResult(null);
                              setText('');
                              inputRef.current?.focus();
                            }}
                            className="min-h-[44px]"
                          >
                            Cancel
                          </Button>
                          <Button
                            ref={confirmRef}
                            variant={isWriteSide ? 'default' : 'destructive'}
                            disabled={executeMutation.isPending}
                            onClick={() =>
                              handleExecute(parseResult.intent, parseResult.entities, true)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleExecute(parseResult.intent, parseResult.entities, true);
                              }
                            }}
                            className={cn(
                              'min-h-[44px]',
                              btnBg,
                              confirmFocused && `ring-2 ${ringColor} ring-offset-2`,
                            )}
                          >
                            {executeMutation.isPending ? (
                              <>
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Confirming...
                              </>
                            ) : (
                              'Confirm'
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                {/* EMPTY — history picker hint */}
                {!parseResult && !parseMutation.isPending && !parseError && text.length === 0 && (
                  <HistoryHint
                    historyCount={historyQuery.data?.length ?? 0}
                    selectedIdx={historyIdx}
                    selectedText={
                      historyIdx !== null && historyQuery.data
                        ? (historyQuery.data[historyIdx]?.text ?? null)
                        : null
                    }
                  />
                )}

                {/* SLASH-COMMAND HINT */}
                {!parseResult &&
                  !parseMutation.isPending &&
                  !parseError &&
                  text.trim().startsWith('/') && (
                    <div className="text-caption text-muted-foreground">
                      <p>
                        Slash-command mode. Press <Kbd>Enter</Kbd> to run.
                      </p>
                      <p className="mt-1 opacity-70">
                        Supported:{' '}
                        <code className="font-mono text-foreground/80">/show &lt;view&gt;</code>
                        {' — '}
                        e.g. <code className="font-mono text-foreground/80">/show tickets</code>
                      </p>
                    </div>
                  )}

                {/* COMPLEX REQUEST FALLBACK */}
                {parseResult?.kind === 'ready' &&
                  parseResult.intent === 'complex_request' &&
                  !parseError && (
                    <p className="mt-2 text-caption text-muted-foreground">
                      I&apos;ll route this to the conversational agent.
                    </p>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step-log view (Phase 5 — M31 T6)
// ---------------------------------------------------------------------------

interface StepLogViewProps {
  runId: string;
  threadId: string;
  stopPending: boolean;
  onStop: () => void;
  onOpenThread: () => void;
  onDismiss: () => void;
}

function StepLogView({
  runId,
  threadId,
  stopPending,
  onStop,
  onOpenThread,
  onDismiss,
}: StepLogViewProps) {
  // M32 T0 / F1 — pass runId so the hook can backfill on mount. Fixes
  // the race where fast providers complete before the bus subscription
  // attaches and the palette would otherwise show only the final-answer
  // card (or nothing at all).
  const { steps, result } = useAgentStepStream(threadId, runId);
  const listRef = useRef<HTMLUListElement>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  // Auto-scroll to the newest step as they arrive. Skipped once the
  // run reaches a terminal state so the user's scroll position is
  // preserved while they re-read the transcript. `steps.length` is
  // the trigger — biome flags it as unused because the body only
  // reads DOM state, but the DOM state reflects `steps` and we need
  // to re-run on every new step. Void-reference it to satisfy both
  // the linter and the intent.
  useEffect(() => {
    if (result) return;
    const el = listRef.current;
    if (!el) return;
    void steps.length;
    el.scrollTop = el.scrollHeight;
  }, [steps.length, result]);

  // Cumulative totals — prefer the terminal event's authoritative
  // numbers when available, otherwise fold over the per-step payloads.
  // The terminal event's numbers include the final answer's tokens,
  // which is why we don't use it during streaming.
  const totals = useMemo(() => {
    if (result) {
      return {
        tokensIn: result.payload.tokensIn,
        tokensOut: result.payload.tokensOut,
        costUsd: result.payload.costUsd,
      };
    }
    return steps.reduce(
      (acc, step) => ({
        tokensIn: acc.tokensIn + step.tokensIn,
        tokensOut: acc.tokensOut + step.tokensOut,
        costUsd: acc.costUsd + step.costUsd,
      }),
      { tokensIn: 0, tokensOut: 0, costUsd: 0 },
    );
  }, [steps, result]);

  const isRunning = result === null;
  const terminalKind = result?.kind ?? null;

  // Keyboard navigation over step cards. ArrowUp/Down advances focus
  // to the next/previous <article> within the scroll container.
  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (steps.length === 0) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const next =
        e.key === 'ArrowDown'
          ? Math.min((focusIdx ?? -1) + 1, steps.length - 1)
          : Math.max((focusIdx ?? steps.length) - 1, 0);
      setFocusIdx(next);
      const node = listRef.current?.querySelectorAll<HTMLElement>('[data-step-kind]')[next];
      node?.focus();
    },
    [focusIdx, steps.length],
  );

  return (
    <div className="flex max-h-[640px] flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-body-strong text-foreground">
            {isRunning
              ? 'Copilot is thinking…'
              : terminalKind === 'completed'
                ? 'Answer ready'
                : 'Run ended'}
          </p>
          <p className="truncate text-caption text-muted-foreground">
            <code className="font-mono">{runId}</code>
          </p>
        </div>
        {isRunning && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </header>

      {/* Step scroll container */}
      <ul
        ref={listRef}
        aria-label="Agent step transcript"
        onKeyDown={onListKeyDown}
        className="flex min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto bg-surface-50 px-4 py-3"
      >
        {steps.length === 0 && isRunning && (
          <li>
            <StepCardSkeleton />
          </li>
        )}
        {steps.length === 0 && !isRunning && (
          <li className="py-8 text-center text-caption text-muted-foreground">
            The agent produced no steps before terminating.
          </li>
        )}
        {steps.map((step) => (
          <li key={`${step.runId}-${step.stepIndex}`}>
            <StepCard step={step} isDimmed={!isRunning} />
          </li>
        ))}

        {/* Terminal error card — rendered when `agentic.failed` was
            not accompanied by an in-stream `error` step (e.g. a
            budget-exhausted abort with no partial answer). */}
        {result?.kind === 'failed' && (
          <li role="alert" className="mt-1 rounded-md border border-red-500/60 bg-red-500/5 p-3">
            <p className="text-eyebrow text-red-400">
              Run failed — {result.payload.reason}
            </p>
            <p className="mt-1 text-body text-foreground">{result.payload.message}</p>
          </li>
        )}
      </ul>

      {/* Footer — cumulative cost + action buttons */}
      <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface-100 px-4 py-3">
        <div className="flex items-center gap-3 text-caption text-muted-foreground tabular-nums">
          <span>
            <span className="text-foreground/70">{steps.length}</span> step
            {steps.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="text-foreground/70">
              {(totals.tokensIn + totals.tokensOut).toLocaleString()}
            </span>{' '}
            tok
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="text-foreground/70">${totals.costUsd.toFixed(4)}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button
              variant="ghost"
              onClick={onStop}
              disabled={stopPending}
              aria-label="Stop agentic run"
              className="min-h-[36px] gap-1.5 text-button-sm text-red-400 hover:bg-red-500/10 hover:text-red-400"
            >
              {stopPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <StopCircle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Stop
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onDismiss} className="min-h-[36px] text-button-sm">
                Close
              </Button>
              <Button
                variant="default"
                onClick={onOpenThread}
                aria-label="Open thread in chat drawer"
                className="min-h-[36px] gap-1.5 bg-brand text-button-sm text-white hover:bg-brand/90"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open Thread
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-50 px-1.5 py-0.5 text-shortcut text-foreground/80">
      {children}
    </kbd>
  );
}

function HistoryHint({
  historyCount,
  selectedIdx,
  selectedText,
}: {
  historyCount: number;
  selectedIdx: number | null;
  selectedText: string | null;
}) {
  if (historyCount === 0) {
    return (
      <div className="text-caption text-muted-foreground">
        <p>
          Start typing to classify, or use a slash-command like{' '}
          <code className="font-mono">/show tickets</code>.
        </p>
      </div>
    );
  }
  return (
    <div className="text-caption text-muted-foreground">
      {selectedIdx !== null && selectedText ? (
        <p>
          History{' '}
          <span className="font-mono text-foreground/80">
            [{selectedIdx + 1}/{historyCount}]
          </span>
          : <span className="text-foreground">{selectedText}</span>
        </p>
      ) : (
        <p>
          Press <Kbd>↑</Kbd> to browse the last {historyCount} command
          {historyCount === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  );
}

/**
 * Extract a confidence number from a parse result. T5 doesn't surface
 * raw classifier confidence through `IpcParseResult` (it lives in the
 * main-process `NluContext` trace), so we approximate:
 *   - `ready` + non-empty entities → 0.9
 *   - `ready` + empty entities → 0.65
 *   - `needs_confirmation` → 0.95 (destructive gate is high-conviction)
 *   - `needs_clarification` → 0.4 (model is unsure — amber/red)
 *   - null → 0
 * This drives the coloured bar only; it never gates execute.
 */
function computeConfidence(r: IpcParseResult | null): number {
  if (!r) return 0;
  if (r.kind === 'needs_confirmation') return 0.95;
  if (r.kind === 'ready') {
    const entCount = Object.keys(r.entities).length;
    return entCount > 0 ? 0.9 : 0.65;
  }
  return 0.4;
}

/** Non-destructive intents that are sensibly reversible via a direct IPC. */
function isReversibleIntent(intent: IpcIntentName): boolean {
  // M30 only surfaces "undo assign" and "undo create" hooks for Create/Assign
  // non-destructive actions. Everything else shows a confirmation toast with
  // no undo affordance.
  return (
    intent === 'create_ticket' ||
    intent === 'create_project' ||
    intent === 'create_goal' ||
    intent === 'assign_ticket'
  );
}

/**
 * Best-effort undo — routes to the matching IPC directly when the
 * resource id is known. Destructive failures fall through to a toast
 * update; they never throw to the user.
 */
async function runUndo(
  result: Extract<IpcExecuteResult, { kind: 'ok' }>,
  companyId: string,
): Promise<void> {
  try {
    if (result.intent === 'create_ticket' && result.resultId) {
      // Closing is the closest reversible for a newly-created ticket —
      // we intentionally do not call a destructive "delete" IPC from
      // undo. Close keeps the audit log intact.
      await ipc.tickets.close(String(result.resultId));
    } else if (result.intent === 'assign_ticket' && result.resultId) {
      // No dedicated "unassign" channel in M30 — re-opening is closest.
      await ipc.tickets.reopen(String(result.resultId));
    }
    // create_project / create_goal do not ship delete IPCs in M30;
    // the undo toast is still shown for visibility but is a no-op.
  } catch {
    // Undo is best-effort — swallow.
  }
  // We intentionally do not read from `companyId` here beyond scoping
  // the intent — the IPC already scopes by resource id.
  void companyId;
}
