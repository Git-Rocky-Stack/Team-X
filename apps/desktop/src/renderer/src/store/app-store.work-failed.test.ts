/**
 * `work.failed` in the live-state slice.
 *
 * The orchestrator reports a refused turn (Settings → Privacy, a missing API
 * key, a disabled provider) as `work.failed` WITHOUT a prior `work.started`.
 * The reducer used to match only on `lastThreadId`, which only
 * `work.started` sets, and dropped the `error` text — so the refusal reached
 * no surface and a waiting chat drawer stayed busy forever.
 */
import type { DashboardEvent } from '@team-x/shared-types';
import { afterEach, describe, expect, it } from 'vitest';

import { useAppStore } from './app-store.js';

const initial = useAppStore.getState();

afterEach(() => {
  useAppStore.setState(initial, true);
});

function emit(type: string, payload: Record<string, unknown>, actorId = 'orchestrator'): void {
  useAppStore.getState().handleDashboardEvent({
    id: 1,
    type,
    companyId: 'co-1',
    actorId,
    actorKind: 'orchestrator',
    payload,
    createdAt: 1,
  } as unknown as DashboardEvent);
}

const REFUSAL =
  'Provider "Anthropic (claude-haiku-4-5)" is Proprietary Cloud-tier, but Settings → Privacy allows Local Only.';

describe('app store — work.failed', () => {
  it('records a refusal against the employee named in the payload, with no prior work.started', () => {
    emit('work.failed', {
      threadId: 'thr-dm',
      employeeId: 'emp-iris',
      messageId: 'msg-1',
      error: REFUSAL,
    });

    expect(useAppStore.getState().employeeLive['emp-iris']).toMatchObject({
      status: 'idle',
      lastFailure: { threadId: 'thr-dm', error: REFUSAL },
    });
  });

  it('stops a running employee and keeps the reason', () => {
    emit('work.started', { threadId: 'thr-dm', employeeId: 'emp-iris', provider: 'p', model: 'm' });
    emit('work.failed', {
      threadId: 'thr-dm',
      employeeId: 'emp-iris',
      messageId: 'msg-1',
      error: 'provider connection dropped',
    });

    expect(useAppStore.getState().employeeLive['emp-iris']).toMatchObject({
      status: 'idle',
      currentStream: '',
      lastFailure: { threadId: 'thr-dm', error: 'provider connection dropped' },
    });
  });

  it('still finds the employee by thread when the payload omits employeeId', () => {
    emit('work.started', { threadId: 'thr-dm', employeeId: 'emp-iris', provider: 'p', model: 'm' });
    emit('work.failed', { threadId: 'thr-dm', messageId: 'msg-1', error: 'boom' });

    expect(useAppStore.getState().employeeLive['emp-iris']?.lastFailure?.error).toBe('boom');
  });

  it('clears the reason when the next turn starts', () => {
    emit('work.failed', { threadId: 'thr-dm', employeeId: 'emp-iris', error: REFUSAL });
    emit('work.started', { threadId: 'thr-dm', employeeId: 'emp-iris', provider: 'p', model: 'm' });

    expect(useAppStore.getState().employeeLive['emp-iris']?.lastFailure ?? null).toBeNull();
  });

  it('lets the drawer dismiss the reason when the user sends again', () => {
    emit('work.failed', { threadId: 'thr-dm', employeeId: 'emp-iris', error: REFUSAL });

    useAppStore.getState().clearEmployeeFailure('emp-iris');

    expect(useAppStore.getState().employeeLive['emp-iris']?.lastFailure ?? null).toBeNull();
  });
});
