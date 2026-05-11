/**
 * Multi-Turn Planning for Agentic Loop
 *
 * Extends the ReAct loop with explicit plan representation,
 * decomposition of complex queries, and progress tracking.
 *
 * Phase 5 — M30 (Phase 3 enhancement).
 */

import type { LoopStep } from './types.js';

/**
 * A step in an execution plan.
 */
export interface PlanStep {
  /** Step ID */
  id: string;

  /** Step description */
  description: string;

  /** Tool to use (if any) */
  tool?: string;

  /** Expected arguments (template) */
  args?: Record<string, unknown>;

  /** Dependencies (step IDs that must complete first) */
  dependencies: string[];

  /** Current status */
  status: PlanStepStatus;

  /** Result (if completed) */
  result?: unknown;

  /** Error (if failed) */
  error?: string;

  /** Estimated difficulty (1-5) */
  difficulty: number;

  /** Whether this step is optional */
  optional: boolean;
}

/**
 * Plan step status.
 */
export type PlanStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'blocked';

/**
 * An execution plan for a complex query.
 */
export interface ExecutionPlan {
  /** Plan ID */
  id: string;

  /** Original user query */
  query: string;

  /** Plan description */
  description: string;

  /** Steps in execution order */
  steps: PlanStep[];

  /** Plan status */
  status: PlanStatus;

  /** Created timestamp */
  createdAt: number;

  /** Updated timestamp */
  updatedAt: number;

  /** Completed step count */
  completedCount: number;

  /** Total step count */
  totalCount: number;

  /** Estimated total tokens */
  estimatedTokens: number;

  /** Plan metadata */
  metadata?: {
    reasoning?: string;
    alternatives?: ExecutionPlan[];
    confidence?: number;
    [key: string]: unknown;
  };
}

/**
 * Plan status.
 */
export type PlanStatus =
  | 'draft'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'abandoned';

/**
 * Plan revision history.
 */
export interface PlanRevision {
  /** Revision ID */
  id: string;

  /** Plan ID this revision belongs to */
  planId: string;

  /** Revision number */
  revision: number;

  /** Previous plan state */
  before: ExecutionPlan;

  /** New plan state */
  after: ExecutionPlan;

  /** Reason for revision */
  reason: string;

  /** Timestamp */
  timestamp: number;

  /** Who/what triggered the revision */
  trigger: 'user' | 'auto' | 'error_recovery';
}

/**
 * Plan tracking options.
 */
export interface PlanTrackingOptions {
  /** Enable automatic plan revision on errors */
  autoRevise: boolean;

  /** Max revisions before giving up */
  maxRevisions: number;

  /** Enable parallel execution of independent steps */
  enableParallel: boolean;

  /** Step timeout in ms */
  stepTimeoutMs: number;

  /** Enable progress streaming */
  streamProgress: boolean;
}

/**
 * Plan executor interface.
 */
export interface PlanExecutor {
  /**
   * Create a plan from a query.
   */
  createPlan(
    query: string,
    context?: {
      conversationHistory?: string[];
      availableTools?: string[];
    },
  ): Promise<ExecutionPlan>;

  /**
   * Execute a plan step by step.
   */
  executePlan(
    plan: ExecutionPlan,
    context: {
      invokeTool: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
      onProgress?: (update: PlanProgressUpdate) => void;
      signal?: AbortSignal;
    },
  ): Promise<ExecutionPlan>;

  /**
   * Revise an existing plan.
   */
  revisePlan(
    plan: ExecutionPlan,
    reason: string,
    trigger: 'user' | 'auto' | 'error_recovery',
  ): Promise<ExecutionPlan>;

  /**
   * Get plan execution status.
   */
  getPlanStatus(planId: string): ExecutionPlan | null;

  /**
   * Get revision history for a plan.
   */
  getRevisionHistory(planId: string): PlanRevision[];

  /**
   * Cancel a running plan.
   */
  cancelPlan(planId: string): boolean;

  /**
   * Convert loop steps to an execution plan.
   */
  stepsToPlan(steps: LoopStep[], query: string): ExecutionPlan;

  /**
   * Convert plan to loop-style description.
   */
  planToDescription(plan: ExecutionPlan): string;
}

/**
 * Plan progress update.
 */
export interface PlanProgressUpdate {
  /** Plan ID */
  planId: string;

  /** Step that was updated */
  stepId: string;

  /** Step status */
  status: PlanStepStatus;

  /** Result (if completed) */
  result?: unknown;

