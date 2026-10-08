import type { TeamXDb } from '../db/client.js';
import type { RoleLoader } from '../services/role-loader.js';
import { ensureSystemAgent, ensureSystemCopilot } from '../services/system-agent-bootstrap.js';

import type { Repositories } from './repositories.js';
import { runtime } from './runtime-state.js';

/**
 * Per-company boot pass over every live company: top up the system
 * employees, then start the company's routine scheduler.
 */
export function topUpCompaniesAndStartRoutines(
  deps: Pick<Repositories, 'companiesRepo'> & { db: TeamXDb; roleLoader: RoleLoader },
): void {
  const { db, companiesRepo, roleLoader } = deps;

  for (const company of companiesRepo.list()) {
    if (company.status === 'archived') continue;
    // System-employee top-up — idempotent. Companies created before
    // M33 T2 (e.g., via M31 paths) lack the `system-copilot` row;
    // companies created before M31's `is_system` migration lack the
    // `system-agent` row. Both ensure functions short-circuit when
    // the row already exists, so this is a zero-cost no-op for
    // current-schema companies. Without this top-up, `copilot.ask`
    // throws `[copilot-service] No system-copilot employee for
    // company "..."` for any pre-M33 company. Errors are logged
    // and swallowed so a single broken company can't block boot
    // for the rest.
    try {
      ensureSystemAgent({ db, companyId: company.id, roleLookup: roleLoader });
      ensureSystemCopilot({ db, companyId: company.id, roleLookup: roleLoader });
    } catch (err) {
      console.error(`[main] system-employee top-up failed for company ${company.id}:`, err);
    }
    runtime.routineServiceInstance?.start(company.id);
  }
}
