/**
 * IPC handlers — Schedule items: list, create, update, delete, and the derived
 * ticket/project/goal timeline.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */
import type { UpdateCompanyInput } from '../../db/repos/companies.js';
import type { UpdateScheduleItemInput } from '../../db/repos/schedule-items.js';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { HUMAN_USER_ID } from './deps.js';
import {
  SCHEDULE_ITEM_KINDS,
  SCHEDULE_ITEM_STATUSES,
  SCHEDULE_PRIORITIES,
  assertCompanyActive,
  normalizeOptionalId,
  normalizeScheduleTimestamp,
  rowToScheduleItem,
  scheduleItemInRange,
} from './mappers.js';

export type ScheduleHandlers = Pick<
  IpcHandlers,
  | 'scheduleList'
  | 'scheduleCreate'
  | 'scheduleUpdate'
  | 'scheduleComplete'
  | 'scheduleDelete'
  | 'companiesCreate'
  | 'companiesArchive'
  | 'companiesUpdate'
  | 'companiesDelete'
>;

export function createScheduleHandlers(ctx: HandlerContext): ScheduleHandlers {
  const {
    companiesRepo,
    scheduleItemsRepo,
    operatorAccessService,
    routineService,
    copilotAnalyzerService,
    copilotEventWindow,
    bus,
    ensureSystemForCompany,
    emitUserAuditEvent,
    validateScheduleLinkage,
    cancelScheduleWakeup,
    attachWakeupIfNeeded,
    buildDerivedScheduleItems,
  } = ctx;
  return {
    async scheduleList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] schedule.list: companyId is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'schedule.list');
      const manualItems = scheduleItemsRepo.listByCompany(req.companyId).map(rowToScheduleItem);
      const derivedItems =
        req.includeDerived === false ? [] : buildDerivedScheduleItems(req.companyId);
      return [...manualItems, ...derivedItems]
        .filter((item) => scheduleItemInRange(item, req.from, req.to))
        .sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title));
    },

    async scheduleCreate(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] schedule.create: companyId is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'schedule.create');
      if (typeof req.title !== 'string' || req.title.trim().length === 0) {
        throw new Error('[ipc] schedule.create: title is required');
      }
      const title = req.title.trim();
      if (title.length > 160) {
        throw new Error('[ipc] schedule.create: title must be 160 characters or fewer');
      }
      const kind = req.kind ?? 'task';
      if (!SCHEDULE_ITEM_KINDS.includes(kind)) {
        throw new Error('[ipc] schedule.create: kind is invalid');
      }
      const priority = req.priority ?? 'medium';
      if (!SCHEDULE_PRIORITIES.includes(priority)) {
        throw new Error('[ipc] schedule.create: priority is invalid');
      }
      const startsAt = normalizeScheduleTimestamp(req.startsAt, 'startsAt', true);
      const endsAt = normalizeScheduleTimestamp(req.endsAt, 'endsAt', false);
      const reminderAt = normalizeScheduleTimestamp(req.reminderAt, 'reminderAt', false);
      if (startsAt === null) {
        throw new Error('[ipc] schedule.create: startsAt is required');
      }
      if (endsAt !== null && endsAt < startsAt) {
        throw new Error('[ipc] schedule.create: endsAt must be after startsAt');
      }

      const ticketId = normalizeOptionalId(req.ticketId, 'ticketId') ?? null;
      const projectId = normalizeOptionalId(req.projectId, 'projectId') ?? null;
      const goalId = normalizeOptionalId(req.goalId, 'goalId') ?? null;
      const assigneeId = normalizeOptionalId(req.assigneeId, 'assigneeId') ?? null;
      validateScheduleLinkage(req.companyId, { ticketId, projectId, goalId, assigneeId });

      const scheduleItemId = scheduleItemsRepo.create({
        companyId: req.companyId,
        title,
        description: req.description?.trim() ?? '',
        kind,
        priority,
        startsAt,
        endsAt,
        reminderAt,
        ticketId,
        projectId,
        goalId,
        assigneeId,
        createdById: HUMAN_USER_ID,
        createdByKind: 'user',
      });
      const wakeupRequestId = attachWakeupIfNeeded(scheduleItemId);

      emitUserAuditEvent('schedule.created', req.companyId, {
        scheduleItemId,
        title,
        startsAt,
        ticketId,
        projectId,
        goalId,
        assigneeId,
        wakeupRequestId,
        createdAt: Date.now(),
      });

      return { scheduleItemId, wakeupRequestId };
    },

    async scheduleUpdate(req) {
      if (typeof req.scheduleItemId !== 'string' || req.scheduleItemId.length === 0) {
        throw new Error('[ipc] schedule.update: scheduleItemId is required');
      }
      const current = scheduleItemsRepo.getById(req.scheduleItemId);
      if (!current) {
        throw new Error(`[ipc] schedule.update: schedule item not found: ${req.scheduleItemId}`);
      }
      assertCompanyActive(companiesRepo, current.companyId, 'schedule.update');
      const patch: UpdateScheduleItemInput = {};

      if (req.title !== undefined) {
        if (typeof req.title !== 'string' || req.title.trim().length === 0) {
          throw new Error('[ipc] schedule.update: title must be non-empty when provided');
        }
        const title = req.title.trim();
        if (title.length > 160) {
          throw new Error('[ipc] schedule.update: title must be 160 characters or fewer');
        }
        patch.title = title;
      }
      if (req.description !== undefined) patch.description = req.description.trim();
      if (req.kind !== undefined) {
        if (!SCHEDULE_ITEM_KINDS.includes(req.kind)) {
          throw new Error('[ipc] schedule.update: kind is invalid');
        }
        patch.kind = req.kind;
      }
      if (req.status !== undefined) {
        if (!SCHEDULE_ITEM_STATUSES.includes(req.status)) {
          throw new Error('[ipc] schedule.update: status is invalid');
        }
        patch.status = req.status;
        patch.completedAt =
          req.status === 'completed' || req.status === 'cancelled' ? Date.now() : null;
      }
      if (req.priority !== undefined) {
        if (!SCHEDULE_PRIORITIES.includes(req.priority)) {
          throw new Error('[ipc] schedule.update: priority is invalid');
        }
        patch.priority = req.priority;
      }
      const startsAt =
        req.startsAt !== undefined
          ? normalizeScheduleTimestamp(req.startsAt, 'startsAt', true)
          : current.startsAt;
      const endsAt =
        req.endsAt !== undefined
          ? normalizeScheduleTimestamp(req.endsAt, 'endsAt', false)
          : current.endsAt;
      if (startsAt === null) {
        throw new Error('[ipc] schedule.update: startsAt is required');
      }
      if (endsAt !== null && endsAt < startsAt) {
        throw new Error('[ipc] schedule.update: endsAt must be after startsAt');
      }
      if (req.startsAt !== undefined) patch.startsAt = startsAt;
      if (req.endsAt !== undefined) patch.endsAt = endsAt;
      if (req.reminderAt !== undefined) {
        patch.reminderAt = normalizeScheduleTimestamp(req.reminderAt, 'reminderAt', false);
      }
      const ticketId =
        req.ticketId !== undefined
          ? normalizeOptionalId(req.ticketId, 'ticketId')
          : current.ticketId;
      const projectId =
        req.projectId !== undefined
          ? normalizeOptionalId(req.projectId, 'projectId')
          : current.projectId;
      const goalId =
        req.goalId !== undefined ? normalizeOptionalId(req.goalId, 'goalId') : current.goalId;
      const assigneeId =
        req.assigneeId !== undefined
          ? normalizeOptionalId(req.assigneeId, 'assigneeId')
          : current.assigneeId;
      validateScheduleLinkage(current.companyId, { ticketId, projectId, goalId, assigneeId });
      if (req.ticketId !== undefined) patch.ticketId = ticketId;
      if (req.projectId !== undefined) patch.projectId = projectId;
      if (req.goalId !== undefined) patch.goalId = goalId;
      if (req.assigneeId !== undefined) patch.assigneeId = assigneeId;

      cancelScheduleWakeup(current.wakeupRequestId);
      patch.wakeupRequestId = null;
      scheduleItemsRepo.update(req.scheduleItemId, patch);
      const wakeupRequestId = attachWakeupIfNeeded(req.scheduleItemId);

      emitUserAuditEvent('schedule.updated', current.companyId, {
        scheduleItemId: req.scheduleItemId,
        patchedKeys: Object.keys(patch).filter((key) => key !== 'wakeupRequestId'),
        wakeupRequestId,
        updatedAt: Date.now(),
      });
    },

    async scheduleComplete(req) {
      if (typeof req.scheduleItemId !== 'string' || req.scheduleItemId.length === 0) {
        throw new Error('[ipc] schedule.complete: scheduleItemId is required');
      }
      const item = scheduleItemsRepo.getById(req.scheduleItemId);
      if (!item) {
        throw new Error(`[ipc] schedule.complete: schedule item not found: ${req.scheduleItemId}`);
      }
      assertCompanyActive(companiesRepo, item.companyId, 'schedule.complete');
      cancelScheduleWakeup(item.wakeupRequestId);
      const completedAt = Date.now();
      scheduleItemsRepo.update(req.scheduleItemId, {
        status: 'completed',
        completedAt,
        wakeupRequestId: null,
      });
      emitUserAuditEvent('schedule.completed', item.companyId, {
        scheduleItemId: req.scheduleItemId,
        completedAt,
      });
    },

    async scheduleDelete(req) {
      if (typeof req.scheduleItemId !== 'string' || req.scheduleItemId.length === 0) {
        throw new Error('[ipc] schedule.delete: scheduleItemId is required');
      }
      const item = scheduleItemsRepo.getById(req.scheduleItemId);
      if (!item) {
        throw new Error(`[ipc] schedule.delete: schedule item not found: ${req.scheduleItemId}`);
      }
      assertCompanyActive(companiesRepo, item.companyId, 'schedule.delete');
      cancelScheduleWakeup(item.wakeupRequestId);
      scheduleItemsRepo.delete(req.scheduleItemId);
      emitUserAuditEvent('schedule.deleted', item.companyId, {
        scheduleItemId: req.scheduleItemId,
        title: item.title,
        deletedAt: Date.now(),
      });
    },

    async companiesCreate(req) {
      // Input validation — fail closed on missing/empty fields BEFORE any
      // SQL writes so a malformed request never leaves a partial row.
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] companies.create: request body is required');
      }
      const name = typeof req.name === 'string' ? req.name.trim() : '';
      if (name.length === 0) {
        throw new Error('[ipc] companies.create: name is required (non-empty after trim)');
      }
      if (name.length > 120) {
        throw new Error('[ipc] companies.create: name exceeds 120 chars');
      }
      const slug = typeof req.slug === 'string' ? req.slug : '';
      // URL-safe slug per design — lowercase alphanumerics + hyphen, 1–63
      // chars, no leading hyphen. Matches the convention seedIfEmpty
      // already uses for `'strategia-x'` and what the renderer's future
      // CreateCompanyDialog will hand-roll. Enforced at the IPC boundary
      // so SQL UNIQUE failures only surface for genuine duplicates, not
      // for malformed-by-construction slugs.
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
        throw new Error(
          `[ipc] companies.create: slug "${slug}" must match /^[a-z0-9][a-z0-9-]{0,62}$/ (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen)`,
        );
      }
      if (
        req.settings !== undefined &&
        (req.settings === null || typeof req.settings !== 'object')
      ) {
        throw new Error('[ipc] companies.create: settings must be a plain object when provided');
      }
      if (req.icon !== undefined && typeof req.icon !== 'string') {
        throw new Error('[ipc] companies.create: icon must be a string when provided');
      }
      if (req.theme !== undefined && typeof req.theme !== 'string') {
        throw new Error('[ipc] companies.create: theme must be a string when provided');
      }

      // The system-employee bootstrap is REQUIRED — a company without
      // its system pair cannot serve a `complex_request` palette query
      // (system-agent missing) or run the copilot analyzer (system-copilot
      // missing). Fail loud rather than ship a half-formed row.
      if (!ensureSystemForCompany) {
        throw new Error(
          '[ipc] companies.create: ensureSystemForCompany dep unwired — refusing to create a company without the system-agent + system-copilot bootstrap path. Check the composition root in main/index.ts.',
        );
      }

      // SQL write — surfaces UNIQUE-constraint failure on duplicate slug
      // as a thrown sqlite error. The handler does NOT pre-check via
      // getBySlug() because the check + insert would race against any
      // concurrent create; let the SQL UNIQUE be the canonical guard.
      let companyId: string;
      try {
        companyId = companiesRepo.create({
          name,
          slug,
          settings: req.settings,
          icon: req.icon,
          theme: req.theme,
        });
      } catch (err) {
        // Surface a friendlier message on duplicate slug — sqlite's
        // raw error text is "UNIQUE constraint failed: companies.slug"
        // which is fine for logs but not for the renderer's toast.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') && msg.includes('slug')) {
          throw new Error(`[ipc] companies.create: slug "${slug}" is already in use`);
        }
        throw err;
      }

      // System-employee bootstrap — same path the seed flow + post-restore
      // sweep use. If this throws, the company row is already inserted
      // but unusable. Surface the throw so the caller knows to retry
      // after fixing the loader root (e.g., re-installing role-packs).
      const bootstrap = ensureSystemForCompany(companyId);
      if (operatorAccessService) {
        try {
          operatorAccessService.ensureLocalOwnerForCompany(companyId);
        } catch (err) {
          console.error(
            `[ipc] companies.create: local owner bootstrap failed for company ${companyId} (company remains usable, autonomy access may be incomplete):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: operatorAccessService dep unwired — new company will not get an operator membership bootstrap until next app start',
        );
      }
      if (routineService) {
        try {
          routineService.start(companyId);
        } catch (err) {
          console.error(
            `[ipc] companies.create: routine scheduler start failed for company ${companyId} (company remains usable, routines may not tick until next app start):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: routineService dep unwired — new company routines will not auto-start until next app start',
        );
      }
      if (copilotAnalyzerService) {
        try {
          copilotAnalyzerService.start(companyId);
        } catch (err) {
          console.error(
            `[ipc] companies.create: copilot analyzer start failed for company ${companyId} (company remains usable, copilot may not tick until settings are saved or the app restarts):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: copilotAnalyzerService dep unwired — new company copilot will not auto-start until next app start',
        );
      }

      // Architectural invariant #11 — IPC channels that mutate state
      // MUST emit a bus event so renderer caches invalidate. Mirrors
      // companies.archive's pattern: the durable write succeeded by
      // the time we get here, so a bus failure must NOT cascade into
      // a thrown IPC (the row is already there). Log + move on.
      const createdAt = Date.now();
      if (bus) {
        try {
          bus.emit({
            type: 'company.created',
            companyId,
            // BUG-005 (Phase 5.6 M-C step d hardening): use the canonical
            // HUMAN_USER_ID constant instead of the literal 'user' so audit-
            // view actor links resolve to the seeded user row when multi-
            // user lands.
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              companyId,
              slug,
              name,
              systemAgentEmployeeId: bootstrap.agentEmployeeId,
              systemCopilotEmployeeId: bootstrap.copilotEmployeeId,
              createdAt,
            },
          });
        } catch (err) {
          console.error(
            `[ipc] companies.create: bus emit failed (row still created with id ${companyId}):`,
            err,
          );
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.create: bus dep unwired — renderer caches will NOT invalidate',
        );
      }

      return {
        companyId,
        systemAgentEmployeeId: bootstrap.agentEmployeeId,
        systemCopilotEmployeeId: bootstrap.copilotEmployeeId,
      };
    },

    async companiesArchive({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] companies.archive: companyId is required');
      }

      // Quiesce order matters. Stop the analyzer FIRST so a mid-flight
      // tick cannot observe a cleared buffer before we flip the row:
      //
      //   1. analyzer.stop(companyId)   — kill timer + abort in-flight tick.
      //   2. eventWindow.clear(companyId) — drop rolling buffer + hydrated flag.
      //   3. companiesRepo.archive(companyId) — flip status to 'archived'.
      //   4. bus.emit('company.archived') — fan out for cache invalidation.
      //
      // Steps 1 + 2 are wrapped in optional-chaining because the handler
      // is typed against optional deps (see IpcHandlerDeps comments); a
      // missing wiring surfaces as a console warning in dev, never as a
      // hard IPC failure. Step 3 is the durable write — it must succeed.
      if (copilotAnalyzerService) {
        copilotAnalyzerService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.archive: copilotAnalyzerService dep unwired — skipping stop()',
        );
      }
      if (copilotEventWindow) {
        copilotEventWindow.clear(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.archive: copilotEventWindow dep unwired — skipping clear()');
      }
      if (routineService) {
        routineService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.archive: routineService dep unwired — skipping stop()');
      }
      companiesRepo.archive(companyId);

      // Invariant #11: IPC channels that mutate state must emit a bus
      // event. Renderer caches subscribe to the bus for invalidation;
      // IPC alone is not enough — see vault-backup.spec.ts regression
      // postmortem. ActorKind is 'user' because the archive is always
      // user-initiated today; if a future M ever adds a scheduled
      // archive (retention policy, etc.) the actor kind will widen.
      if (bus) {
        try {
          bus.emit({
            type: 'company.archived',
            companyId,
            // BUG-005 (Phase 5.6 M-C step d hardening): HUMAN_USER_ID,
            // not literal 'user'. Same rationale as `companies.create`.
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: { companyId, archivedAt: Date.now() },
          });
        } catch (err) {
          console.error('[ipc] companies.archive: bus emit failed (row still archived):', err);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.archive: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async companiesUpdate(req) {
      // --- Input shape guard ---------------------------------------
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] companies.update: request body is required');
      }
      const companyId = typeof req.companyId === 'string' ? req.companyId : '';
      if (companyId.length === 0) {
        throw new Error('[ipc] companies.update: companyId is required');
      }

      // --- Archived-company guard ---------------------------------
      // Reuses the helper step (d) hardening introduced for BUG-002.
      // An archived company is soft-deleted; mutating fields on a
      // tombstoned row would fan out stale bus events and confuse the
      // M-D renderer listing. The helper also throws on unknown ids.
      assertCompanyActive(companiesRepo, companyId, 'companies.update');

      // --- Per-field validation (mirror companies.create) ---------
      const patch: UpdateCompanyInput = {};
      const patchedKeys: Array<'name' | 'slug' | 'settings' | 'icon' | 'theme'> = [];
      if (req.name !== undefined) {
        if (typeof req.name !== 'string') {
          throw new Error('[ipc] companies.update: name must be a string when provided');
        }
        const trimmed = req.name.trim();
        if (trimmed.length === 0) {
          throw new Error(
            '[ipc] companies.update: name must be non-empty after trim when provided',
          );
        }
        if (trimmed.length > 120) {
          throw new Error('[ipc] companies.update: name exceeds 120 chars');
        }
        patch.name = trimmed;
        patchedKeys.push('name');
      }
      if (req.slug !== undefined) {
        if (typeof req.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(req.slug)) {
          throw new Error(
            `[ipc] companies.update: slug "${String(req.slug)}" must match /^[a-z0-9][a-z0-9-]{0,62}$/ (lowercase alphanumerics + hyphen, 1–63 chars, no leading hyphen)`,
          );
        }
        patch.slug = req.slug;
        patchedKeys.push('slug');
      }
      if (req.settings !== undefined) {
        if (
          req.settings === null ||
          typeof req.settings !== 'object' ||
          Array.isArray(req.settings)
        ) {
          throw new Error('[ipc] companies.update: settings must be a plain object when provided');
        }
        patch.settings = req.settings;
        patchedKeys.push('settings');
      }
      if (req.icon !== undefined) {
        // `null` is accepted to clear the icon — the DB column is
        // nullable and the M-D CreateCompanyDialog / CompanySettings
        // panel may wire a "remove icon" action that sends null.
        if (req.icon !== null && typeof req.icon !== 'string') {
          throw new Error('[ipc] companies.update: icon must be a string or null when provided');
        }
        patch.icon = req.icon;
        patchedKeys.push('icon');
      }
      if (req.theme !== undefined) {
        if (typeof req.theme !== 'string') {
          throw new Error('[ipc] companies.update: theme must be a string when provided');
        }
        patch.theme = req.theme;
        patchedKeys.push('theme');
      }

      // --- Durable write ------------------------------------------
      // Empty patch is intentionally allowed — the repo no-ops at the
      // SQL layer and the handler still emits `company.updated` with
      // an empty `patchedKeys` array so the renderer's optimistic
      // update path can reconcile the row's timestamp state even when
      // nothing actually changed (idempotent write-through surface).
      try {
        companiesRepo.update(companyId, patch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') && msg.includes('slug')) {
          throw new Error(`[ipc] companies.update: slug "${String(patch.slug)}" is already in use`);
        }
        throw err;
      }

      // --- Invariant #11: emit bus event --------------------------
      if (bus) {
        try {
          bus.emit({
            type: 'company.updated',
            companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              companyId,
              patchedKeys,
              updatedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error('[ipc] companies.update: bus emit failed (row still updated):', err);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.update: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },

    async companiesDelete(req) {
      // --- Input shape guard ---------------------------------------
      if (!req || typeof req !== 'object') {
        throw new Error('[ipc] companies.delete: request body is required');
      }
      const companyId = typeof req.companyId === 'string' ? req.companyId : '';
      if (companyId.length === 0) {
        throw new Error('[ipc] companies.delete: companyId is required');
      }

      // --- Existence guard (but NOT active guard) ------------------
      // Delete explicitly allows removing archived companies — that is
      // the user-intent "permanently remove a soft-deleted company"
      // path. We still fail loud on a genuinely-missing id so a caller
      // with a stale reference knows to refresh instead of silently
      // no-opping. Snapshot read BEFORE the transaction so the bus
      // event can carry name + slug after the row is gone.
      const snapshot = companiesRepo.getById(companyId);
      if (!snapshot) {
        throw new Error(`[ipc] companies.delete: company not found: ${companyId}`);
      }

      // --- Quiesce copilot pipeline (mirrors companies.archive) ----
      // Stop the analyzer FIRST so a mid-flight tick cannot observe a
      // cleared event window + partially-deleted rows. Clear the window
      // SECOND so a brief interleaving cannot rehydrate it from the
      // events table immediately before the DELETE sweep wipes the
      // company's events rows.
      if (copilotAnalyzerService) {
        copilotAnalyzerService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.delete: copilotAnalyzerService dep unwired — skipping stop()',
        );
      }
      if (copilotEventWindow) {
        copilotEventWindow.clear(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.delete: copilotEventWindow dep unwired — skipping clear()');
      }
      if (routineService) {
        routineService.stop(companyId);
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn('[ipc] companies.delete: routineService dep unwired — skipping stop()');
      }

      // --- Hard delete (transactional 15-table sweep) --------------
      // Repo owns the FK-safe order + db.transaction. A throw inside
      // the transaction rolls every DELETE back, so callers never see
      // a half-deleted company. Any throw here bubbles up — we do NOT
      // rewrap because the repo sweep has no domain-specific error
      // shapes we'd want to map for the renderer (FK violations would
      // surface raw sqlite text; they indicate schema drift and should
      // fail loud for diagnosis).
      companiesRepo.delete(companyId);

      // --- Invariant #11: emit bus event --------------------------
      // ActorKind is 'user' — same rationale as companies.archive.
      // Name + slug come from the pre-transaction snapshot (the row
      // is gone by now; a fresh getById would return null).
      if (bus) {
        try {
          bus.emit({
            type: 'company.deleted',
            companyId,
            actorId: HUMAN_USER_ID,
            actorKind: 'user',
            payload: {
              companyId,
              slug: snapshot.slug,
              name: snapshot.name,
              deletedAt: Date.now(),
            },
          });
        } catch (err) {
          console.error('[ipc] companies.delete: bus emit failed (row still deleted):', err);
        }
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[ipc] companies.delete: bus dep unwired — renderer caches will NOT invalidate',
        );
      }
    },
  };
}
