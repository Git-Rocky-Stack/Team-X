/**
 * Board-queue read-state change events — same-window broadcast seam.
 *
 * Per the HTML spec, `storage` events fire only in OTHER documents that share
 * the storage area — never in the document that called `localStorage.setItem`.
 * Team-X is a single-window Electron app, so a `storage` listener alone can
 * never observe BoardMessageQueue marking items checked. The writer must
 * broadcast read-state changes explicitly for same-window subscribers (the
 * annunciator rail); the `storage` event remains the cross-window path.
 */

export const BOARD_QUEUE_READ_STATE_EVENT = 'teamx:board-queue-read-state';

export interface BoardQueueReadStateEventDetail {
  companyId: string;
}

/**
 * Dispatched by BoardMessageQueue after a successful read-state write so
 * same-window listeners re-read localStorage immediately.
 */
export function notifyBoardQueueReadStateChanged(companyId: string): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<BoardQueueReadStateEventDetail>(BOARD_QUEUE_READ_STATE_EVENT, {
      detail: { companyId },
    }),
  );
}
