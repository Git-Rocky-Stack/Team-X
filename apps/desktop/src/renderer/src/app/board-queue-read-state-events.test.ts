/**
 * Board-queue read-state event seam tests.
 *
 * Same-document `storage` events never fire (HTML spec), so the writer
 * (BoardMessageQueue) must broadcast read-state changes via this custom
 * event for same-window subscribers (the annunciator rail). These tests
 * pin the dispatch contract: event type, detail payload, and the
 * addEventListener round-trip the annunciator relies on.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BOARD_QUEUE_READ_STATE_EVENT,
  type BoardQueueReadStateEventDetail,
  notifyBoardQueueReadStateChanged,
} from './board-queue-read-state-events';

type SeamListener = (event: Event) => void;

const registered: { type: string; listener: SeamListener }[] = [];

function listen(listener: SeamListener): void {
  window.addEventListener(BOARD_QUEUE_READ_STATE_EVENT, listener);
  registered.push({ type: BOARD_QUEUE_READ_STATE_EVENT, listener });
}

afterEach(() => {
  for (const { type, listener } of registered.splice(0)) {
    window.removeEventListener(type, listener);
  }
});

describe('notifyBoardQueueReadStateChanged', () => {
  it('dispatches a CustomEvent with the seam type and companyId detail', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    notifyBoardQueueReadStateChanged('company-1');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent<BoardQueueReadStateEventDetail>;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.type).toBe(BOARD_QUEUE_READ_STATE_EVENT);
    expect(event.detail).toEqual({ companyId: 'company-1' });

    dispatchSpy.mockRestore();
  });

  it('reaches a same-window addEventListener subscriber with the detail intact', () => {
    const seen: string[] = [];
    listen((event) => {
      const detail = (event as CustomEvent<BoardQueueReadStateEventDetail>).detail;
      seen.push(detail.companyId);
    });

    notifyBoardQueueReadStateChanged('company-a');
    notifyBoardQueueReadStateChanged('company-b');

    expect(seen).toEqual(['company-a', 'company-b']);
  });

  it('lets a subscriber discriminate by companyId, mirroring the annunciator guard', () => {
    const activeCompanyId = 'company-active';
    const reReads = vi.fn();
    listen((event) => {
      const detail = (event as CustomEvent<BoardQueueReadStateEventDetail>).detail;
      if (detail?.companyId === activeCompanyId) reReads();
    });

    notifyBoardQueueReadStateChanged('company-other');
    expect(reReads).not.toHaveBeenCalled();

    notifyBoardQueueReadStateChanged(activeCompanyId);
    expect(reReads).toHaveBeenCalledTimes(1);
  });

  it('no-ops without throwing when window is undefined (SSR/Node guard)', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(() => notifyBoardQueueReadStateChanged('company-x')).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
