/**
 * Timeline row text for `work.failed`. The orchestrator emits it as actor
 * `orchestrator`, so the row read "orchestrator work failed" and dropped the
 * reason — a Settings → Privacy refusal was indistinguishable from a crash.
 */
import type { DashboardEvent, Employee } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import { eventDescription } from './timeline-view.js';

const iris = { id: 'emp-iris', name: 'Iris' } as Employee;
const employees = new Map([[iris.id, iris]]);

function failed(payload: Record<string, unknown>): DashboardEvent {
  return {
    id: 1,
    type: 'work.failed',
    companyId: 'co-1',
    actorId: 'orchestrator',
    actorKind: 'orchestrator',
    payload,
    createdAt: 1,
  } as unknown as DashboardEvent;
}

describe('timeline — work.failed', () => {
  it('names the employee from the payload and gives the reason', () => {
    expect(
      eventDescription(
        failed({
          threadId: 't',
          employeeId: 'emp-iris',
          error: 'Provider is Proprietary Cloud-tier',
        }),
        employees,
      ),
    ).toBe('Iris work failed: Provider is Proprietary Cloud-tier');
  });

  it('falls back to the actor and a bare label when the payload has neither', () => {
    expect(eventDescription(failed({ threadId: 't' }), employees)).toBe('orchestrator work failed');
  });
});
