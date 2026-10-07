/**
 * Production command-palette classifier seam.
 *
 * `createIntentClassifier` (packages/intelligence) is a pure text → JSON
 * transform over an injected `ClassifyCompleteFn`. This module supplies
 * that completer for production: it resolves the palette company's
 * `system-agent` provider through the same `resolveProvider` closure the
 * orchestrator and Enhanced AI `llmComplete` use, streams the classifier's
 * system + user prompts through `streamAgent`, and returns the
 * accumulated text for the classifier to parse.
 *
 * Why it exists: the composition root used to hand the classifier a
 * placeholder that ignored its prompts and always answered
 * `complex_request` at `confidence: 0`, so outside test mode no
 * structured intent ever resolved (audit P1).
 *
 * Failure posture: when no provider can be resolved (company has no
 * system agent, no key configured, stream error) the completer returns
 * the same canned `complex_request` reply the placeholder did. That is
 * exactly the classifier's own exhausted-retry fallback, so the palette
 * still works — the command is routed to the agentic loop — instead of
 * surfacing an error. The first failure is logged; later ones are not,
 * so a machine with no provider configured does not spam the log on
 * every keystroke-submit. A success re-arms the log so a later
 * regression is reported again.
 */

import {
  type ClassifyCompleteFn,
  type IntentClassifier,
  createIntentClassifier,
} from '@team-x/intelligence';
import { type ProviderStreamFn, streamAgent } from '@team-x/provider-router';

/**
 * Canned reply used when no model can answer. Byte-identical to the
 * classifier's own fallback shape so downstream behaviour is the same
 * whether the model was unreachable or replied with unparseable text.
 */
export const CLASSIFIER_FALLBACK_REPLY = JSON.stringify({
  intent: 'complex_request',
  entities: {},
  confidence: 0,
  missingSlots: [],
});

export interface ClassifierCompleteDeps<TEmployee> {
  /** The company's `system-agent` row, or null when the company has none. */
  findSystemAgent: (companyId: string) => TEmployee | null;
  /** Same resolver the orchestrator uses; throws when no provider is usable. */
  resolveProvider: (employee: TEmployee) => Promise<{ stream: ProviderStreamFn }>;
  /**
   * True when the company is over a budget hard cap. Read-only (it must not
   * pause the company or file an approval): the classifier then skips the
   * model and routes the command to the agentic loop, whose own admission
   * gate reports the budget state.
   */
  isBudgetBlocked?: (companyId: string) => boolean;
  /** Abort a classification that has not finished by then. Default 15 s. */
  timeoutMs?: number;
  logger?: { warn: (msg: string, err: unknown) => void };
}

/** A palette submit should not wait longer than this on intent classification. */
export const CLASSIFIER_TIMEOUT_MS = 15_000;

/**
 * Build a per-company completer factory. Per-company because the
 * classifier's `complete()` seam carries only prompts, while provider
 * resolution needs an actor — the palette's company is known only at
 * `classify(text, { companyId })` time (see `createPaletteIntentClassifier`).
 */
export function createClassifierCompleteFor<TEmployee>(
  deps: ClassifierCompleteDeps<TEmployee>,
): (companyId: string) => ClassifyCompleteFn {
  const logger = deps.logger ?? {
    warn: (msg: string, err: unknown) => console.warn('[palette-classifier]', msg, err),
  };
  const timeoutMs = deps.timeoutMs ?? CLASSIFIER_TIMEOUT_MS;
  let warned = false;

  async function streamReply(
    stream: ProviderStreamFn,
    system: string,
    user: string,
    signal: AbortSignal,
  ): Promise<string> {
    let text = '';
    for await (const chunk of streamAgent({
      providerFactory: stream,
      system,
      messages: [{ role: 'user', content: user }],
      signal,
    })) {
      if (chunk.kind === 'delta') {
        text += chunk.delta;
      }
    }
    return text;
  }

  return (companyId) =>
    async ({ system, user }) => {
      if (deps.isBudgetBlocked?.(companyId)) return CLASSIFIER_FALLBACK_REPLY;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const systemAgent = deps.findSystemAgent(companyId);
        if (!systemAgent) {
          throw new Error(`no system-agent for company "${companyId}"`);
        }
        const resolved = await deps.resolveProvider(systemAgent);
        // Abort the stream on timeout, and race it too: a provider that
        // ignores the signal must not hold the palette.
        const text = await Promise.race([
          streamReply(resolved.stream, system, user, controller.signal),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error(`intent classification timed out after ${timeoutMs} ms`));
            }, timeoutMs);
          }),
        ]);
        warned = false;
        return text;
      } catch (err) {
        if (!warned) {
          warned = true;
          logger.warn(
            'no model available for intent classification — routing commands to the agentic loop',
            err,
          );
        }
        return CLASSIFIER_FALLBACK_REPLY;
      } finally {
        clearTimeout(timer);
      }
    };
}

/**
 * `IntentClassifier` that binds the completer to the palette's company on
 * each call. Building the inner classifier per call is cheap (its system
 * prompt is a static string assembly) and keeps the package's factory
 * contract untouched.
 */
export function createPaletteIntentClassifier(deps: {
  completeFor: (companyId: string) => ClassifyCompleteFn;
}): IntentClassifier {
  return {
    classify: (text, context) =>
      createIntentClassifier({ complete: deps.completeFor(context.companyId) }).classify(
        text,
        context,
      ),
  };
}
