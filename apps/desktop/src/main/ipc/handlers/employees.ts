/**
 * IPC handlers — Employees and the org chart: hire, update, promote, set manager, fire.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import { getLevelRank } from '@team-x/shared-types';
import type { OrgchartEdge } from '@team-x/shared-types';

import type { UpdateEmployeeProfileInput } from '../../db/repos/employees.js';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import {
  assertCompanyActive,
  normalizeNullableProfileTextField,
  normalizeProfileTextField,
  rowToEmployee,
} from './mappers.js';

export type EmployeesHandlers = Pick<
  IpcHandlers,
  | 'employeesList'
  | 'employeesCreate'
  | 'employeesFire'
  | 'employeesUpdate'
  | 'employeesPromote'
  | 'employeesSetManager'
  | 'orgchartGet'
>;

export function createEmployeesHandlers(ctx: HandlerContext): EmployeesHandlers {
  const { companiesRepo, employeesRepo, orgEdgesRepo, roleLookup, bus } = ctx;
  return {
    async employeesList({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] employees.list: companyId is required');
      }
      // Hide framework-internal pseudo-employees (e.g., `system-agent`) from
      // every renderer surface. `listVisibleByCompany` applies the
      // `is_system = 0` predicate — see repos/employees.ts + migration 0010.
      const rows = employeesRepo.listVisibleByCompany(companyId);
      return rows.map(rowToEmployee);
    },

    async employeesCreate({ companyId, roleId, name }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] employees.create: companyId is required');
      }
      if (typeof roleId !== 'string' || roleId.length === 0) {
        throw new Error('[ipc] employees.create: roleId is required');
      }
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('[ipc] employees.create: name is required');
      }

      const spec = roleLookup.getSpec(roleId);
      if (!spec) {
        throw new Error(`[ipc] employees.create: role not found: ${roleId}`);
      }

      // Refuse to hire framework-internal roles via the IPC surface. Only
      // `ensureSystemAgent` is allowed to seed `level: system` employees
      // and it goes through the repo directly, not this handler.
      if (spec.frontmatter.level === 'system') {
        throw new Error(
          `[ipc] employees.create: role "${roleId}" is framework-internal and cannot be hired. Use the command palette for complex requests instead.`,
        );
      }

      const trimmedName = name.trim();
      const employeeId = employeesRepo.create({
        companyId,
        rolePackId: 'strategia-official',
        roleId: spec.frontmatter.id,
        roleMdSha: spec.sha256,
        level: spec.frontmatter.level,
        name: trimmedName,
        title: spec.frontmatter.name,
        toolsAllowed: spec.frontmatter.tools_allowed ?? [],
        toolsDenied: spec.frontmatter.tools_denied ?? [],
      });

      // Invariant #11 (Phase 5.6 M-C FOLLOWUP-P1-extended — closes BUG-009):
      // emit AFTER the durable write so a bus failure cannot cascade into the
      // IPC throw. Mirrors the `employees.promoted` / step-f pattern.
      const hiredAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.hired',
            companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              companyId,
              roleId: spec.frontmatter.id,
              level: spec.frontmatter.level,
              name: trimmedName,
              title: spec.frontmatter.name,
              hiredAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.create: bus emit failed (row still created with id ${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] employees.create: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return { employeeId };
    },

    async employeesFire({ employeeId }) {
      if (typeof employeeId !== 'string' || employeeId.length === 0) {
        throw new Error('[ipc] employees.fire: employeeId is required');
      }
      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.fire: employee not found: ${employeeId}`);
      }
      // Framework-internal pseudo-employees are seeded once per company and
      // must never be removed via UI — the command palette + audit log +
      // agentic loop all assume the system-agent row is stable. The hire
      // dialog already can't surface them (filtered from
      // `listVisibleByCompany`); this is the last line of defense.
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.fire: cannot fire framework-internal employee ${employeeId} ` +
            `(role_id=${employee.roleId})`,
        );
      }

      // Snapshot-before-drop — the delete on the next line removes the row,
      // so the bus payload captures identifying fields (roleId/level/name/
      // title/companyId) HERE so audit-view chips + renderer optimistic
      // removals have the identifier after the row is gone. Same rationale
      // as `company.deleted` (step e) / `goal.deleted` / `project.deleted`
      // (step f).
      const snapshotCompanyId = employee.companyId;
      const snapshotRoleId = employee.roleId;
      const snapshotLevel = employee.level;
      const snapshotName = employee.name;
      const snapshotTitle = employee.title;

      employeesRepo.delete(employeeId);

      // Invariant #11 (Phase 5.6 M-C FOLLOWUP-P1-extended — closes BUG-010):
      // emit AFTER the durable delete. Mirrors the step-f delete-emit pattern.
      if (bus) {
        try {
          bus.emit({
            type: 'employee.fired',
            companyId: snapshotCompanyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              companyId: snapshotCompanyId,
              roleId: snapshotRoleId,
              level: snapshotLevel,
              name: snapshotName,
              title: snapshotTitle,
              firedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.fire: bus emit failed (row still deleted, id=${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] employees.fire: bus dep unwired — renderer caches will NOT invalidate');
      }
    },

    async employeesUpdate(req) {
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] employees.update: request body is required');
      }
      const employeeId = typeof req.employeeId === 'string' ? req.employeeId : '';
      if (employeeId.length === 0) {
        throw new Error('[ipc] employees.update: employeeId is required');
      }

      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.update: employee not found: ${employeeId}`);
      }
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.update: cannot edit framework-internal employee ${employeeId} ` +
            `(role_id=${employee.roleId})`,
        );
      }
      assertCompanyActive(companiesRepo, employee.companyId, 'employees.update');

      const patch: UpdateEmployeeProfileInput = { employeeId };
      const patchedKeys: Array<'name' | 'title' | 'modelPref' | 'providerPref' | 'avatar'> = [];
      const name = normalizeProfileTextField(req.name, 'name', 120);
      const title = normalizeProfileTextField(req.title, 'title', 160);
      const modelPref = normalizeNullableProfileTextField(req.modelPref, 'modelPref', 120);
      const providerPref = normalizeNullableProfileTextField(req.providerPref, 'providerPref', 120);
      const avatar = normalizeNullableProfileTextField(req.avatar, 'avatar', 500);

      if (name !== undefined && name !== employee.name) {
        patch.name = name;
        patchedKeys.push('name');
      }
      if (title !== undefined && title !== employee.title) {
        patch.title = title;
        patchedKeys.push('title');
      }
      if (modelPref !== undefined && modelPref !== employee.modelPref) {
        patch.modelPref = modelPref;
        patchedKeys.push('modelPref');
      }
      if (providerPref !== undefined && providerPref !== employee.providerPref) {
        patch.providerPref = providerPref;
        patchedKeys.push('providerPref');
      }
      if (avatar !== undefined && avatar !== employee.avatar) {
        patch.avatar = avatar;
        patchedKeys.push('avatar');
      }

      if (patchedKeys.length > 0) {
        if (!employeesRepo.updateProfile) {
          throw new Error('[ipc] employees.update: employees repo cannot update profiles');
        }
        employeesRepo.updateProfile(patch);
      }

      const updated = employeesRepo.getById(employeeId) ?? employee;
      const responseEmployee = rowToEmployee(updated);

      if (patchedKeys.length > 0) {
        const updatedAt = Date.now();
        if (bus) {
          try {
            bus.emit({
              type: 'employee.updated',
              companyId: updated.companyId,
              actorId: HUMAN_USER_ID,
              actorKind: 'user',
              payload: {
                employeeId,
                companyId: updated.companyId,
                patchedKeys,
                name: updated.name,
                title: updated.title,
                updatedAt,
              },
            });
          } catch (err) {
            console.error(
              `[ipc] employees.update: bus emit failed (row still updated, id=${employeeId}):`,
              err,
            );
          }
        } else if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] employees.update: bus dep unwired — renderer caches will NOT invalidate',
          );
        }
      }

      return { employee: responseEmployee };
    },

    async employeesPromote(req) {
      // Input validation — fail closed before any SQL writes.
      //
      // BUG-008 (Phase 5.6 M-C step d hardening): error messages
      // intentionally include internal nanoid identifiers (e.g.
      // "employee not found: <id>") to preserve the developer feedback
      // loop. Public release will need an error-redaction helper that
      // scrubs IDs in the production error formatter; tracked for
      // M-F docs sweep.
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] employees.promote: request body is required');
      }
      const employeeId = typeof req.employeeId === 'string' ? req.employeeId : '';
      if (employeeId.length === 0) {
        throw new Error('[ipc] employees.promote: employeeId is required');
      }
      const newRoleId = typeof req.newRoleId === 'string' ? req.newRoleId : '';
      if (newRoleId.length === 0) {
        throw new Error('[ipc] employees.promote: newRoleId is required');
      }

      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.promote: employee not found: ${employeeId}`);
      }
      // Same defense-in-depth as `employees.fire`: framework-internal
      // pseudo-employees (system-agent / system-copilot) are seeded
      // once per company and must never be re-roled via the IPC.
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.promote: cannot promote framework-internal employee ${employeeId} ` +
            `(role_id=${employee.roleId})`,
        );
      }

      // BUG-002 (Phase 5.6 M-C step d hardening): refuse mutations
      // against archived companies. Archived = soft-deleted, the
      // orchestrator dispatcher already treats the company as inactive
      // and the copilot analyzer is quiesced. Allowing org mutations
      // would emit bus events on a tombstoned entity and create
      // ghost-row reporting graph state.
      assertCompanyActive(companiesRepo, employee.companyId, 'employees.promote');

      const spec = roleLookup.getSpec(newRoleId);
      if (!spec) {
        throw new Error(`[ipc] employees.promote: role not found: ${newRoleId}`);
      }
      // Refuse to promote INTO a framework-internal role — only
      // `ensureSystemAgent` is allowed to seed `level: system` rows
      // and it goes through the repo directly. Mirrors the same guard
      // in `employees.create`.
      if (spec.frontmatter.level === 'system') {
        throw new Error(
          `[ipc] employees.promote: role "${newRoleId}" is framework-internal and cannot be assigned`,
        );
      }

      // Snapshot the pre-promote shape so the response + bus event
      // payload carry the full delta. Reads from the row we already
      // fetched — no second SQL round-trip.
      const previousRoleId = employee.roleId;
      const previousLevel = employee.level;
      const previousTitle = employee.title;
      const newLevel = spec.frontmatter.level;
      const newTitle = spec.frontmatter.name;

      // BUG-006 (Phase 5.6 M-C step d hardening): tools_allowed /
      // tools_denied flow into the row's tools_*_json columns
      // unvalidated at this layer by design. Trust-boundary chain:
      //
      //   1. Role-pack files signed Ed25519 (Phase 5.5 hotfix). In
      //      packaged production builds the loader runs in `strict`
      //      mode and refuses an unsigned or tampered pack.
      //   2. Even with a tampered pack, the strings cannot escape
      //      into actual tool dispatch — the MCP Host (architectural
      //      invariant #3) enforces the `tools_allowed` / `tools_denied`
      //      lists at the tool-call gateway. Strings that don't match
      //      a real registered tool name are inert.
      //
      // The defense lives at the gateway, not here. Logged so future
      // refactors don't accidentally remove the gateway check assuming
      // upstream validation.
      employeesRepo.promote({
        employeeId,
        roleId: spec.frontmatter.id,
        level: newLevel,
        title: newTitle,
        roleMdSha: spec.sha256,
        toolsAllowed: spec.frontmatter.tools_allowed ?? [],
        toolsDenied: spec.frontmatter.tools_denied ?? [],
      });

      // Architectural invariant #11 — emit AFTER the durable write so
      // a bus failure cannot cascade into the IPC throw (the row is
      // already promoted by the time we get here). Mirrors the
      // `companies.archive` / `companies.create` patterns.
      //
      // BUG-005 (Phase 5.6 M-C step d hardening): use HUMAN_USER_ID
      // (the canonical Phase 1 hardcoded user constant) instead of
      // the literal 'user' string — keeps audit-view actor links
      // resolvable to a real row id when multi-user lands.
      const promotedAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.promoted',
            companyId: employee.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              previousRoleId,
              newRoleId: spec.frontmatter.id,
              previousLevel,
              newLevel,
              previousTitle,
              newTitle,
              promotedAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.promote: bus emit failed (row still promoted, id=${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] employees.promote: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return {
        employeeId,
        previousRoleId,
        newRoleId: spec.frontmatter.id,
        previousLevel,
        newLevel,
        previousTitle,
        newTitle,
      };
    },

    async employeesSetManager(req) {
      // BUG-008 (Phase 5.6 M-C step d hardening): error messages
      // intentionally include internal nanoid identifiers for the
      // developer feedback loop. See `employeesPromote` JSDoc.
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] employees.setManager: request body is required');
      }
      const employeeId = typeof req.employeeId === 'string' ? req.employeeId : '';
      if (employeeId.length === 0) {
        throw new Error('[ipc] employees.setManager: employeeId is required');
      }
      // `managerId === null` is the documented "detach / make root"
      // path. Any non-string non-null value is invalid.
      const managerId =
        req.managerId === null
          ? null
          : typeof req.managerId === 'string' && req.managerId.length > 0
            ? req.managerId
            : undefined;
      if (managerId === undefined) {
        throw new Error(
          '[ipc] employees.setManager: managerId must be a non-empty string or null (to detach)',
        );
      }

      const employee = employeesRepo.getById(employeeId);
      if (!employee) {
        throw new Error(`[ipc] employees.setManager: employee not found: ${employeeId}`);
      }
      if (employee.isSystem) {
        throw new Error(
          `[ipc] employees.setManager: cannot edit reporting line for framework-internal employee ${employeeId}`,
        );
      }

      // BUG-002 (Phase 5.6 M-C step d hardening): refuse mutations
      // against archived companies. Same rationale as `employees.promote`.
      assertCompanyActive(companiesRepo, employee.companyId, 'employees.setManager');

      let previousManagerId: string | null;

      if (managerId === null) {
        // Detach path — atomic snapshot + remove inside the repo's
        // transaction. previousManagerId is null when the report was
        // already a graph root.
        const result = orgEdgesRepo.removeByReport(employeeId);
        previousManagerId = result.previousManagerId;
      } else {
        // Upsert path. Validate the manager exists, is non-system,
        // shares a company with the report, and (M-C step d hardening
        // BUG-001) sits at a strictly more senior level. The repo's
        // setManager runs the cycle check inside its own transaction
        // — the handler-side wouldCycle pre-check was removed in the
        // M-C step d hardening pass to eliminate the TOCTOU window
        // between handler-check and repo-write (BUG-003 + BUG-004).
        if (managerId === employeeId) {
          throw new Error(
            '[ipc] employees.setManager: managerId and employeeId must differ (self-edges are cyclic)',
          );
        }
        const manager = employeesRepo.getById(managerId);
        if (!manager) {
          throw new Error(`[ipc] employees.setManager: manager not found: ${managerId}`);
        }
        if (manager.isSystem) {
          throw new Error(
            `[ipc] employees.setManager: cannot assign framework-internal employee ${managerId} as manager`,
          );
        }
        if (manager.companyId !== employee.companyId) {
          throw new Error(
            `[ipc] employees.setManager: manager ${managerId} and report ${employeeId} must share a company`,
          );
        }

        // BUG-001 (Phase 5.6 M-C step d hardening): level-inversion
        // guard. The locked Phase 2 M9 hierarchy (officer >
        // senior-management > management > supervisor > lead > ic)
        // requires a manager to be at a STRICTLY more senior level
        // than its report. Same-level and inverted relationships
        // are rejected here. Unknown levels (e.g. a future role-pack
        // adds a new tier) fail OPEN with a dev-mode warning so the
        // guard does not brick the IPC on data we don't recognize.
        const managerRank = getLevelRank(manager.level);
        const reportRank = getLevelRank(employee.level);
        if (managerRank === null || reportRank === null) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[ipc] employees.setManager: level rank unknown — manager.level=${manager.level} report.level=${employee.level}; skipping inversion guard (fail-open)`,
            );
          }
        } else if (managerRank >= reportRank) {
          throw new Error(
            `[ipc] employees.setManager: level inversion — manager (${manager.level}) must be at a strictly more senior level than report (${employee.level})`,
          );
        }

        // Atomic upsert + snapshot inside the repo's transaction.
        // Catches the repo's "would create cycle" throw and rewraps
        // with a friendlier renderer-facing message — pattern-match
        // on the `[org-edges] setManager: would create cycle` prefix
        // the repo emits.
        try {
          const result = orgEdgesRepo.setManager({
            companyId: employee.companyId,
            managerId,
            reportId: employeeId,
          });
          previousManagerId = result.previousManagerId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('[org-edges] setManager: would create cycle')) {
            throw new Error(
              `[ipc] employees.setManager: would create reporting cycle — ${managerId} already reports (directly or transitively) to ${employeeId}`,
            );
          }
          throw err;
        }
      }

      // Architectural invariant #11 — emit AFTER the durable write.
      // BUG-005 (M-C step d hardening): use HUMAN_USER_ID, not 'user'.
      const setAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'employee.managerSet',
            companyId: employee.companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              employeeId,
              companyId: employee.companyId,
              managerId,
              previousManagerId,
              setAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] employees.setManager: bus emit failed (edge still updated, employee=${employeeId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] employees.setManager: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async orgchartGet({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] orgchart.get: companyId is required');
      }
      // Non-system employees only — matches `employees.list` contract.
      // Framework-internal pseudo-employees (`system-agent` /
      // `system-copilot`) must never surface in the renderer org tree.
      const employeeRows = employeesRepo.listVisibleByCompany(companyId);
      const visibleIds = new Set<string>(employeeRows.map((e) => e.id));

      // Defensive edge filter — drop any edge whose manager OR report
      // references an employee outside `visibleIds`. This can happen
      // legitimately when a freshly-fired system employee's edges have
      // not yet been cleaned up (future `employees.fire` flow), or
      // pathologically if a direct DB write inserted a reference to an
      // archived/deleted employee. The repo write path's `wouldCycle`
      // is the canonical guard; this filter keeps the renderer
      // defensive against state it cannot render.
      const edges: OrgchartEdge[] = orgEdgesRepo
        .listByCompany(companyId)
        .filter((row) => visibleIds.has(row.managerId) && visibleIds.has(row.reportId))
        .map((row) => ({
          id: row.id,
          managerId: row.managerId,
          reportId: row.reportId,
          createdAt: row.createdAt,
        }));

      // Root ids = every visible employee that has no manager edge
      // pointing at them. For a canonical org tree this is the single
      // CEO row; during onboarding / post-hire-before-wire moments the
      // set can include any number of unassigned employees. The
      // renderer uses this as the top of its indented-list tree view.
      const reportIds = new Set<string>(edges.map((e) => e.reportId));
      const rootIds: string[] = employeeRows.map((e) => e.id).filter((id) => !reportIds.has(id));

      return {
        employees: employeeRows.map(rowToEmployee),
        edges,
        rootIds,
      };
    },
  };
}
