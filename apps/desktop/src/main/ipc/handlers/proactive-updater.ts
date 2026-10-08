import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';

export type ProactiveUpdaterHandlers = Pick<
  IpcHandlers,
  | 'proactiveSetEnabled'
  | 'proactiveDecomposeGoal'
  | 'proactiveScanForWork'
  | 'proactiveGetState'
  | 'updaterCheck'
  | 'updaterInstall'
>;

export function createProactiveUpdaterHandlers(ctx: HandlerContext): ProactiveUpdaterHandlers {
  const { proactiveTriggerService, updaterService } = ctx;
  return {
    // -----------------------------------------------------------------------
    // Proactive execution (Phase 6 — Slice 3)
    // -----------------------------------------------------------------------

    async proactiveSetEnabled({ companyId, enabled }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.setEnabled: companyId is required');
      }
      if (typeof enabled !== 'boolean') {
        throw new Error('[ipc] proactive.setEnabled: enabled must be a boolean');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.setEnabled: proactiveTriggerService dep is required');
      }
      // Per-company ONLY. The trigger service persists the choice into this
      // company's settings JSON, so it survives restart and never touches
      // another company. The workspace-wide master flag
      // (`settings.proactive_enabled`) is written exclusively through
      // `settings.setProactive` — writing it here made one company's switch
      // flip proactive work for every company.
      proactiveTriggerService.setEnabled({ companyId, enabled });
    },

    async proactiveDecomposeGoal({ companyId, goalId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.decomposeGoal: companyId is required');
      }
      if (typeof goalId !== 'string' || goalId.length === 0) {
        throw new Error('[ipc] proactive.decomposeGoal: goalId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.decomposeGoal: proactiveTriggerService dep is required');
      }
      await proactiveTriggerService.decomposeGoal({ companyId, goalId });
      return { success: true };
    },

    async proactiveScanForWork({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.scanForWork: companyId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.scanForWork: proactiveTriggerService dep is required');
      }
      const result = await proactiveTriggerService.scanForWork({ companyId });
      return { queuedCount: result.queuedCount };
    },

    async proactiveGetState({ companyId }) {
      if (typeof companyId !== 'string' || companyId.length === 0) {
        throw new Error('[ipc] proactive.getState: companyId is required');
      }
      if (!proactiveTriggerService) {
        throw new Error('[ipc] proactive.getState: proactiveTriggerService dep is required');
      }
      const enabled = proactiveTriggerService.isEnabled(companyId);
      // Counters come from the service's observed runtime state — the
      // dashboard tiles that render them ("Active Work", "Queued Work",
      // "Last Scan") must never show synthesized values.
      const state = proactiveTriggerService.getState(companyId);
      return {
        enabled,
        activeWork: state.activeWork,
        queuedWork: state.queuedWork,
        lastScanAt: state.lastScanAt,
      };
    },

    // -----------------------------------------------------------------------
    // Updater (Phase 4 — M25)
    // -----------------------------------------------------------------------

    async updaterCheck() {
      return updaterService.checkForUpdate();
    },

    async updaterInstall() {
      return updaterService.downloadAndInstall();
    },
  };
}
