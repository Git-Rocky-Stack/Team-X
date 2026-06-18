import { MEMORY_TARGET_TOKEN_BUDGET_OPTIONS, type Thread } from '@team-x/shared-types';
import {
  BrainCircuit,
  Clock3,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  isAgentThread as checkAgentThread,
  isCopilotThread as checkCopilotThread,
} from '../chat/thread-list.js';
import {
  checkpointLabel,
  checkpointTone,
  formatMemoryTimestamp,
  freshnessTone,
  resumeOriginHint,
  resumeOriginLabel,
} from '../memory/memory-formatters.js';

import {
  LampTile,
  type LampTone,
  MetricTile,
  RecessedWell,
  SubviewState,
  Tag,
  VuMeter,
} from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useThreadList } from '@/hooks/use-chat.js';
import { usePackedThreadContext, useRunCheckpoints, useThreadDigest } from '@/hooks/use-memory.js';
import { useMemorySettings } from '@/hooks/use-settings.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

const TOKEN_BUDGETS = MEMORY_TARGET_TOKEN_BUDGET_OPTIONS;

/**
 * Bridge the legacy memory-formatters tone vocabulary (`accent`/`warning`/
 * `danger`) onto the console LampTone scale without editing the shared
 * formatters (still consumed by `features/memory`): accent = positive (go),
 * warning = caution (steady hold), danger = terminal fault (nogo).
 */
function toLampTone(tone: 'default' | 'accent' | 'warning' | 'danger'): LampTone {
  if (tone === 'danger') return 'nogo';
  if (tone === 'warning') return 'hold';
  if (tone === 'accent') return 'go';
  return 'off';
}

function threadLabel(thread: Thread): string {
  if (thread.subject?.trim()) return thread.subject.trim();
  if (thread.kind === 'ticket') return `Ticket thread ${thread.id.slice(0, 8)}`;
  if (thread.isSystemAgent) return 'Copilot thread';
  return `${thread.kind.toUpperCase()} thread ${thread.id.slice(0, 8)}`;
}

