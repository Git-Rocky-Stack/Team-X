import { useEffect, useMemo, useState } from 'react';

import type { Thread } from '@team-x/shared-types';
import { BrainCircuit, Clock3, MessageSquareText, RefreshCw, ShieldCheck, Waypoints } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { useThreadList } from '@/hooks/use-chat.js';
import { usePackedThreadContext, useRunCheckpoints, useThreadDigest } from '@/hooks/use-memory.js';
import { useAppStore } from '@/store/app-store.js';

import { isAgentThread as checkAgentThread, isCopilotThread as checkCopilotThread } from '../chat/thread-list.js';
import {
  checkpointLabel,
  checkpointTone,
  formatMemoryTimestamp,
  freshnessTone,
} from '../memory/memory-formatters.js';
import {
  MissionControlRow,
  MissionInsetSurface,
  MissionMetricTile,
  MissionPill,
  MissionSegmentedButton,
  MissionStateBlock,
} from '../mission/mission-shell.js';

const TOKEN_BUDGETS = [2048, 4096, 8192] as const;
const RECENT_TURN_LIMIT = 12;

function threadLabel(thread: Thread): string {
  if (thread.subject?.trim()) return thread.subject.trim();
  if (thread.kind === 'ticket') return `Ticket thread ${thread.id.slice(0, 8)}`;
  if (thread.isSystemAgent) return 'Copilot thread';
  return `${thread.kind.toUpperCase()} thread ${thread.id.slice(0, 8)}`;
}

