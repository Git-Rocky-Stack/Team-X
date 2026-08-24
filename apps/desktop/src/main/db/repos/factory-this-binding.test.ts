/**
 * Repo factory methods must not depend on their call site.
 *
 * Every repo here is a factory returning an object literal, and several of its
 * methods call a sibling. Written as `this.getById(...)`, that sibling lookup
 * resolves through the *receiver*, so the method only works while it is still
 * attached to the object it was defined on:
 *
 *   repo.markEnded(id)                        // fine — receiver is `repo`
 *   const { markEnded } = repo; markEnded(id) // TypeError: this is undefined
 *   ids.map(repo.markEnded)                   // TypeError: this is undefined
 *   setTimeout(repo.expireStale, 0)           // TypeError: this is undefined
 *
 * These modules are ESM, so `this` inside a detached call is `undefined` rather
 * than the global object — the failure is a hard TypeError, not a silent wrong
 * answer. Nothing in the repo destructures these today, which is exactly why
 * this is worth pinning: the defect is latent, it costs nothing to remove, and
 * the first caller to write `const { get } = settingsRepo` would otherwise find
 * it at runtime.
 *
 * Each case destructures the method that actually contains a `this.` and calls
 * it detached. Failing here means a factory is still receiver-dependent.
 *
 * `markStaleBefore` and `expireStale` are deliberately absent. Both reach their
 * `this.` call only inside a loop over rows that an empty database does not
 * produce, so a test for them passed with the defect fully present — it could
 * not fail for the reason it named. Their files are covered by the sibling
 * cases below (`update` / `markEnded`, `heartbeat` / `release`), and the fix is
 * per-file, so coverage of the file is what this needed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createAgentWakeupRequestsRepo } from './agent-wakeup-requests.js';
import { createAuditRepo } from './audit.js';
import { createAuthorityRepo, createSkillAssignmentsRepo } from './extensions.js';
import { createPendingDelegationsRepo } from './pending-delegations.js';
import { createRuntimeProfilesRepo } from './runtime-profiles.js';
import { createRuntimeSessionsRepo } from './runtime-sessions.js';
import { createSettingsRepo } from './settings.js';
import { createThreadDigestsRepo } from './thread-digests.js';
import { createTicketCheckoutsRepo } from './ticket-checkouts.js';

/**
 * The subject of every case below is receiver-independence, not database
 * validity.
 *
 * Calling a repo method with a nonexistent id, or with a partial row, may
 * legitimately raise a SQLite constraint error — that is the repo working. What
 * it must never raise is the `TypeError: Cannot read properties of undefined`
 * that a detached `this` produces. Asserting "does not throw at all" would force
 * each case to seed a valid graph of foreign-keyed rows first, which would test
 * the schema and bury the one thing this file exists to check.
 */
function expectNoThisBindingError(label: string, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error, `${label} threw a binding error`).not.toBeInstanceOf(TypeError);
  }
}

let ctx: TestDbHandle;

beforeEach(async () => {
  ctx = await makeTestDb();
});

afterEach(() => {
  ctx.close();
});

describe('settings repo — detached methods', () => {
  it('reads through get() when destructured', () => {
    const { get } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('get', () => get('nonexistent.key'));
  });

  it('reads agentic defaults when destructured', () => {
    const { getAgentic } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('getAgentic', () => getAgentic());
  });

  it('reads planner defaults when destructured', () => {
    const { getPlanner } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('getPlanner', () => getPlanner());
  });

  it('reads copilot weights when destructured', () => {
    const { getCopilotWeights } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('getCopilotWeights', () => getCopilotWeights());
  });

  it('reads extensions settings when destructured', () => {
    const { getExtensions } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('getExtensions', () => getExtensions());
  });

  it('reads memory settings when destructured', () => {
    const { getMemory } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('getMemory', () => getMemory());
  });

  it('reads proactive settings when destructured', () => {
    const { getProactive } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('getProactive', () => getProactive());
  });

  it('seeds defaults when destructured', () => {
    const { seedDefaults } = createSettingsRepo(ctx.db);
    expectNoThisBindingError('seedDefaults', () => seedDefaults());
  });
});