export function MemoryPanel({ companyId }: { companyId: string }) {
  const [targetTokenBudget, setTargetTokenBudget] = useState<(typeof TOKEN_BUDGETS)[number] | null>(
    null,
  );

  const threadsQuery = useThreadList(companyId);
  const memorySettingsQuery = useMemorySettings();
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data]);
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
  }, [selectedThreadId, setSelectedThreadId, threads]);

  useEffect(() => {
    if (!memorySettingsQuery.data || targetTokenBudget !== null) return;
    setTargetTokenBudget(memorySettingsQuery.data.defaultTargetTokenBudget);
  }, [memorySettingsQuery.data, targetTokenBudget]);

  const effectiveTargetTokenBudget = targetTokenBudget ?? TOKEN_BUDGETS[1];
  const recentTurnLimit = memorySettingsQuery.data?.recentTurnLimit ?? 12;
  const checkpointHistoryLimit = memorySettingsQuery.data?.checkpointHistoryLimit ?? 6;

  const digestQuery = useThreadDigest(companyId, selectedThreadId);
  const checkpointsQuery = useRunCheckpoints(companyId, selectedThreadId, checkpointHistoryLimit);
  const packedContextQuery = usePackedThreadContext(companyId, selectedThreadId, {
    targetTokenBudget: effectiveTargetTokenBudget,
    recentTurnLimit,
  });

  const setActiveView = useAppStore((state) => state.setActiveView);
  const openThread = useAppStore((state) => state.openThread);

  const checkpoints = checkpointsQuery.data ?? [];
  const digest = digestQuery.data;
  const packedContext = packedContextQuery.data;
  const latestCheckpoint = checkpoints[0] ?? null;
  const packedResumeLabel = resumeOriginLabel(packedContext?.resumeOrigin ?? null);
  const packedResumeHint = resumeOriginHint(packedContext?.resumeOrigin ?? null);

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
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="Loading memory coverage"
        description="Team-X is resolving workspace threads before it can show digests, checkpoints, and packed context posture."
      />
    );
  }

  if (threadsQuery.isError) {
    return (
      <SubviewState
        lampLabel="NO-GO"
        lampTone="nogo"
        title="Memory surface could not load threads"
        description="Retry the autonomy memory read after the thread list is available again."
      />
    );
  }

  if (threads.length === 0 || !selectedThreadId || !selectedThread) {
    return (
      <SubviewState
        lampLabel="STBY"
        lampTone="off"
        title="No threads exist for memory inspection yet"
        description="Run a conversation, routine, or autonomous pass first so Team-X can condense that work into a digest and checkpoint trail."
      />
    );
  }

  return (
    <div className="space-y-4" data-memory-panel="">
      <RecessedWell className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h2 text-foreground">Thread Memory</h2>
              <Tag>{selectedThread.kind}</Tag>
              {selectedThread.isSystemAgent ? <Tag>system agent</Tag> : null}
            </div>
            <p className="text-caption text-muted-foreground">
              Inspect the latest digest, resumable checkpoints, and packed-context composition for
              one live thread at a time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshMemory}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh memory
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={openChatThread}>
              Open chat
            </Button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <label className="space-y-2">
            <span className="text-eyebrow text-muted-foreground">Focus thread</span>
            <select
              value={selectedThreadId}
              onChange={(event) => setSelectedThreadId(event.target.value)}
              className="well-input w-full px-4 py-3 text-body outline-none"
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
            <span className="text-eyebrow text-muted-foreground">Pack budget</span>
            <div className="flex flex-wrap items-center gap-2">
              {TOKEN_BUDGETS.map((budget) => (
                <button
                  type="button"
                  key={budget}
                  onClick={() => setTargetTokenBudget(budget)}
                  className={cn(
                    'cap px-3 py-1.5 text-button-sm',
                    effectiveTargetTokenBudget === budget && 'cap-select',
                  )}
                >
                  {budget.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </RecessedWell>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Digest freshness"
          value={digestQuery.isLoading ? '...' : (digest?.freshness ?? 'none')}
          hint={digest ? `${digest.estimatedTokens} est. tokens` : 'No digest captured yet'}
          icon={BrainCircuit}
        />
        <MetricTile
          label="Checkpoints"
          value={checkpointsQuery.isLoading ? '...' : String(checkpoints.length)}
          hint={
            latestCheckpoint
              ? checkpointLabel(latestCheckpoint.checkpointKind)
              : 'No resumable state yet'
          }
          icon={ShieldCheck}
        />
        <MetricTile
          label="Pack usage"
          value={
            packedContextQuery.isLoading
              ? '...'
              : `${packedContext?.usedTokens ?? 0}/${effectiveTargetTokenBudget}`
          }
          hint="Used tokens vs target budget"
          icon={Waypoints}
        />
        <MetricTile
          label="Dropped blocks"
          value={
            packedContextQuery.isLoading ? '...' : String(packedContext?.droppedBlocks.length ?? 0)
          }
          hint="Blocks omitted by packer"
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          <RecessedWell className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-h3 text-foreground">Latest Digest</h3>
                <div className="text-caption text-muted-foreground">
                  Updated {formatMemoryTimestamp(digest?.updatedAt ?? null)}
                </div>
              </div>
              <LampTile
                label={digest?.freshness ?? 'none'}
                tone={toLampTone(freshnessTone(digest?.freshness))}
                small
                interactive={false}
              />
            </div>

            {digestQuery.isLoading ? (
              <SubviewState
                lampLabel="STBY"
                lampTone="off"
                title="Digest is loading"
                description="Team-X is reading the latest durable summary for this thread."
              />
            ) : digestQuery.isError ? (
              <SubviewState
                lampLabel="NO-GO"
                lampTone="nogo"
                title="Digest could not load"
                description="Retry the digest read to restore this thread summary."
              />
            ) : digest ? (
              <div className="space-y-4">
                <RecessedWell className="p-4 text-body text-foreground/90">
                  {digest.summary}
                </RecessedWell>
                <div className="flex flex-wrap items-center gap-2">
                  {digest.pinnedFacts.length > 0 ? (
                    digest.pinnedFacts.map((fact) => <Tag key={fact.id}>{fact.fact}</Tag>)
                  ) : (
                    <span className="text-caption text-muted-foreground">
                      No pinned facts were captured for this digest yet.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <SubviewState
                lampLabel="STBY"
                lampTone="off"
                title="No digest has been condensed yet"
                description="A digest is written after successful internal runs. Use the thread, then refresh this panel."
              />
            )}
          </RecessedWell>

          <RecessedWell className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-h3 text-foreground">Packed Context</h3>
                <div className="text-caption text-muted-foreground">
                  Budget {effectiveTargetTokenBudget.toLocaleString()} with {recentTurnLimit} recent
                  turns
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <VuMeter
                  className="w-40"
                  value={
                    packedContext && effectiveTargetTokenBudget > 0
                      ? Math.min(1, packedContext.usedTokens / effectiveTargetTokenBudget)
                      : 0
                  }
                  label="Pack budget usage"
                />
                <LampTile
                  label={`${packedContext?.includedBlocks.length ?? 0} included blocks`}
                  tone="go"
                  small
                  interactive={false}
                />
              </div>
            </div>

            {packedContextQuery.isLoading ? (
              <SubviewState
                lampLabel="STBY"
                lampTone="off"
                title="Packed context is loading"
                description="Team-X is assembling a bounded context pack for this thread."
              />
            ) : packedContextQuery.isError ? (
              <SubviewState
                lampLabel="NO-GO"
                lampTone="nogo"
                title="Packed context could not load"
                description="Retry the pack read to inspect current token allocation and dropped blocks."
              />
            ) : packedContext ? (
              <div className="space-y-4">
                {packedResumeHint ? (
                  <RecessedWell className="px-4 py-2.5 text-eyebrow text-muted-foreground">
                    {packedResumeHint}
                  </RecessedWell>
                ) : null}
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricTile
                    label="Recent turns"
                    value={String(packedContext.recentTurnTokens)}
                    hint={`${packedContext.packedTurns.length} packed turns`}
                    icon={MessageSquareText}
                  />
                  <MetricTile
                    label="Blocks"
                    value={String(packedContext.blockTokens)}
                    hint={packedResumeLabel ?? `${packedContext.includedBlocks.length} included`}
                    icon={ShieldCheck}
                  />
                  <MetricTile
                    label="Retrieval"
                    value={String(packedContext.retrievalTokens)}
                    hint={`${packedContext.retrievalQueries.length} queries`}
                    icon={Clock3}
                  />
                </div>

                <RecessedWell className="p-4 text-body text-foreground/90">
                  {packedContext.systemAddendum.trim().length > 0
                    ? packedContext.systemAddendum
                    : 'No system addendum was needed for this pack.'}
                </RecessedWell>

                <div className="flex flex-wrap items-center gap-2">
                  {packedContext.includedBlocks.map((block) => (
                    <Tag key={block.id}>{block.kind}</Tag>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-eyebrow text-muted-foreground">Dropped blocks</div>
                  {packedContext.droppedBlocks.length > 0 ? (
                    packedContext.droppedBlocks.slice(0, 6).map((drop) => (
                      <div
                        key={`${drop.blockId}-${drop.reason}`}
                        className="cap flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-caption text-muted-foreground"
                        data-memory-dropped-block={drop.blockId}
                      >
                        <span className="text-eyebrow text-foreground/80">{drop.kind}</span>
                        <span>{drop.reason}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-caption text-muted-foreground">
                      Nothing was dropped at this target budget.
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </RecessedWell>
        </div>

        <RecessedWell className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-h3 text-foreground">Run Checkpoints</h3>
              <div className="text-caption text-muted-foreground">
                Newest first, with resumable blockers and next actions ({checkpointHistoryLimit}{' '}
                visible)
              </div>
            </div>
            {latestCheckpoint ? (
              <LampTile
                label={checkpointLabel(latestCheckpoint.checkpointKind)}
                tone={toLampTone(checkpointTone(latestCheckpoint.checkpointKind))}
                small
                interactive={false}
              />
            ) : null}
          </div>

          {checkpointsQuery.isLoading ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="Checkpoint history is loading"
              description="Team-X is reading the latest resumable state for this thread."
            />
          ) : checkpointsQuery.isError ? (
            <SubviewState
              lampLabel="NO-GO"
              lampTone="nogo"
              title="Checkpoint history could not load"
              description="Retry the checkpoint read to restore interruption and completion coverage."
            />
          ) : checkpoints.length === 0 ? (
            <SubviewState
              lampLabel="STBY"
              lampTone="off"
              title="No checkpoints exist for this thread yet"
              description="Completion, stop, timeout, and blocked-state checkpoints will appear here after the next internal run."
            />
          ) : (
            <div className="space-y-3">
              {checkpoints.map((checkpoint) => (
                <RecessedWell
                  key={checkpoint.id}
                  className="space-y-3 p-4"
                  data-memory-checkpoint={checkpoint.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <LampTile
                        label={checkpointLabel(checkpoint.checkpointKind)}
                        tone={toLampTone(checkpointTone(checkpoint.checkpointKind))}
                        small
                        interactive={false}
                      />
                      {checkpoint.resumeOrigin ? (
                        <Tag>{resumeOriginLabel(checkpoint.resumeOrigin)}</Tag>
                      ) : null}
                      {checkpoint.unresolvedApprovalRefs.length > 0 ? (
                        <LampTile
                          label={`${checkpoint.unresolvedApprovalRefs.length} approval refs`}
                          tone="hold"
                          small
                          interactive={false}
                        />
                      ) : null}
                    </div>
                    <span className="text-eyebrow text-muted-foreground">
                      {formatMemoryTimestamp(checkpoint.createdAt)}
                    </span>
                  </div>
                  <div className="text-body text-foreground/90">{checkpoint.progressSummary}</div>
                  {checkpoint.resumeOrigin ? (
                    <div className="text-eyebrow text-muted-foreground">
                      {resumeOriginHint(checkpoint.resumeOrigin)}
                    </div>
                  ) : null}
                  {checkpoint.blockers.length > 0 ? (
                    <div className="space-y-2 text-caption text-muted-foreground">
                      {checkpoint.blockers.map((blocker, index) => (
                        <RecessedWell
                          key={`${checkpoint.id}-${blocker.kind}-${index}`}
                          className="px-3 py-2"
                        >
                          <span className="text-eyebrow text-foreground/80">{blocker.kind}</span>
                          <div className="mt-1">{blocker.summary}</div>
                        </RecessedWell>
                      ))}
                    </div>
                  ) : null}
                  {checkpoint.nextAction ? (
                    <div className="text-caption text-muted-foreground">
                      <span className="text-eyebrow text-foreground/80">Next:</span>{' '}
                      {checkpoint.nextAction}
                    </div>
                  ) : null}
                </RecessedWell>
              ))}
            </div>
          )}
        </RecessedWell>
      </div>
    </div>
  );
}
