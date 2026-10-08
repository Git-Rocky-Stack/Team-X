import { app } from 'electron';

import { closeDb } from '../db/client.js';

import { runtime } from './runtime-state.js';

/**
 * Graceful shutdown — runs once on app teardown. Order matters:
 *
 *   1. Stop the orchestrator first so no new turns fire and any
 *      in-flight runs get a chance to complete (or surface their
 *      `work.failed` events to subscribers that are still alive).
 *   2. Tear down the IPC layer so the renderer cannot fire late
 *      invokes that would land on a half-disposed handler.
 *   3. Close the SQLite handle last — anything above this line might
 *      still want to write a final row.
 *
 * Errors at every step are caught and logged. The will-quit hook
 * MUST return promptly even if a step rejects, otherwise Electron
 * sits waiting for the event loop to drain.
 */
export function registerGracefulShutdown(): void {
  app.on('will-quit', (event) => {
    if (
      runtime.orchestrator === null &&
      runtime.unregisterIpc === null &&
      runtime.ragIndexerInstance === null &&
      runtime.copilotEventWindowInstance === null &&
      runtime.copilotEventTriggerInstance === null &&
      runtime.copilotAnalyzerServiceInstance === null &&
      runtime.commandServiceInstance === null &&
      runtime.agenticLoopServiceInstance === null &&
      runtime.poolServiceInstance === null &&
      runtime.libraryServiceInstance === null
    ) {
      closeDb();
      return;
    }
    // Defer the actual quit until shutdown completes. The original
    // implementation called `app.quit()` after the async chain, which
    // re-fires `will-quit` recursively — the second pass took the
    // null-state branch above and let Electron continue, but the cycle
    // turned out to be racy under Playwright's `app.close()` driver
    // and the process never exited. Switching to `app.exit(0)` short-
    // circuits the event loop entirely after our shutdown chain is
    // complete, which is exactly what we want here: shutdown is done,
    // there is nothing left to clean up, just terminate. Production
    // users see the same behaviour — the renderer windows are already
    // closed by the time will-quit fires, so there is no UI to lose.
    event.preventDefault();
    void (async () => {
      // Stop the heartbeat loop FIRST: it is a self-scheduling timer that
      // queries the DB (listCompaniesWithDueWork) and emits agent.wakeup events
      // into the orchestrator. Stopping it before anything else guarantees no
      // new proactive work is queued during teardown and no interval/initial
      // timeout fires a repo read after closeDb() — previously surfaced as
      // post-shutdown "database connection is not open" unhandled rejections.
      try {
        if (runtime.heartbeatServiceInstance !== null) {
          runtime.heartbeatServiceInstance.stop();
          runtime.heartbeatServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] heartbeat service stop failed:', err);
      }
      // Stop the RAG indexer BEFORE draining the orchestrator: the indexer
      // subscribes to the event bus, and the orchestrator writes events
      // during its drain. Stopping the subscriber first means any final
      // drain events simply have no listener — no in-flight embed call
      // can land while the process is tearing down.
      try {
        if (runtime.ragIndexerInstance !== null) {
          runtime.ragIndexerInstance.stop();
          runtime.ragIndexerInstance = null;
        }
      } catch (err) {
        console.error('[main] rag indexer stop failed:', err);
      }
      // Stop the CopilotEventWindow alongside the RAG indexer — both are
      // pure bus subscribers with no I/O of their own, so ordering
      // relative to each other is irrelevant. Stopping here prevents
      // the subscriber from observing drain-phase events.
      try {
        if (runtime.copilotEventWindowInstance !== null) {
          runtime.copilotEventWindowInstance.stop();
          runtime.copilotEventWindowInstance = null;
        }
      } catch (err) {
        console.error('[main] copilot event window stop failed:', err);
      }
      // Stop the CopilotEventTrigger — also a pure bus subscriber; its
      // debounce timers are cleared on stop() so no delayed tick fires
      // after teardown.
      try {
        if (runtime.copilotEventTriggerInstance !== null) {
          runtime.copilotEventTriggerInstance.stop();
          runtime.copilotEventTriggerInstance = null;
        }
      } catch (err) {
        console.error('[main] copilot event trigger stop failed:', err);
      }
      // Stop the CopilotAnalyzerService — clears every per-company
      // schedule (setInterval timers) and aborts any in-flight tick via
      // its stopAll() method. Nulling the handle releases the closure
      // refs so the orchestrator drain can proceed without the analyzer
      // re-binding to a stale reference.
      try {
        if (runtime.copilotAnalyzerServiceInstance !== null) {
          runtime.copilotAnalyzerServiceInstance.stopAll();
          runtime.copilotAnalyzerServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] copilot analyzer stop failed:', err);
      }
      try {
        if (runtime.routineServiceInstance !== null) {
          runtime.routineServiceInstance.stopAll();
          runtime.routineServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] routine service stop failed:', err);
      }
      // Stop the CommandService BEFORE the orchestrator drain (M29 T6
      // learning): any in-flight `command.execute` that is mid-dispatch
      // would otherwise enqueue a fresh orchestrator turn after the
      // drain has started. Stopping first closes its accept-loop; the
      // existing handler promises complete against the still-live
      // orchestrator since JS's microtask queue drains ahead of the
      // next `await`.
      try {
        if (runtime.commandServiceInstance !== null) {
          runtime.commandServiceInstance.stop();
          runtime.commandServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] command service stop failed:', err);
      }
      // Null the agentic-loop service handle — in-flight runs hold
      // their own AbortController + background IIFE, so they naturally
      // settle when the process terminates. Nulling prevents shutdown
      // re-entry from observing a stale handle and re-triggering the
      // full cleanup chain. A future milestone can add a drain-all
      // helper if we ever see ghost runs; for now the orchestrator
      // drain upstream covers the common case.
      try {
        if (runtime.agenticLoopServiceInstance !== null) {
          runtime.agenticLoopServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] agentic loop service teardown failed:', err);
      }
      // Kill the pool's child llama-server processes BEFORE the orchestrator
      // drain + DB close: they are spawned native subprocesses holding ports and
      // model files, so they must not outlive the app. shutdownAll() awaits each
      // SIGTERM→SIGKILL teardown; nulling the handle prevents shutdown re-entry
      // from re-triggering it.
      try {
        if (runtime.poolServiceInstance !== null) {
          await runtime.poolServiceInstance.shutdownAll();
          runtime.poolServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] local-gguf pool shutdown failed:', err);
      }
      // Pause every in-flight Hugging Face download BEFORE the DB close. The
      // abort leaves each `.part` file intact, so quitting mid-download costs
      // only the bytes in flight and the next launch resumes from that offset.
      // Non-fatal: a failure here must never block the quit.
      try {
        if (runtime.hfServiceInstance !== null) {
          await runtime.hfServiceInstance.dispose();
          runtime.hfServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] local-gguf HF download dispose failed:', err);
      }
      // Tear down the library service's live chokidar folder watchers and
      // network-share resilience monitors BEFORE the DB close: they hold FS
      // handles + polling timers that must not outlive the app. dispose() is
      // idempotent; nulling the handle prevents shutdown re-entry re-triggering it.
      try {
        if (runtime.libraryServiceInstance !== null) {
          await runtime.libraryServiceInstance.dispose();
          runtime.libraryServiceInstance = null;
        }
      } catch (err) {
        console.error('[main] local-gguf library dispose failed:', err);
      }
      try {
        if (runtime.orchestrator !== null) {
          await runtime.orchestrator.shutdown();
          runtime.orchestrator = null;
        }
      } catch (err) {
        console.error('[main] orchestrator shutdown failed:', err);
      }
      try {
        if (runtime.unregisterIpc !== null) {
          runtime.unregisterIpc();
          runtime.unregisterIpc = null;
        }
      } catch (err) {
        console.error('[main] ipc unregister failed:', err);
      }
      try {
        if (runtime.mcpHostInstance !== null) {
          await runtime.mcpHostInstance.shutdown();
          runtime.mcpHostInstance = null;
        }
      } catch (err) {
        console.error('[main] MCP host shutdown failed:', err);
      }
      try {
        closeDb();
      } catch (err) {
        console.error('[main] closeDb failed:', err);
      }
      console.log('[main] shutdown complete, exiting');
      app.exit(0);
    })();
  });
}