describe('audit repo — detached methods', () => {
  it('exports JSON when destructured', () => {
    const { exportJson } = createAuditRepo(ctx.db);
    expectNoThisBindingError('exportJson', () => exportJson({ companyId: 'co-1' }));
  });

  it('exports CSV when destructured', () => {
    const { exportCsv } = createAuditRepo(ctx.db);
    expectNoThisBindingError('exportCsv', () => exportCsv({ companyId: 'co-1' }));
  });
});

describe('runtime-sessions repo — detached methods', () => {
  it('lists live sessions when destructured', () => {
    const { listLiveByCompany } = createRuntimeSessionsRepo(ctx.db);
    expectNoThisBindingError('listLiveByCompany', () => listLiveByCompany('co-1'));
  });

  it('updates a missing session when destructured', () => {
    const { update } = createRuntimeSessionsRepo(ctx.db);
    expectNoThisBindingError('update', () => update('no-such-session', {}));
  });

  it('marks a missing session ended when destructured', () => {
    const { markEnded } = createRuntimeSessionsRepo(ctx.db);
    expectNoThisBindingError('markEnded', () => markEnded('no-such-session'));
  });
});

describe('ticket-checkouts repo — detached methods', () => {
  it('heartbeats a missing checkout when destructured', () => {
    const { heartbeat } = createTicketCheckoutsRepo(ctx.db);
    expectNoThisBindingError('heartbeat', () => heartbeat('no-such-checkout', {}));
  });

  it('releases a missing checkout when destructured', () => {
    const { release } = createTicketCheckoutsRepo(ctx.db);
    expectNoThisBindingError('release', () =>
      release({ checkoutId: 'no-such-checkout', status: 'released' } as never),
    );
  });
});

describe('extensions.ts factories — detached methods', () => {
  // extensions.ts exports three factories; the `this.` calls live on the
  // authority and skill-assignment ones, not on createExtensionsRepo.
  it('lists pending authority requests when destructured', () => {
    const { listPendingByCompany } = createAuthorityRepo(ctx.db);
    expectNoThisBindingError('listPendingByCompany', () => listPendingByCompany('co-1'));
  });

  it('upserts a skill assignment when destructured', () => {
    const { upsert } = createSkillAssignmentsRepo(ctx.db);
    expectNoThisBindingError('upsert', () =>
      upsert({
        companyId: 'co-1',
        extensionId: 'ext-1',
        scopeKind: 'company',
        scopeId: 'co-1',
      } as never),
    );
  });
});

describe('thread-digests repo — detached methods', () => {
  it('upserts when destructured', () => {
    const { upsert } = createThreadDigestsRepo(ctx.db);
    expectNoThisBindingError('upsert', () =>
      upsert({
        companyId: 'co-1',
        threadId: 'th-1',
        summary: 'a summary',
        keyPoints: [],
        openQuestions: [],
        convert: undefined as never,
      } as never),
    );
  });
});

describe('pending-delegations repo — detached methods', () => {
  it('lists pending delegations when destructured', () => {
    const { listPendingByCompany } = createPendingDelegationsRepo(ctx.db);
    expectNoThisBindingError('listPendingByCompany', () => listPendingByCompany('co-1'));
  });
});

describe('runtime-profiles repo — detached methods', () => {
  it('upserts a binding when destructured', () => {
    const { upsertBinding } = createRuntimeProfilesRepo(ctx.db);
    expectNoThisBindingError('upsertBinding', () =>
      upsertBinding({ companyId: 'co-1', employeeId: 'emp-1', profileId: null }),
    );
  });
});

describe('agent-wakeup-requests repo — detached methods', () => {
  it('marks a missing request failed when destructured', () => {
    const { markAsFailedWithRetry } = createAgentWakeupRequestsRepo(ctx.db);
    expectNoThisBindingError('markAsFailedWithRetry', () =>
      markAsFailedWithRetry('no-such-request', 'boom'),
    );
  });
});
