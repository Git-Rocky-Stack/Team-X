/**
 * Process-wide state owned by app.whenReady() — held on one shared mutable
 * object so the boot phases, the closures they hand to services, and the
 * will-quit handler all read the same live handle. Every handle defaults to
 * null until the app has booted; the shutdown path is null-safe so an early
 * crash before whenReady completes still cleans up gracefully.
 *
 * Always read and write `runtime.<handle>` at the point of use. Copying a
 * handle into a local (or a deps object) snapshots it: a closure that checks
 * `runtime.orchestrator` sees the instance once it is built and `null` again
 * after shutdown, while a copied value would see neither change.
 */

import type { HeartbeatService } from '../orchestrator/heartbeat-service.js';
import type { Orchestrator } from '../orchestrator/index.js';
import type { AgenticLoopService } from '../services/agentic-loop-service.js';
import type { createApprovalInboxService } from '../services/approval-inbox-service.js';
import type { createBudgetGovernanceService } from '../services/budget-governance-service.js';
import type { CommandService } from '../services/command-service.js';
import type { CopilotAnalyzerService } from '../services/copilot-analyzer-service.js';
import type { CopilotEventTrigger } from '../services/copilot-event-trigger.js';
import type { CopilotEventWindow } from '../services/copilot-event-window.js';
import type { HfService } from '../services/local-gguf/hf-service.js';
import type { LibraryService } from '../services/local-gguf/library-service.js';
import type { PoolService } from '../services/local-gguf/pool-service.js';
import type { McpHost } from '../services/mcp-host.js';
import type { ProactiveTriggerService } from '../services/proactive-trigger-service.js';
import type { RoutineService } from '../services/routine-service.js';

export interface RuntimeState {
  orchestrator: Orchestrator | null;
  unregisterIpc: (() => void) | null;
  mcpHostInstance: McpHost | null;
  ragIndexerInstance: { stop: () => void } | null;
  /**
   * CopilotEventWindow — M33 T3. In-memory bounded rolling buffer of
   * dashboard events keyed per company. Started after the event bus is
   * wired; consumed by the T4 CopilotAnalyzerService. Held as a module
   * handle for graceful shutdown alongside the other subscribers.
   */
  copilotEventWindowInstance: CopilotEventWindow | null;
  commandServiceInstance: CommandService | null;
  /**
   * Heartbeat loop (proactive execution engine) — a self-scheduling timer that
   * polls the DB for due wakeup work and emits `agent.wakeup` events. Held at
   * module scope so the shutdown path can stop it before the DB closes;
   * otherwise its interval/initial-timeout fire repo reads against a closed
   * connection during quit.
   */
  heartbeatServiceInstance: HeartbeatService | null;
  /**
   * Agentic-loop front-door for the command palette's `complex_request`
   * intent (M31 T4). Lives alongside the orchestrator because its
   * pause-gate observer reads `orchestrator.isCompanyPaused` on every
   * provider completion. Nullable at boot for symmetry with the other
   * tear-down handles and to stay safe during early-crash cleanup.
   */
  agenticLoopServiceInstance: AgenticLoopService | null;
  /**
   * Copilot analyzer (M33 T4) — periodic + event-triggered scheduler
   * producing proactive insights for each company. Observes the
   * orchestrator pause gate on every provider call (same discipline as
   * the agentic loop); writes runs with kind='copilot' via migration
   * 0012; fans out `copilot.insight`/`copilot.analyzed`/`copilot.expired`
   * on the bus.
   */
  copilotAnalyzerServiceInstance: CopilotAnalyzerService | null;
  proactiveTriggerServiceInstance: ProactiveTriggerService | null;
  routineServiceInstance: RoutineService | null;
  budgetGovernanceServiceInstance: ReturnType<typeof createBudgetGovernanceService> | null;
  approvalInboxServiceInstance: ReturnType<typeof createApprovalInboxService> | null;
  /**
   * Copilot event trigger (M33 T4) — bus subscriber that debounces
   * meeting.ended / ticket.closed / goal.progressChanged /
   * agentic.failed-budget_exhausted into supplementary analyzer ticks
   * per Phase 5 §8.5. Separated from the window (T3) for test isolation.
   */
  copilotEventTriggerInstance: CopilotEventTrigger | null;
  /**
   * Local GGUF model pool (v3.3.0 Phase 2). Held at module scope so the
   * will-quit handler can `shutdownAll()` its child llama-server processes
   * before the SQLite handle closes.
   */
  poolServiceInstance: PoolService | null;
  /**
   * Local GGUF library service (v3.3.0 Phase 3). Held at module scope so the
   * will-quit handler can `dispose()` its live chokidar folder watchers and
   * network-share resilience monitors before the SQLite handle closes.
   */
  libraryServiceInstance: LibraryService | null;
  /**
   * Hugging Face download manager (v3.3.0 Phase 7). Held at module scope so the
   * will-quit handler can pause every in-flight transfer: `dispose()` aborts the
   * requests but leaves each `.part` file on disk, so a quit mid-download costs
   * the user nothing but the seconds since the last byte — the next launch
   * resumes from the same offset.
   */
  hfServiceInstance: HfService | null;
}

export const runtime: RuntimeState = {
  orchestrator: null,
  unregisterIpc: null,
  mcpHostInstance: null,
  ragIndexerInstance: null,
  copilotEventWindowInstance: null,
  commandServiceInstance: null,
  heartbeatServiceInstance: null,
  agenticLoopServiceInstance: null,
  copilotAnalyzerServiceInstance: null,
  proactiveTriggerServiceInstance: null,
  routineServiceInstance: null,
  budgetGovernanceServiceInstance: null,
  approvalInboxServiceInstance: null,
  copilotEventTriggerInstance: null,
  poolServiceInstance: null,
  libraryServiceInstance: null,
  hfServiceInstance: null,
};
