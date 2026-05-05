import type { TicketCheckoutStatus } from '@team-x/shared-types';
import { and, desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { ticketCheckouts } from '../schema.js';

export type TicketCheckoutRow = typeof ticketCheckouts.$inferSelect;

export interface ClaimTicketCheckoutInput {
  companyId: string;
  ticketId: string;
  employeeId: string;
  runtimeSessionId?: string | null;
  runId?: string | null;
  expiresAt: number;
  now?: number;
}

export type ClaimTicketCheckoutResult =
  | { outcome: 'claimed'; checkout: TicketCheckoutRow }
  | { outcome: 'already-owned-by-self'; checkout: TicketCheckoutRow }
  | {
      outcome: 'expired-reclaimed';
      checkout: TicketCheckoutRow;
      previousCheckout: TicketCheckoutRow;
    }
  | { outcome: 'conflict'; conflictingCheckout: TicketCheckoutRow };

export interface ReleaseTicketCheckoutInput {
  checkoutId: string;
  status: Exclude<TicketCheckoutStatus, 'active'>;
  releaseReason?: string | null;
  now?: number;
}

type TicketCheckoutsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function isSelfClaim(existing: TicketCheckoutRow, input: ClaimTicketCheckoutInput): boolean {
  if (existing.employeeId !== input.employeeId) return false;
  if (
    input.runtimeSessionId !== undefined &&
    existing.runtimeSessionId !== input.runtimeSessionId
  ) {
    return false;
  }
  if (input.runId !== undefined && existing.runId !== input.runId) {
    return false;
  }
  return true;
}

export function createTicketCheckoutsRepo<TRunResult>(db: TicketCheckoutsDb<TRunResult>) {
  const repo = {
    getById(id: string): TicketCheckoutRow | null {
      return db.select().from(ticketCheckouts).where(eq(ticketCheckouts.id, id)).get() ?? null;
    },

    getActiveByTicket(ticketId: string): TicketCheckoutRow | null {
      return (
        db
          .select()
          .from(ticketCheckouts)
          .where(and(eq(ticketCheckouts.ticketId, ticketId), eq(ticketCheckouts.status, 'active')))
          .get() ?? null
      );
    },

    listByTicket(ticketId: string): TicketCheckoutRow[] {
      return db
        .select()
        .from(ticketCheckouts)
        .where(eq(ticketCheckouts.ticketId, ticketId))
        .orderBy(desc(ticketCheckouts.createdAt))
        .all();
    },

    listActiveByCompany(companyId: string): TicketCheckoutRow[] {
      return db
        .select()
        .from(ticketCheckouts)
        .where(and(eq(ticketCheckouts.companyId, companyId), eq(ticketCheckouts.status, 'active')))
        .orderBy(desc(ticketCheckouts.updatedAt))
        .all();
    },

    claim(input: ClaimTicketCheckoutInput): ClaimTicketCheckoutResult {
      return db.transaction((tx) => {
        const now = input.now ?? Date.now();
        const active =
          tx
            .select()
            .from(ticketCheckouts)
            .where(
              and(
                eq(ticketCheckouts.ticketId, input.ticketId),
                eq(ticketCheckouts.status, 'active'),
              ),
            )
            .get() ?? null;

        if (active && active.expiresAt > now) {
          if (isSelfClaim(active, input)) {
            tx.update(ticketCheckouts)
              .set({
                expiresAt: input.expiresAt,
                lastHeartbeatAt: now,
                updatedAt: now,
              })
              .where(eq(ticketCheckouts.id, active.id))
              .run();
            const checkout = tx
              .select()
              .from(ticketCheckouts)
              .where(eq(ticketCheckouts.id, active.id))
              .get();
            if (!checkout) {
              throw new Error('[ticket-checkouts] self-claim update did not round-trip');
            }
            return { outcome: 'already-owned-by-self', checkout };
          }
          return { outcome: 'conflict', conflictingCheckout: active };
        }

        let previousCheckout: TicketCheckoutRow | null = null;
        if (active) {
          previousCheckout = active;
          tx.update(ticketCheckouts)
            .set({
              status: 'expired',
              releasedAt: now,
              releaseReason: 'lease expired before reclaim',
              updatedAt: now,
            })
            .where(eq(ticketCheckouts.id, active.id))
            .run();
        }

        const id = nanoid();
        const row: TicketCheckoutRow = {
          id,
          companyId: input.companyId,
          ticketId: input.ticketId,
          employeeId: input.employeeId,
          runtimeSessionId: input.runtimeSessionId ?? null,
          runId: input.runId ?? null,
          status: 'active',
          claimedAt: now,
          lastHeartbeatAt: now,
          expiresAt: input.expiresAt,
          releasedAt: null,
          releaseReason: null,
          createdAt: now,
          updatedAt: now,
        };
        tx.insert(ticketCheckouts).values(row).run();
        return previousCheckout
          ? { outcome: 'expired-reclaimed', checkout: row, previousCheckout }
          : { outcome: 'claimed', checkout: row };
      });
    },

    heartbeat(
      checkoutId: string,
      input: { now?: number; expiresAt?: number },
    ): TicketCheckoutRow | null {
      const now = input.now ?? Date.now();
      const existing = this.getById(checkoutId);
      if (!existing || existing.status !== 'active') return existing;
      db.update(ticketCheckouts)
        .set({
          lastHeartbeatAt: now,
          expiresAt: input.expiresAt ?? existing.expiresAt,
          updatedAt: now,
        })
        .where(eq(ticketCheckouts.id, checkoutId))
        .run();
      return this.getById(checkoutId);
    },

    release(input: ReleaseTicketCheckoutInput): TicketCheckoutRow | null {
      const now = input.now ?? Date.now();
      const existing = this.getById(input.checkoutId);
      if (!existing) return null;
      if (existing.status !== 'active') return existing;
      db.update(ticketCheckouts)
        .set({
          status: input.status,
          releasedAt: now,
          releaseReason: input.releaseReason ?? null,
          updatedAt: now,
        })
        .where(eq(ticketCheckouts.id, input.checkoutId))
        .run();
      return this.getById(input.checkoutId);
    },

    expireStale(input: { companyId?: string; now?: number }): TicketCheckoutRow[] {
      const now = input.now ?? Date.now();
      const activeRows = input.companyId
        ? this.listActiveByCompany(input.companyId)
        : db.select().from(ticketCheckouts).where(eq(ticketCheckouts.status, 'active')).all();
      const staleRows = activeRows.filter((row) => row.expiresAt <= now);
      for (const row of staleRows) {
        db.update(ticketCheckouts)
          .set({
            status: 'expired',
            releasedAt: now,
            releaseReason: 'lease expired',
            updatedAt: now,
          })
          .where(eq(ticketCheckouts.id, row.id))
          .run();
      }
      return staleRows
        .map((row) => this.getById(row.id))
        .filter((row): row is TicketCheckoutRow => row !== null);
    },
  };
  return repo;
}

export type TicketCheckoutsRepo = ReturnType<typeof createTicketCheckoutsRepo>;
