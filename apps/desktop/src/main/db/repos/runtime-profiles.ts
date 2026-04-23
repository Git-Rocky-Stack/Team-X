import { and, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { RuntimeProfileHealthStatus, RuntimeProfileKind } from '@team-x/shared-types';

import type { Schema } from '../client.js';
import { employeeRuntimeBindings, runtimeProfiles } from '../schema.js';

export type RuntimeProfileRow = typeof runtimeProfiles.$inferSelect;
export type EmployeeRuntimeBindingRow = typeof employeeRuntimeBindings.$inferSelect;

export interface CreateRuntimeProfileInput {
  companyId: string;
  name: string;
  slug: string;
  kind: RuntimeProfileKind;
  enabled?: boolean;
  configJson?: string;
  lastHealthStatus?: RuntimeProfileHealthStatus;
  lastHealthMessage?: string | null;
  lastValidatedAt?: number | null;
}

export interface UpdateRuntimeProfileInput {
  name?: string;
  slug?: string;
  kind?: RuntimeProfileKind;
  enabled?: boolean;
  configJson?: string;
  lastHealthStatus?: RuntimeProfileHealthStatus;
  lastHealthMessage?: string | null;
  lastValidatedAt?: number | null;
}

export interface UpsertEmployeeRuntimeBindingInput {
  companyId: string;
  employeeId: string;
  runtimeProfileId: string;
}

type RuntimeProfilesDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

export function createRuntimeProfilesRepo<TRunResult>(db: RuntimeProfilesDb<TRunResult>) {
  return {
    create(input: CreateRuntimeProfileInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(runtimeProfiles)
        .values({
          id,
          companyId: input.companyId,
          name: input.name,
          slug: input.slug,
          kind: input.kind,
          enabled: input.enabled ?? true,
          configJson: input.configJson ?? '{}',
          lastHealthStatus: input.lastHealthStatus ?? 'unknown',
          lastHealthMessage: input.lastHealthMessage ?? null,
          lastValidatedAt: input.lastValidatedAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getById(id: string): RuntimeProfileRow | null {
      const row = db.select().from(runtimeProfiles).where(eq(runtimeProfiles.id, id)).get();
      return row ?? null;
    },

    listByCompany(companyId: string): RuntimeProfileRow[] {
      return db
        .select()
        .from(runtimeProfiles)
        .where(eq(runtimeProfiles.companyId, companyId))
        .all()
        .sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt);
    },

    update(id: string, patch: UpdateRuntimeProfileInput): void {
      const next: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.slug !== undefined) next.slug = patch.slug;
      if (patch.kind !== undefined) next.kind = patch.kind;
      if (patch.enabled !== undefined) next.enabled = patch.enabled;
      if (patch.configJson !== undefined) next.configJson = patch.configJson;
      if (patch.lastHealthStatus !== undefined) next.lastHealthStatus = patch.lastHealthStatus;
      if (patch.lastHealthMessage !== undefined) next.lastHealthMessage = patch.lastHealthMessage;
      if (patch.lastValidatedAt !== undefined) next.lastValidatedAt = patch.lastValidatedAt;
      db.update(runtimeProfiles).set(next).where(eq(runtimeProfiles.id, id)).run();
    },

    delete(id: string): void {
      db.delete(runtimeProfiles).where(eq(runtimeProfiles.id, id)).run();
    },

    listBindingsByCompany(companyId: string): EmployeeRuntimeBindingRow[] {
      return db
        .select()
        .from(employeeRuntimeBindings)
        .where(eq(employeeRuntimeBindings.companyId, companyId))
        .all();
    },

    getBindingByEmployeeId(employeeId: string): EmployeeRuntimeBindingRow | null {
      const row = db
        .select()
        .from(employeeRuntimeBindings)
        .where(eq(employeeRuntimeBindings.employeeId, employeeId))
        .get();
      return row ?? null;
    },

    getBinding(companyId: string, employeeId: string): EmployeeRuntimeBindingRow | null {
      const row = db
        .select()
        .from(employeeRuntimeBindings)
        .where(
          and(
            eq(employeeRuntimeBindings.companyId, companyId),
            eq(employeeRuntimeBindings.employeeId, employeeId),
          ),
        )
        .get();
      return row ?? null;
    },

    upsertBinding(input: UpsertEmployeeRuntimeBindingInput): EmployeeRuntimeBindingRow {
      const existing = this.getBinding(input.companyId, input.employeeId);
      const now = Date.now();
      if (existing) {
        db.update(employeeRuntimeBindings)
          .set({
            runtimeProfileId: input.runtimeProfileId,
            updatedAt: now,
          })
          .where(eq(employeeRuntimeBindings.id, existing.id))
          .run();
        return {
          ...existing,
          runtimeProfileId: input.runtimeProfileId,
          updatedAt: now,
        };
      }

      const id = nanoid();
      const row: EmployeeRuntimeBindingRow = {
        id,
        companyId: input.companyId,
        employeeId: input.employeeId,
        runtimeProfileId: input.runtimeProfileId,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(employeeRuntimeBindings).values(row).run();
      return row;
    },

    deleteBindingByEmployeeId(employeeId: string): void {
      db.delete(employeeRuntimeBindings)
        .where(eq(employeeRuntimeBindings.employeeId, employeeId))
        .run();
    },
  };
}

export type RuntimeProfilesRepo = ReturnType<typeof createRuntimeProfilesRepo>;
