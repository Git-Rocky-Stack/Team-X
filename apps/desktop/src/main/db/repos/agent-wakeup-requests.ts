/**
 * Agent wakeup requests repository — manages proactive agent execution queue.
 *
 * This repository handles the scheduling, prioritization, and lifecycle of
 * agent wakeup requests. It provides the foundation for transforming Team-X
 * from reactive (agents only respond to chat) to proactive (agents wake up
 * to work on assigned tasks, routines, and goals autonomously).
 *
 * Key operations:
 * - Queue wakeup requests with priority and scheduling
 * - Process pending requests in priority order
 * - Retry failed requests with exponential backoff
 * - Track wakeup history and execution results
 */

import { and, asc, desc, eq, gt, isNotNull, lte, or } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { agentWakeupRequests } from '../schema.js';

export type AgentWakeupRequestRow = typeof agentWakeupRequests.$inferSelect;

export interface CreateAgentWakeupInput {
  companyId: string;
  agentId: string;
  triggerType: 'routine' | 'ticket_assigned' | 'schedule' | 'manual' | 'goal_decomposed';
  triggerId?: string;
  priority?: number;
  scheduledFor?: number;
  context?: unknown;
}

export interface UpdateAgentWakeupInput {
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  startedAt?: number;
  completedAt?: number;
  attemptCount?: number;
  nextRetryAt?: number;
  result?: Record<string, unknown>;
}

type AgentWakeupRequestsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createAgentWakeupRequestsRepo<TRunResult>(db: AgentWakeupRequestsDb<TRunResult>) {
  return {
    /**
     * Queue a new agent wakeup request and return its id.
     */
    create(input: CreateAgentWakeupInput): string {
      const id = nanoid();
      const now = Date.now();

      db.insert(agentWakeupRequests)
        .values({
          id,
          companyId: input.companyId,
          agentId: input.agentId,
          status: 'pending',
          triggerType: input.triggerType,
          triggerId: input.triggerId ?? null,
          priority: input.priority ?? 50,
          scheduledFor: input.scheduledFor ?? now,
          attemptCount: 0,
          maxAttempts: 4,
          contextJson: JSON.stringify(input.context ?? {}),
          resultJson: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      return id;
    },

    /**
     * Return the wakeup request with a matching id, or null if none exists.
     */
    getById(id: string): AgentWakeupRequestRow | null {
      const row = db.select().from(agentWakeupRequests).where(eq(agentWakeupRequests.id, id)).get();
      return row ?? null;
    },

    /**
     * Return all wakeup requests for a specific company.
     */
    listByCompany(companyId: string): AgentWakeupRequestRow[] {
      return db
        .select()
        .from(agentWakeupRequests)
        .where(eq(agentWakeupRequests.companyId, companyId))
        .orderBy(desc(agentWakeupRequests.priority), asc(agentWakeupRequests.scheduledFor))
        .all();
    },

    /**
     * Return all wakeup requests for a specific agent.
     */
    listByAgent(agentId: string): AgentWakeupRequestRow[] {
      return db
        .select()
        .from(agentWakeupRequests)
        .where(eq(agentWakeupRequests.agentId, agentId))
        .orderBy(desc(agentWakeupRequests.scheduledFor))
        .all();
    },

    /**
     * Return pending wakeup requests that are due to execute.
     */
    listPendingDue(companyId: string): AgentWakeupRequestRow[] {
      const now = Date.now();
      return db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.status, 'pending'),
            lte(agentWakeupRequests.scheduledFor, now),
          ),
        )
        .orderBy(desc(agentWakeupRequests.priority), asc(agentWakeupRequests.scheduledFor))
        .all();
    },

    /**
     * Return failed wakeup requests that are due for retry.
     */
    listFailedDueForRetry(companyId: string): AgentWakeupRequestRow[] {
      const now = Date.now();
      return db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.status, 'failed'),
            isNotNull(agentWakeupRequests.completedAt),
            gt(agentWakeupRequests.attemptCount, 0), // Has been attempted at least once
            lte(agentWakeupRequests.nextRetryAt, now), // Retry time has passed
          ),
        )
        .orderBy(asc(agentWakeupRequests.nextRetryAt))
        .all();
    },

    /**
     * Return wakeup requests by trigger type (e.g., all routine wakeups).
     */
    listByTriggerType(companyId: string, triggerType: string): AgentWakeupRequestRow[] {
      return db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.triggerType, triggerType),
          ),
        )
        .orderBy(desc(agentWakeupRequests.scheduledFor))
        .all();
    },

    /**
     * Update a wakeup request by id. Only updates fields that are provided.
     */
    update(id: string, input: UpdateAgentWakeupInput): void {
      const now = Date.now();
      const updates: Record<string, unknown> = { updatedAt: now };

      if (input.status !== undefined) {
        updates.status = input.status;
      }
      if (input.startedAt !== undefined) {
        updates.startedAt = input.startedAt;
      }
      if (input.completedAt !== undefined) {
        updates.completedAt = input.completedAt;
      }
      if (input.attemptCount !== undefined) {
        updates.attemptCount = input.attemptCount;
      }
      if (input.nextRetryAt !== undefined) {
        updates.nextRetryAt = input.nextRetryAt;
      }
      if (input.result !== undefined) {
        updates.resultJson = JSON.stringify(input.result);
      }

      db.update(agentWakeupRequests).set(updates).where(eq(agentWakeupRequests.id, id)).run();
    },

    /**
     * Mark a wakeup request as processing and set the start time.
     */
    markAsProcessing(id: string): void {
      const now = Date.now();
      db.update(agentWakeupRequests)
        .set({
          status: 'processing',
          startedAt: now,
          updatedAt: now,
        })
        .where(eq(agentWakeupRequests.id, id))
        .run();
    },

    /**
     * Mark a wakeup request as completed with result data.
     */
    markAsCompleted(id: string, result: Record<string, unknown>): void {
      const now = Date.now();
      db.update(agentWakeupRequests)
        .set({
          status: 'completed',
          completedAt: now,
          resultJson: JSON.stringify(result),
          updatedAt: now,
        })
        .where(eq(agentWakeupRequests.id, id))
        .run();
    },

    /**
     * Mark a wakeup request as failed and schedule retry with exponential backoff.
     * Returns the next retry delay in milliseconds, or null if max attempts reached.
     */
    markAsFailedWithRetry(id: string, error: string, maxAttempts = 4): number | null {
      const existing = this.getById(id);
      if (!existing) return null;

      const attemptCount = (existing.attemptCount ?? 0) + 1;
      if (attemptCount >= maxAttempts) {
        // Max attempts reached, mark as permanently failed
        this.update(id, {
          status: 'failed',
          completedAt: Date.now(),
          attemptCount,
          result: { error: 'Max retry attempts exceeded', lastError: error },
        });
        return null;
      }

      // Calculate exponential backoff with jitter
      // Delays: 2min, 10min, 30min, 2hr
      const baseDelays = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];
      const defaultBaseDelay = 2 * 60 * 1000;
      const baseDelay =
        baseDelays[Math.min(attemptCount - 1, baseDelays.length - 1)] ?? defaultBaseDelay;
      const jitter = (Math.random() - 0.5) * 0.5 * baseDelay; // ±25% jitter
      const retryDelay = Math.max(baseDelay + jitter, 60 * 1000); // At least 1 minute
      const nextRetryAt = Date.now() + retryDelay;

      this.update(id, {
        status: 'failed',
        completedAt: Date.now(),
        attemptCount,
        nextRetryAt: nextRetryAt,
        result: { error, attemptCount, retryDelayMs: retryDelay },
      });

      return retryDelay;
    },

    /**
     * Cancel a pending wakeup request.
     */
    cancel(id: string): void {
      const now = Date.now();
      db.update(agentWakeupRequests)
        .set({
          status: 'cancelled',
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(agentWakeupRequests.id, id))
        .run();
    },

    /**
     * Delete old completed wakeup requests (cleanup utility).
     */
    deleteOldCompleted(beforeTimestamp: number): number {
      const result = db
        .delete(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.status, 'completed'),
            lte(agentWakeupRequests.createdAt, beforeTimestamp),
          ),
        )
        .run() as unknown as { changes: number };
      return result.changes;
    },

    /**
     * Return companies that currently have due wakeup work. The heartbeat
     * loop uses this so it can stay repo-driven instead of depending on
     * the broader companies table.
     */
    listCompaniesWithDueWork(): string[] {
      const now = Date.now();
      const rows = db
        .select({ companyId: agentWakeupRequests.companyId })
        .from(agentWakeupRequests)
        .where(
          or(
            and(
              eq(agentWakeupRequests.status, 'pending'),
              lte(agentWakeupRequests.scheduledFor, now),
            ),
            and(
              eq(agentWakeupRequests.status, 'failed'),
              isNotNull(agentWakeupRequests.nextRetryAt),
              lte(agentWakeupRequests.nextRetryAt, now),
            ),
          ),
        )
        .all();
      return Array.from(new Set(rows.map((row) => row.companyId)));
    },

    /**
     * Get wakeup statistics for a company.
     */
    getStats(companyId: string): {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    } {
      const pending = db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.status, 'pending'),
          ),
        )
        .all().length;

      const processing = db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.status, 'processing'),
          ),
        )
        .all().length;

      const completed = db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.status, 'completed'),
          ),
        )
        .all().length;

      const failed = db
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, companyId),
            eq(agentWakeupRequests.status, 'failed'),
          ),
        )
        .all().length;

      return { pending, processing, completed, failed };
    },
  };
}

export type AgentWakeupRequestsRepo = ReturnType<typeof createAgentWakeupRequestsRepo>;