export function MemoryPanel({ companyId }: { companyId: string }) {
  const [targetTokenBudget, setTargetTokenBudget] =
    useState<(typeof TOKEN_BUDGETS)[number]>(TOKEN_BUDGETS[1]);

  const threadsQuery = useThreadList(companyId);
  const threads = threadsQuery.data ?? [];
  const selectedThreadId = useAppStore((state) => state.autonomyMemoryThreadId);
  const setSelectedThreadId = useAppStore((state) => state.setAutonomyMemoryThreadId);
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0]?.id ?? null);
    }
  }, [selectedThreadId, threads]);

  const digestQuery = useThreadDigest(companyId, selectedThreadId);
  const checkpointsQuery = useRunCheckpoints(companyId, selectedThreadId, 6);
  const packedContextQuery = usePackedThreadContext(companyId, selectedThreadId, {
    targetTokenBudget,
    recentTurnLimit: RECENT_TURN_LIMIT,
  });

  const setActiveView = useAppStore((state) => state.setActiveView);
  const openThread = useAppStore((state) => state.openThread);

  const checkpoints = checkpointsQuery.data ?? [];
  const digest = digestQuery.data;
  const packedContext = packedContextQuery.data;
  const latestCheckpoint = checkpoints[0] ?? null;

  function refreshMemory() {
    void Promise.all([
      digestQuery.refetch(),
      checkpointsQuery.refetch(),
      packedContextQuery.refetch(),
    ]);
  }

  function openChatThread() {
    if (!selectedThread) return;
    const primaryEmployeeId =
      selectedThread.members.find((member) => member.memberKind === 'employee')?.memberId ?? null;
    setActiveView('chat');
    openThread({
      threadId: selectedThread.id,
      isAgentThread: checkAgentThread(selectedThread),
      isCopilotThread: checkCopilotThread(selectedThread),
      employeeId: primaryEmployeeId,
    });
  }

  if (threadsQuery.isLoading) {
    return (
      <MissionStateBlock
        title="Loading memory coverage"
        description="Team-X is resolving workspace threads before it can show digests, checkpoints, and packed context posture."
        icon={BrainCircuit}
      />
    );
  }

  if (threadsQuery.isError) {
    return (
      <MissionStateBlock
        title="Memory surface could not load threads"
        description="Retry the autonomy memory read after the thread list is available again."
        icon={BrainCircuit}
        tone="danger"
      />
    );
  }

  if (threads.length === 0 || !selectedThreadId || !selectedThread) {
    return (
      <MissionStateBlock
        title="No threads exist for memory inspection yet"
        description="Run a conversation, routine, or autonomous pass first so Team-X can condense that work into a digest and checkpoint trail."
        icon={BrainCircuit}
      />
    );
  }

  return (
    <div className="space-y-4" data-memory-panel="">
      <MissionInsetSurface className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Thread Memory</span>
              <MissionPill tone="accent">{selectedThread.kind}</MissionPill>
              {selectedThread.isSystemAgent ? <MissionPill>system agent</MissionPill> : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Inspect the latest digest, resumable checkpoints, and packed-context composition for one live thread at a time.
            </p>
          </div>
          <MissionControlRow density="compact" className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 bg-black/10 hover:bg-black/20"
              onClick={refreshMemory}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh memory
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/10 bg-black/10 hover:bg-black/20"
              onClick={openChatThread}
            >
              Open chat
            </Button>
          </MissionControlRow>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Focus thread
            </span>
            <select
              value={selectedThreadId}
              onChange={(event) => setSelectedThreadId(event.target.value)}
              className="w-full rounded-[16px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              data-memory-thread-select=""
            >
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {threadLabel(thread)}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Pack budget
            </span>
            <MissionControlRow className="gap-2">
              {TOKEN_BUDGETS.map((budget) => (
                <MissionSegmentedButton
                  key={budget}
                  active={targetTokenBudget === budget}
                  onClick={() => setTargetTokenBudget(budget)}
                >
                  {budget.toLocaleString()}
                </MissionSegmentedButton>
              ))}
            </MissionControlRow>
          </div>
        </div>
      </MissionInsetSurface>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MissionMetricTile
          label="Digest freshness"
          value={digestQuery.isLoading ? '...' : digest?.freshness ?? 'none'}
          hint={digest ? `${digest.estimatedTokens} est. tokens` : 'No digest captured yet'}
          icon={BrainCircuit}
        />
        <MissionMetricTile
          label="Checkpoints"
          value={checkpointsQuery.isLoading ? '...' : String(checkpoints.length)}
          hint={latestCheckpoint ? checkpointLabel(latestCheckpoint.checkpointKind) : 'No resumable state yet'}
          icon={ShieldCheck}
        />
        <MissionMetricTile
          label="Pack usage"
          value={packedContextQuery.isLoading ? '...' : `${packedContext?.usedTokens ?? 0}/${targetTokenBudget}`}
          hint="Used tokens vs target budget"
          icon={Waypoints}
        />
        <MissionMetricTile
          label="Dropped blocks"
          value={packedContextQuery.isLoading ? '...' : String(packedContext?.droppedBlocks.length ?? 0)}
          hint="Blocks omitted by packer"
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          <MissionInsetSurface className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-foreground">Latest Digest</div>
                <div className="text-xs text-muted-foreground">
                  Updated {formatMemoryTimestamp(digest?.updatedAt ?? null)}
                </div>
              </div>
              <MissionPill tone={freshnessTone(digest?.freshness)}>{digest?.freshness ?? 'none'}</MissionPill>
            </div>

            {digestQuery.isLoading ? (
              <MissionStateBlock
                title="Digest is loading"
                description="Team-X is reading the latest durable summary for this thread."
                icon={BrainCircuit}
              />
            ) : digestQuery.isError ? (
              <MissionStateBlock
                title="Digest could not load"
                description="Retry the digest read to restore this thread summary."
                icon={BrainCircuit}
                tone="danger"
              />
            ) : digest ? (
              <div className="space-y-4">
                <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-foreground/90">
                  {digest.summary}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {digest.pinnedFacts.length > 0 ? (
                    digest.pinnedFacts.map((fact) => (
                      <MissionPill key={fact.id}>{fact.fact}</MissionPill>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No pinned facts were captured for this digest yet.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <MissionStateBlock
                title="No digest has been condensed yet"
                description="A digest is written after successful internal runs. Use the thread, then refresh this panel."
                icon={BrainCircuit}
              />
            )}
          </MissionInsetSurface>

          <MissionInsetSurface className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-foreground">Packed Context</div>
                <div className="text-xs text-muted-foreground">
                  Budget {targetTokenBudget.toLocaleString()} with {RECENT_TURN_LIMIT} recent turns
                </div>
              </div>
              <MissionPill tone="accent">
                {packedContext?.includedBlocks.length ?? 0} included blocks
              </MissionPill>
            </div>

            {packedContextQuery.isLoading ? (
              <MissionStateBlock
                title="Packed context is loading"
                description="Team-X is assembling a bounded context pack for this thread."
                icon={Waypoints}
              />
            ) : packedContextQuery.isError ? (
              <MissionStateBlock
                title="Packed context could not load"
                description="Retry the pack read to inspect current token allocation and dropped blocks."
                icon={Waypoints}
                tone="danger"
              />
            ) : packedContext ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <MissionMetricTile
                    label="Recent turns"
                    value={String(packedContext.recentTurnTokens)}
                    hint={`${packedContext.packedTurns.length} packed turns`}
                    icon={MessageSquareText}
                  />
                  <MissionMetricTile
                    label="Blocks"
                    value={String(packedContext.blockTokens)}
                    hint={`${packedContext.includedBlocks.length} included`}
                    icon={ShieldCheck}
                  />
                  <MissionMetricTile
                    label="Retrieval"
                    value={String(packedContext.retrievalTokens)}
                    hint={`${packedContext.retrievalQueries.length} queries`}
                    icon={Clock3}
                  />
                </div>

                <div className="rounded-[18px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-foreground/90">
                  {packedContext.systemAddendum.trim().length > 0
                    ? packedContext.systemAddendum
                    : 'No system addendum was needed for this pack.'}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {packedContext.includedBlocks.map((block) => (
                    <MissionPill key={block.id}>{block.kind}</MissionPill>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Dropped blocks
                  </div>
                  {packedContext.droppedBlocks.length > 0 ? (
                    packedContext.droppedBlocks.slice(0, 6).map((drop) => (
                      <div
                        key={`${drop.blockId}-${drop.reason}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-white/8 bg-black/15 px-3 py-2 text-xs text-muted-foreground"
                        data-memory-dropped-block={drop.blockId}
                      >
                        <span className="font-semibold uppercase tracking-[0.14em] text-foreground/80">
                          {drop.kind}
                        </span>
                        <span>{drop.reason}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Nothing was dropped at this target budget.
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </MissionInsetSurface>
        </div>

        <MissionInsetSurface className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Run Checkpoints</div>
              <div className="text-xs text-muted-foreground">
                Newest first, with resumable blockers and next actions
              </div>
            </div>
            {latestCheckpoint ? (
              <MissionPill tone={checkpointTone(latestCheckpoint.checkpointKind)}>
                {checkpointLabel(latestCheckpoint.checkpointKind)}
              </MissionPill>
            ) : null}
          </div>

          {checkpointsQuery.isLoading ? (
            <MissionStateBlock
              title="Checkpoint history is loading"
              description="Team-X is reading the latest resumable state for this thread."
              icon={ShieldCheck}
            />
          ) : checkpointsQuery.isError ? (
            <MissionStateBlock
              title="Checkpoint history could not load"
              description="Retry the checkpoint read to restore interruption and completion coverage."
              icon={ShieldCheck}
              tone="danger"
            />
          ) : checkpoints.length === 0 ? (
            <MissionStateBlock
              title="No checkpoints exist for this thread yet"
              description="Completion, stop, timeout, and blocked-state checkpoints will appear here after the next internal run."
              icon={ShieldCheck}
            />
          ) : (
            <div className="space-y-3">
              {checkpoints.map((checkpoint) => (
                <div
                  key={checkpoint.id}
                  className="space-y-3 rounded-[18px] border border-white/8 bg-black/20 p-4"
                  data-memory-checkpoint={checkpoint.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <MissionPill tone={checkpointTone(checkpoint.checkpointKind)}>
                        {checkpointLabel(checkpoint.checkpointKind)}
                      </MissionPill>
                      {checkpoint.unresolvedApprovalRefs.length > 0 ? (
                        <MissionPill tone="warning">
                          {checkpoint.unresolvedApprovalRefs.length} approval refs
                        </MissionPill>
                      ) : null}
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {formatMemoryTimestamp(checkpoint.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm leading-6 text-foreground/90">{checkpoint.progressSummary}</div>
                  {checkpoint.blockers.length > 0 ? (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {checkpoint.blockers.map((blocker, index) => (
                        <div key={`${checkpoint.id}-${blocker.kind}-${index}`} className="rounded-[14px] border border-white/8 bg-black/15 px-3 py-2">
                          <span className="font-semibold uppercase tracking-[0.14em] text-foreground/80">
                            {blocker.kind}
                          </span>
                          <div className="mt-1">{blocker.summary}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {checkpoint.nextAction ? (
                    <div className="text-xs leading-5 text-muted-foreground">
                      <span className="font-semibold uppercase tracking-[0.14em] text-foreground/80">
                        Next:
                      </span>{' '}
                      {checkpoint.nextAction}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </MissionInsetSurface>
      </div>
    </div>
  );
}
