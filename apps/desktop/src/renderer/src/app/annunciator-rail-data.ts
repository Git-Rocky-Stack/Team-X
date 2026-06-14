import { useEffect, useMemo, useState } from 'react';

import type { AnnunciatorInputs } from './annunciator-signals.js';
import {
  BOARD_QUEUE_READ_STATE_EVENT,
  type BoardQueueReadStateEventDetail,
} from './board-queue-read-state-events.js';
import {
  type BoardQueueReadState,
  QUEUE_STORAGE_PREFIX,
  isItemUnread,
  makeBoardUnreadItems,
  readQueueState,
} from './board-queue-unread.js';

import { summarizeRuntimeOperationsForDashboard } from '@/features/dashboard/runtime-operations-projections.js';
import { useApprovals } from '@/hooks/use-approvals.js';
import { useBoardQueueEventSync } from '@/hooks/use-board-queue-events.js';
import { useBudgetOverview } from '@/hooks/use-budgets.js';
import { useThreadList } from '@/hooks/use-chat.js';
import { useMeetings } from '@/hooks/use-meetings.js';
import { useRuntimeOperations } from '@/hooks/use-runtime-operations.js';
import { useTickets } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Live hook seam for the AnnunciatorRail. Composes the SAME signals their
 * owning surfaces read — board-queue unread (BoardMessageQueue), runtime
 * posture (useRuntimeOperations), budget overview (useBudgetOverview),
 * pending approvals (useApprovals), and active meetings (useMeetings) — into
 * the pure `AnnunciatorInputs` that `deriveAnnunciatorTiles` consumes.
 *
 * Loading / no-company states resolve to CALM defaults (0 counts, runtime
 * `default`, budget not configured) so the rail renders truthfully while
 * data is in flight — a lamp never blinks on missing data, only on a real
 * signal.
 *
 * This file is the module the mount test mocks; it owns ALL the React-Query /
 * store coupling so `annunciator-rail-mount.tsx` stays a pure wiring shell.
 */

function useBoardQueueUnread(companyId: string | null): number {
  const { data: threads = [] } = useThreadList(companyId);
  const { data: tickets = [] } = useTickets(companyId);
  // Employees feed BoardMessageQueue's display titles only — the unread
  // COUNT never depends on them, so they're intentionally not read here.
  const [readState, setReadState] = useState<BoardQueueReadState>(() => readQueueState(companyId));

  // Keep the board-queue React Query caches fresh. Shared with the
  // BoardMessageQueue panel via the one subscription definition; React Query
  // dedupes the refetches when both surfaces are mounted.
  useBoardQueueEventSync(companyId);

  useEffect(() => {
    setReadState(readQueueState(companyId));
  }, [companyId]);

  // The board-queue read marker also lives in localStorage and is mutated by
  // BoardMessageQueue. Two listeners keep the lamp honest:
  // - 'storage' covers OTHER windows/documents only — per the HTML spec it
  //   never fires in the document that called localStorage.setItem.
  // - The same-window path is the custom event below, dispatched by
  //   notifyBoardQueueReadStateChanged after BoardMessageQueue writes, so the
  //   lamp settles when the user marks items checked in the open panel.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(QUEUE_STORAGE_PREFIX)) {
        setReadState(readQueueState(companyId));
      }
    }
    function onReadStateChanged(event: Event) {
      if (companyId === null) return;
      const detail = (event as CustomEvent<BoardQueueReadStateEventDetail>).detail;
      if (detail?.companyId === companyId) {
        setReadState(readQueueState(companyId));
      }
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(BOARD_QUEUE_READ_STATE_EVENT, onReadStateChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(BOARD_QUEUE_READ_STATE_EVENT, onReadStateChanged);
    };
  }, [companyId]);

  return useMemo(() => {
    const items = makeBoardUnreadItems(threads, tickets);
    return items.filter((item) => isItemUnread(item, readState)).length;
  }, [threads, tickets, readState]);
}

// ── Budget posture ──────────────────────────────────────────────────────────
// The annunciator only needs threshold posture, not dollar figures. The
// overview's server-computed alert counts are authoritative: `exceededCount`
// means a policy crossed 100% (warn+alert), `warningCount` means ≥ warning
// threshold (hold). `usedPct` is mapped to the band the signals layer keys on.

function budgetPeriodKey(period: string, periodStartAt: number): string {
  return `${period}:${periodStartAt}`;
}

// ── Approvals posture ────────────────────────────────────────────────────────
// Mirror ApprovalsPanel: fetch all approvals for the company and count the
// `pending` ones client-side. Newest pending (by createdAt) fingerprints the
// alert so a NEW approval re-blinks after an earlier ack.

function newestPendingApprovalId(
  approvals: { id: string; status: string; createdAt: number }[],
): string | null {
  let newest: { id: string; createdAt: number } | null = null;
  for (const item of approvals) {
    if (item.status !== 'pending') continue;
    if (newest === null || item.createdAt > newest.createdAt) {
      newest = { id: item.id, createdAt: item.createdAt };
    }
  }
  return newest?.id ?? null;
}

export interface AnnunciatorData {
  inputs: AnnunciatorInputs;
  setActiveView: ReturnType<typeof useAppStore.getState>['setActiveView'];
  ackAnnunciator: ReturnType<typeof useAppStore.getState>['ackAnnunciator'];
}

/**
 * Composes the live renderer signals into `AnnunciatorInputs` plus the two
 * store handlers the rail mount needs. Every branch resolves to a calm
 * default while data is loading or no company is selected.
 */
export function useAnnunciatorData(): AnnunciatorData {
  const companyId = useAppStore((state) => state.companyId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const ackAnnunciator = useAppStore((state) => state.ackAnnunciator);
  const acked = useAppStore((state) => state.ackedAnnunciators);

  const queueUnread = useBoardQueueUnread(companyId);

  const { data: runtimeSnapshot } = useRuntimeOperations(companyId);
  const runtimeSummary = useMemo(
    () => summarizeRuntimeOperationsForDashboard(runtimeSnapshot),
    [runtimeSnapshot],
  );

  const { data: budgetOverview } = useBudgetOverview(companyId);
  const { data: approvals = [] } = useApprovals(companyId);
  const { data: meetings = [] } = useMeetings(companyId);

  const inputs = useMemo<AnnunciatorInputs>(() => {
    const configured = (budgetOverview?.activePolicyCount ?? 0) > 0;
    // Worst-case band from the overview's authoritative alert counts.
    const usedPct =
      (budgetOverview?.exceededCount ?? 0) > 0
        ? 100
        : (budgetOverview?.warningCount ?? 0) > 0
          ? 80
          : 0;
    const periodKey = budgetOverview
      ? budgetPeriodKey(budgetOverview.period, budgetOverview.periodStartAt)
      : '';

    const pendingApprovals = approvals.filter((item) => item.status === 'pending');

    return {
      queueUnread,
      runtime: {
        stateTone: runtimeSummary.stateTone,
        sessionCount: runtimeSummary.sessionCount,
      },
      budget: { configured, usedPct, periodKey },
      approvalsPending: pendingApprovals.length,
      approvalsNewestId: newestPendingApprovalId(approvals),
      meetingsActive: meetings.filter((meeting) => meeting.status === 'active').length,
      acked,
    };
  }, [queueUnread, runtimeSummary, budgetOverview, approvals, meetings, acked]);

  return { inputs, setActiveView, ackAnnunciator };
}