  /** Error (if failed) */
  error?: string;

  /** Overall progress (0-1) */
  progress: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Planning prompt templates.
 */
export const PLANNING_TEMPLATES = {
  /**
   * Template for asking the LLM to create a plan.
   */
  createPlan: `You are a planning assistant. Break down the following query into a step-by-step execution plan.

Query: {{query}}

Available tools: {{tools}}

Respond with a JSON object:
{
  "description": "Brief description of the overall approach",
  "steps": [
    {
      "id": "step_1",
      "description": "What this step does",
      "tool": "tool_name or null",
      "dependencies": [],
      "difficulty": 1-5,
      "optional": false
    }
  ],
  "estimatedTokens": 1000
}`,

  /**
   * Template for plan revision.
   */
  revisePlan: `The following plan has failed at step "{{stepId}}" with error: "{{error}}"

Plan so far:
{{plan}}

Revise the plan to either:
1. Fix the failed step with a different approach
2. Skip the failed step if it's optional
3. Abort if the goal cannot be achieved

Respond with a revised plan JSON object.`,

  /**
   * Template for plan decomposition.
   */
  decompose: `Break down this complex query into sub-queries that can be answered independently, then combined:

Query: {{query}}

Respond with:
{
  "subQueries": ["sub-query 1", "sub-query 2", ...],
  "combineStrategy": "how to combine results"
}`,
};

/**
 * In-memory plan executor implementation.
 */
export function createPlanExecutor(options: {
  llm: (prompt: string) => Promise<string>;
  trackingOptions?: Partial<PlanTrackingOptions>;
  now?: () => number;
  idGen?: () => string;
}): PlanExecutor {
  const now = options.now ?? Date.now;
  const idGen =
    options.idGen ?? (() => `plan_${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`);

  const trackingOptions: PlanTrackingOptions = {
    autoRevise: true,
    maxRevisions: 3,
    enableParallel: false, // Conservative default
    stepTimeoutMs: 30000,
    streamProgress: true,
    ...options.trackingOptions,
  };

  // Store for plans and revisions
  const plans = new Map<string, ExecutionPlan>();
  const revisions = new Map<string, PlanRevision[]>();
  const running = new Set<string>();

  return {
    async createPlan(query, context) {
      const tools = context?.availableTools?.join(', ') || 'various tools';
      const prompt = PLANNING_TEMPLATES.createPlan
        .replace('{{query}}', query)
        .replace('{{tools}}', tools);

      const response = await options.llm(prompt);

      try {
        // biome-ignore lint/suspicious/noExplicitAny: JSON.parse output is intentionally typed as any here because the LLM-emitted shape is unstable and downstream destructuring narrows per-field with fallbacks
        const parsed = JSON.parse(response) as any;
        // biome-ignore lint/suspicious/noExplicitAny: each step entry is destructured field-by-field below with fallbacks; widening to a strict type forces consumers of `args` to handle undefined where the runtime always supplies a Record
        const steps: PlanStep[] = (parsed.steps || []).map((s: any, i: number) => ({
          id: s.id || `step_${i + 1}`,
          description: s.description,
          tool: s.tool,
          args: s.args,
          dependencies: s.dependencies || [],
          status: 'pending' as PlanStepStatus,
          difficulty: s.difficulty || 3,
          optional: s.optional || false,
        }));

        const plan: ExecutionPlan = {
          id: idGen(),
          query,
          description: parsed.description || 'Execution plan',
          steps,
          status: 'draft',
          createdAt: now(),
          updatedAt: now(),
          completedCount: 0,
          totalCount: steps.length,
          estimatedTokens: parsed.estimatedTokens || 1000,
        };

        plans.set(plan.id, plan);
        revisions.set(plan.id, []);

        return plan;
      } catch (_err) {
        // Fallback: create a simple single-step plan
        const plan: ExecutionPlan = {
          id: idGen(),
          query,
          description: 'Direct execution',
          steps: [
            {
              id: 'step_1',
              description: 'Execute the query directly',
              status: 'pending',
              dependencies: [],
              difficulty: 3,
              optional: false,
            },
          ],
          status: 'draft',
          createdAt: now(),
          updatedAt: now(),
          completedCount: 0,
          totalCount: 1,
          estimatedTokens: 500,
        };

        plans.set(plan.id, plan);
        revisions.set(plan.id, []);

        return plan;
      }
    },

    async executePlan(plan, context) {
      plan.status = 'in_progress';
      plan.updatedAt = now();
      running.add(plan.id);

      try {
        // Topological sort by dependencies
        const executionOrder = topologicalSort(plan);

        let completed = 0;
        const stepResults = new Map<string, unknown>();

        for (const stepId of executionOrder) {
          // Check cancellation
          if (context.signal?.aborted) {
            plan.status = 'abandoned';
            break;
          }

          const step = plan.steps.find((s) => s.id === stepId);
          if (!step) continue;

          // Check if blocked
          const blocked = step.dependencies.some((depId) => {
            const depStep = plan.steps.find((s) => s.id === depId);
            return depStep && depStep.status === 'failed';
          });

          if (blocked) {
            step.status = 'blocked';
            continue;
          }

          // Execute step
          step.status = 'in_progress';
          plan.updatedAt = now();

          if (context.onProgress) {
            context.onProgress({
              planId: plan.id,
              stepId: step.id,
              status: step.status,
              progress: completed / plan.totalCount,
              timestamp: now(),
            });
          }

          if (step.tool && context.invokeTool) {
            try {
              const result = await context.invokeTool(step.tool, step.args || {});

              step.result = result;
              step.status = 'completed';
              stepResults.set(step.id, result);
              completed++;
              plan.completedCount = completed;

              if (context.onProgress) {
                context.onProgress({
                  planId: plan.id,
                  stepId: step.id,
                  status: 'completed',
                  result,
                  progress: completed / plan.totalCount,
                  timestamp: now(),
                });
              }
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              step.error = error;

              if (step.optional) {
                step.status = 'skipped';
              } else if (trackingOptions.autoRevise) {
                step.status = 'failed';
                // Auto-revise plan
                const revisedPlan = await this.revisePlan(
                  plan,
                  `Step failed: ${error}`,
                  'error_recovery',
                );
                // Restart execution with revised plan
                return this.executePlan(revisedPlan, context);
              } else {
                step.status = 'failed';
                plan.status = 'failed';
                break;
              }
            }
          } else {
            // Non-tool step - mark as completed
            step.status = 'completed';
            completed++;
            plan.completedCount = completed;
          }
        }

        // Check if all required steps completed
        const requiredSteps = plan.steps.filter((s) => !s.optional);
        const allCompleted = requiredSteps.every((s) => s.status === 'completed');

        if (allCompleted) {
          plan.status = 'completed';
        } else if (plan.status !== 'failed' && plan.status !== 'abandoned') {
          plan.status = 'completed'; // Partial completion is OK
        }

        plan.updatedAt = now();
        return plan;
      } finally {
        running.delete(plan.id);
      }
    },

    async revisePlan(plan, reason, trigger) {
      const revisionNum = (revisions.get(plan.id)?.length ?? 0) + 1;

      if (revisionNum > trackingOptions.maxRevisions) {
        plan.status = 'failed';
        plan.metadata = {
          ...plan.metadata,
          error: 'Max revisions exceeded',
        };
        return plan;
      }

      // Create revision record
      const beforePlan = JSON.parse(JSON.stringify(plan)) as ExecutionPlan;

      // Simple revision strategy: mark failed step as optional or retry
      const failedStep = plan.steps.find((s) => s.status === 'failed');

      if (failedStep) {
        if (revisionNum === 1) {
          // First revision: try to fix by retrying
          failedStep.status = 'pending';
          failedStep.error = undefined;
        } else {
          // Later revisions: mark as optional
          failedStep.optional = true;
          failedStep.status = 'skipped';
        }
      }

      plan.updatedAt = now();
      plan.completedCount = plan.steps.filter((s) => s.status === 'completed').length;

      const revision: PlanRevision = {
        id: idGen(),
        planId: plan.id,
        revision: revisionNum,
        before: beforePlan,
        after: JSON.parse(JSON.stringify(plan)) as ExecutionPlan,
        reason,
        timestamp: now(),
        trigger,
      };

      const planRevisions = revisions.get(plan.id) ?? [];
      planRevisions.push(revision);
      revisions.set(plan.id, planRevisions);

      return plan;
    },

    getPlanStatus(planId) {
      return plans.get(planId) ?? null;
    },

    getRevisionHistory(planId) {
      return revisions.get(planId) ?? [];
    },

    cancelPlan(planId) {
      if (running.has(planId)) {
        running.delete(planId);
        const plan = plans.get(planId);
        if (plan) {
          plan.status = 'abandoned';
          plan.updatedAt = now();
        }
        return true;
      }
      return false;
    },

    stepsToPlan(steps, query) {
      const planSteps: PlanStep[] = [];

      for (const step of steps) {
        if (step.kind === 'plan') {
          planSteps.push({
            id: `step_${planSteps.length + 1}`,
            description: step.text,
            status: 'completed',
            dependencies: [],
            difficulty: 1,
            optional: false,
          });
        } else if (step.kind === 'tool_call') {
          planSteps.push({
            id: `step_${planSteps.length + 1}`,
            description: `Call ${step.toolName}`,
            tool: step.toolName,
            args: step.args,
            status: 'completed',
            dependencies: [],
            difficulty: 2,
            optional: false,
            result: step.telemetry,
          });
        } else if (step.kind === 'tool_result') {
          const lastStep = planSteps[planSteps.length - 1];
          if (lastStep) {
            lastStep.result = step.result;
            lastStep.status = 'completed';
          }
        } else if (step.kind === 'answer') {
          planSteps.push({
            id: 'final',
            description: 'Final answer',
            status: 'completed',
            dependencies: [],
            difficulty: 1,
            optional: false,
            result: step.text,
          });
        }
      }

      return {
        id: idGen(),
        query,
        description: 'Executed plan from loop steps',
        steps: planSteps,
        status: 'completed',
        createdAt: now(),
        updatedAt: now(),
        completedCount: planSteps.filter((s) => s.status === 'completed').length,
        totalCount: planSteps.length,
        estimatedTokens: 0,
      };
    },

    planToDescription(plan) {
      const lines = [
        `Plan: ${plan.description}`,
        '',
        `Steps (${plan.completedCount}/${plan.totalCount} completed):`,
      ];

      for (const step of plan.steps) {
        const statusIcon =
          step.status === 'completed'
            ? '✅'
            : step.status === 'failed'
              ? '❌'
              : step.status === 'in_progress'
                ? '🔄'
                : step.status === 'blocked'
                  ? '🚫'
                  : step.status === 'skipped'
                    ? '⏭️'
                    : '⏳';

        lines.push(`  ${statusIcon} ${step.description}`);

        if (step.tool) {
          lines.push(`     Tool: ${step.tool}`);
        }
        if (step.dependencies.length > 0) {
          lines.push(`     After: ${step.dependencies.join(', ')}`);
        }
      }

      return lines.join('\n');
    },
  };
}

/**
 * Topologically sort plan steps so dependencies execute before dependents.
 * Throws on circular dependencies.
 */
function topologicalSort(plan: ExecutionPlan): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (stepId: string) => {
    if (visited.has(stepId)) return;
    if (visiting.has(stepId)) {
      throw new Error(`Circular dependency detected involving ${stepId}`);
    }

    visiting.add(stepId);

    const step = plan.steps.find((s) => s.id === stepId);
    if (step) {
      for (const dep of step.dependencies) {
        visit(dep);
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);
    sorted.push(stepId);
  };

  for (const step of plan.steps) {
    visit(step.id);
  }

  return sorted;
}

/**
 * Create a plan-enhanced agentic loop wrapper.
 */
export function createPlanAwareLoop(options: {
  executor: PlanExecutor;
  enablePlanning: boolean;
  planningThreshold: number; // Minimum query complexity to trigger planning
}): {
  shouldCreatePlan: (query: string, estimatedSteps?: number) => boolean;
  wrapLoopExecution: (
    // biome-ignore lint/suspicious/noExplicitAny: runLoop's return type varies per caller and is consumed opaquely by the wrapper
    runLoop: () => Promise<any>,
    query: string,
    // biome-ignore lint/suspicious/noExplicitAny: same — result is opaque
  ) => Promise<{ result: any; plan?: ExecutionPlan }>;
} {
  return {
    shouldCreatePlan(query, estimatedSteps = 1) {
      if (!options.enablePlanning) return false;

      // Simple heuristic: plan for complex queries
      const complexity = query.length + estimatedSteps * 100;
      return complexity >= options.planningThreshold;
    },

    async wrapLoopExecution(runLoop, query) {
      // If query is simple enough, run directly
      if (!this.shouldCreatePlan(query)) {
        const result = await runLoop();
        return { result };
      }

      // Otherwise, create and execute a plan
      await options.executor.createPlan(query);

      // The plan execution will handle calling tools
      // For now, we'll run the original loop and track it
      const result = await runLoop();

      // Convert loop steps to plan for tracking
      const trackedPlan = options.executor.stepsToPlan(result.steps || [], query);

      return { result, plan: trackedPlan };
    },
  };
}
