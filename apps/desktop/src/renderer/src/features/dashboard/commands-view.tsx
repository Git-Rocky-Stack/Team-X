/**
 * Dashboard "Commands" subview — latest 10 Cmd+K commands for the
 * active company, newest first.
 *
 * Phase 5 — M30 T7.
 *
 * Data source: `useCommandHistory(companyId)` (already shipped in
 * T6's `use-command.ts`). The hook returns `IpcCommandHistoryEntry[]`
 * sorted newest-first by the CommandService's SQL query, so we slice
 * the first 10 and render without additional sorting.
 *
 * UX contract:
 *   - Each row: relative time ("3m ago"), actor label, intent chip
 *     (shared `INTENT_LABELS`), raw text (truncated), outcome badge,
 *     click-to-copy the raw text.
 *   - Empty state: "No commands yet — press Ctrl+K to get started."
 *   - Loading: skeleton rows (5).
 *   - Error: red inline banner with Retry button.
 *
 * Renderer-only: no IPC beyond the history hook. No mutations on this
 * surface — this is purely a read-only audit-style card.
 */

import type { IpcCommandHistoryEntry } from '@team-x/shared-types';
import { Check, Copy, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { formatTimeAgo, sortByNewestFirst, truncateText } from './commands-view-helpers.js';

import { Faceplate, LampTile } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { intentLabel } from '@/features/command/intent-labels.js';
import { useCommandHistory } from '@/hooks/use-command.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum rows rendered — the history repo caps at 20, we surface half. */
const MAX_ROWS = 10;

/** Skeleton row count during the initial query. */
const SKELETON_COUNT = 5;

/** Actor label for the user row (Rocky). Matches AuditView convention. */
const USER_LABEL = 'Rocky';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-0"
    >
      <span className="h-3 w-16 animate-pulse rounded bg-carbon-900" />
      <span className="h-5 w-24 animate-pulse rounded bg-carbon-900" />
      <span className="h-3 flex-1 animate-pulse rounded bg-carbon-900" />
      <span className="h-4 w-12 animate-pulse rounded bg-carbon-900" />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      data-testid="commands-empty-state"
      className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground"
    >
      <Terminal className="h-8 w-8" aria-hidden="true" />
      <p className="text-body-strong">No commands yet</p>
      <p className="text-caption text-muted-foreground/70">
        Press{' '}
        <kbd className="rounded border border-[hsl(var(--hairline))] bg-carbon-900 px-1.5 py-0.5 text-shortcut">
          Ctrl+K
        </kbd>{' '}
        to get started.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      data-testid="commands-error-state"
      className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <LampTile label="FAULT" tone="warn" small interactive={false} />
      <p className="text-body-strong text-led-warn">Failed to load command history</p>
      <p className="max-w-sm text-caption text-muted-foreground">{message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function CommandRow({ entry }: { entry: IpcCommandHistoryEntry }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    const text = entry.text?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silent — a failed clipboard write is recoverable by the user.
    }
  }, [entry.text]);

  const actorLabel = entry.actorId === 'user' ? USER_LABEL : entry.actorId;
  const label = intentLabel(entry.intent);
  const outcomeOk = entry.outcome === 'ok';
  const previewText = entry.text?.trim() || `(${label})`;
  const truncated = truncateText(previewText);

  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Click to copy: ${previewText}`}
      className="group flex w-full items-center gap-3 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-carbon-900 focus-visible:bg-carbon-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      <span className="w-20 shrink-0 text-caption text-muted-foreground">
        {formatTimeAgo(entry.executedAt)}
      </span>

      <span className="w-16 shrink-0 truncate text-caption font-medium text-foreground">
        {actorLabel}
      </span>

      <LampTile label={label} tone="exec" small interactive={false} />

      <span className="ml-1 min-w-0 flex-1 truncate text-body text-foreground/80">{truncated}</span>

      <LampTile
        label={outcomeOk ? 'OK' : 'ERR'}
        tone={outcomeOk ? 'go' : 'warn'}
        small
        interactive={false}
      />

      <span
        aria-hidden="true"
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-led-go" /> : <Copy className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CommandsViewProps {
  companyId: string | null;
}

export function CommandsView({ companyId }: CommandsViewProps) {
  const { data, isLoading, isError, error, refetch } = useCommandHistory(companyId, MAX_ROWS);

  if (!companyId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a company to view commands.
      </div>
    );
  }

  const rows = sortByNewestFirst(data ?? []).slice(0, MAX_ROWS);

  return (
    <div className="flex h-full flex-col p-4" data-testid="commands-view">
      <Faceplate
        kicker="RECENT COMMANDS"
        serial={rows.length > 0 ? `${rows.length} SHOWN` : 'CMD+K'}
        className="flex flex-1 flex-col"
        bodyClassName="flex flex-1 flex-col p-0"
      >
        <ScrollArea className="h-full">
          {isLoading ? (
            <div data-testid="commands-loading" aria-busy="true">
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                // Indexes are the only available stable key here —
                // skeletons have no domain-meaningful id.
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : isError ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => {
                void refetch();
              }}
            />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div data-testid="commands-list">
              {rows.map((entry) => (
                <CommandRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </ScrollArea>
      </Faceplate>
    </div>
  );
}
