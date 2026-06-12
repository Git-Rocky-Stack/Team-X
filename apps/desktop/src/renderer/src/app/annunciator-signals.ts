import type { AnnunciatorTileSpec } from '@/components/console';
import type { ActiveView } from '@/store/app-store';

/**
 * Pure derivation layer for the AnnunciatorRail (mounted in T13). Maps five
 * REAL signals onto lamp tiles per DESIGN.md lamp discipline — no decorative
 * lamps, every lit tile means something live.
 *
 * Alert fingerprinting: a tile re-blinks when its alert INSTANCE changes
 * (budget crosses 100% in a new period; a NEW approval arrives). The
 * fingerprint encodes that instance, and `acknowledged` is true only when the
 * stored ack matches the CURRENT fingerprint — so a resolved-then-recurring
 * warning blinks again instead of silently staying acked.
 */

/** Tile spec + the fingerprint that identifies the CURRENT alert instance. */
export type AnnunciatorTile = AnnunciatorTileSpec & { fingerprint?: string };

export interface AnnunciatorInputs {
  /** board-queue unread count */
  queueUnread: number;
  /** runtime posture from useRuntimeOperations */
  runtime: { stateTone: 'default' | 'accent' | 'warning' | 'danger'; sessionCount: number };
  /** budget posture from useBudgetOverview */
  budget: { configured: boolean; usedPct: number; periodKey: string };
  /** pending approvals count */
  approvalsPending: number;
  /** id of the newest pending approval — drives the re-blink fingerprint */
  approvalsNewestId: string | null;
  /** active meeting count from useMeetings */
  meetingsActive: number;
  /** tile id → acked fingerprint (from the app-store ack slice) */
  acked: Record<string, string>;
}

export function deriveAnnunciatorTiles(inputs: AnnunciatorInputs): AnnunciatorTile[] {
  const ackState = (id: string, fingerprint: string) => ({
    fingerprint,
    alert: true,
    acknowledged: inputs.acked[id] === fingerprint,
  });

  const que: AnnunciatorTile = {
    id: 'que',
    label: 'QUE',
    tone: inputs.queueUnread > 0 ? 'hold' : 'off',
  };

  const r = inputs.runtime;
  const gguf: AnnunciatorTile =
    r.stateTone === 'danger'
      ? { id: 'gguf', label: 'GGUF', tone: 'warn', ...ackState('gguf', `gguf:${r.stateTone}`) }
      : {
          id: 'gguf',
          label: 'GGUF',
          tone:
            r.stateTone === 'warning'
              ? 'hold'
              : r.stateTone === 'accent'
                ? 'exec'
                : r.sessionCount > 0
                  ? 'go'
                  : 'off',
        };

  const b = inputs.budget;
  const budg: AnnunciatorTile = !b.configured
    ? { id: 'budg', label: 'BUDG', tone: 'off' }
    : b.usedPct >= 100
      ? { id: 'budg', label: 'BUDG', tone: 'warn', ...ackState('budg', `budg:${b.periodKey}:over`) }
      : { id: 'budg', label: 'BUDG', tone: b.usedPct >= 80 ? 'hold' : 'go' };

  const appr: AnnunciatorTile =
    inputs.approvalsPending > 0
      ? {
          id: 'appr',
          label: 'APPR',
          tone: 'hold',
          ...ackState('appr', `appr:${inputs.approvalsNewestId ?? inputs.approvalsPending}`),
        }
      : { id: 'appr', label: 'APPR', tone: 'off' };

  const mtg: AnnunciatorTile = {
    id: 'mtg',
    label: 'MTG',
    tone: inputs.meetingsActive > 0 ? 'exec' : 'off',
  };

  return [que, gguf, budg, appr, mtg];
}

/**
 * Teleport map: tile id → top-level app view. Values are verified members of
 * the app-store `ActiveView` union (GGUF/BUDG/APPR all live under the
 * Autonomy view's subviews; QUE opens the board queue under Tickets).
 */
export const ANNUNCIATOR_TELEPORT: Record<string, ActiveView> = {
  que: 'tickets',
  gguf: 'autonomy',
  budg: 'autonomy',
  appr: 'autonomy',
  mtg: 'meetings',
};
