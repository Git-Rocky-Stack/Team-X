import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { AuthorityGrant } from '@team-x/shared-types';

import type { getDb } from '../client.js';
import {
  authorityGrants,
  authorityRequests,
  employees,
  extensions,
  skillAssignments,
} from '../schema.js';

type DB = ReturnType<typeof getDb>;

export type ExtensionRow = typeof extensions.$inferSelect;
export type SkillAssignmentRow = typeof skillAssignments.$inferSelect;
export type AuthorityGrantRow = Omit<
  typeof authorityGrants.$inferSelect,
  'scopeKind' | 'resourceKind' | 'permission'
> & {
  scopeKind: AuthorityGrant['scopeKind'];
  resourceKind: AuthorityGrant['resourceKind'];
  permission: AuthorityGrant['permission'];
};
export type AuthorityRequestRow = typeof authorityRequests.$inferSelect;

export interface CreateExtensionInput {
  companyId: string | null;
  kind: 'skill' | 'mcp';
  name: string;
  slug: string;
  sourceKind: 'local' | 'github' | 'marketplace' | 'template';
  sourceRef: string;
  version?: string | null;
  updateChannel?: string | null;
  manifestJson?: string | null;
  requestedCapabilitiesJson?: string;
  requestedPathsJson?: string;
  enabled?: boolean;
  trustState?: 'trusted' | 'pending-review' | 'denied';
  runtimeRefId?: string | null;
}

export interface UpdateExtensionInput {
  companyId?: string | null;
  name?: string;
  slug?: string;
  sourceKind?: 'local' | 'github' | 'marketplace' | 'template';
  sourceRef?: string;
  version?: string | null;
  updateChannel?: string | null;
  manifestJson?: string | null;
  requestedCapabilitiesJson?: string;
  requestedPathsJson?: string;
  enabled?: boolean;
  trustState?: 'trusted' | 'pending-review' | 'denied';
  runtimeRefId?: string | null;
}

export interface CreateSkillAssignmentInput {
  extensionId: string;
  companyId: string;
  employeeId?: string | null;
  enabled?: boolean;
  source: 'workspace-default' | 'employee-override';
}

export interface CreateAuthorityGrantInput {
  scopeKind: 'company' | 'employee' | 'extension';
  scopeId: string;
  resourceKind: 'capability' | 'path';
  resourceId: string;
  permission: 'allow' | 'deny' | 'prompt';
  metadataJson?: string | null;
}

export interface CreateAuthorityRequestInput {
  extensionId: string;
  employeeId?: string | null;
  resourceKind: 'capability' | 'path';
  resourceId: string;
  requestedPermission: 'allow' | 'deny' | 'prompt';
  status?: 'pending' | 'approved' | 'denied';
  reason?: string | null;
  reviewedAt?: number | null;
}

export interface ReviewAuthorityRequestInput {
  requestId: string;
  status: 'approved' | 'denied';
  reason?: string | null;
  reviewedAt?: number | null;
}

function listExtensionIdsForCompany(db: DB, companyId: string): Set<string> {
  const rows = db
    .select({ id: extensions.id })
    .from(extensions)
    .where(eq(extensions.companyId, companyId))
    .all()
    .concat(db.select({ id: extensions.id }).from(extensions).where(isNull(extensions.companyId)).all());
  return new Set(rows.map((row) => row.id));
}

function listEmployeeIdsForCompany(db: DB, companyId: string): Set<string> {
  return new Set(
    db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.companyId, companyId))
      .all()
      .map((row) => row.id),
  );
}

export function createExtensionsRepo(db: DB) {
  return {
    create(input: CreateExtensionInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(extensions)
        .values({
          id,
          companyId: input.companyId,
          kind: input.kind,
          name: input.name,
          slug: input.slug,
          sourceKind: input.sourceKind,
          sourceRef: input.sourceRef,
          version: input.version ?? null,
          updateChannel: input.updateChannel ?? null,
          manifestJson: input.manifestJson ?? null,
          requestedCapabilitiesJson: input.requestedCapabilitiesJson ?? '[]',
          requestedPathsJson: input.requestedPathsJson ?? '[]',
          enabled: input.enabled ?? true,
          trustState: input.trustState ?? 'pending-review',
          runtimeRefId: input.runtimeRefId ?? null,
          installedAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getById(id: string): ExtensionRow | null {
      return db.select().from(extensions).where(eq(extensions.id, id)).get() ?? null;
    },

    findByRuntimeRefId(runtimeRefId: string): ExtensionRow | null {
      return (
        db.select().from(extensions).where(eq(extensions.runtimeRefId, runtimeRefId)).get() ?? null
      );
    },

    listByCompany(companyId: string): ExtensionRow[] {
      return db
        .select()
        .from(extensions)
        .where(eq(extensions.companyId, companyId))
        .all()
        .concat(db.select().from(extensions).where(isNull(extensions.companyId)).all())
        .sort((a, b) => b.installedAt - a.installedAt);
    },

    listSkillsByCompany(companyId: string): ExtensionRow[] {
      return db
        .select()
        .from(extensions)
        .where(eq(extensions.companyId, companyId))
        .all()
        .concat(db.select().from(extensions).where(isNull(extensions.companyId)).all())
        .filter((row) => row.kind === 'skill')
        .sort((a, b) => b.installedAt - a.installedAt);
    },

    updateEnabled(id: string, enabled: boolean): void {
      db.update(extensions).set({ enabled, updatedAt: Date.now() }).where(eq(extensions.id, id)).run();
    },

    update(id: string, patch: UpdateExtensionInput): void {
      const next: Record<string, unknown> = {
        updatedAt: Date.now(),
      };
      if (patch.companyId !== undefined) next.companyId = patch.companyId;
      if (patch.name !== undefined) next.name = patch.name;
      if (patch.slug !== undefined) next.slug = patch.slug;
      if (patch.sourceKind !== undefined) next.sourceKind = patch.sourceKind;
      if (patch.sourceRef !== undefined) next.sourceRef = patch.sourceRef;
      if (patch.version !== undefined) next.version = patch.version;
      if (patch.updateChannel !== undefined) next.updateChannel = patch.updateChannel;
      if (patch.manifestJson !== undefined) next.manifestJson = patch.manifestJson;
      if (patch.requestedCapabilitiesJson !== undefined) {
        next.requestedCapabilitiesJson = patch.requestedCapabilitiesJson;
      }
      if (patch.requestedPathsJson !== undefined) {
        next.requestedPathsJson = patch.requestedPathsJson;
      }
      if (patch.enabled !== undefined) next.enabled = patch.enabled;
      if (patch.trustState !== undefined) next.trustState = patch.trustState;
      if (patch.runtimeRefId !== undefined) next.runtimeRefId = patch.runtimeRefId;

      db.update(extensions).set(next).where(eq(extensions.id, id)).run();
    },

    delete(id: string): void {
      db.delete(extensions).where(eq(extensions.id, id)).run();
    },
  };
}

export type ExtensionsRepo = ReturnType<typeof createExtensionsRepo>;

export function createSkillAssignmentsRepo(db: DB) {
  return {
    create(input: CreateSkillAssignmentInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(skillAssignments)
        .values({
          id,
          extensionId: input.extensionId,
          companyId: input.companyId,
          employeeId: input.employeeId ?? null,
          enabled: input.enabled ?? true,
          source: input.source,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    listByCompany(companyId: string): SkillAssignmentRow[] {
      return db
        .select()
        .from(skillAssignments)
        .where(eq(skillAssignments.companyId, companyId))
        .all();
    },

    listByEmployee(companyId: string, employeeId: string): SkillAssignmentRow[] {
      return db
        .select()
        .from(skillAssignments)
        .where(
          and(
            eq(skillAssignments.companyId, companyId),
            eq(skillAssignments.employeeId, employeeId),
          ),
        )
        .all();
    },

    getByScope(
      companyId: string,
      extensionId: string,
      employeeId: string | null,
    ): SkillAssignmentRow | null {
      const base = db
        .select()
        .from(skillAssignments)
        .where(
          and(
            eq(skillAssignments.companyId, companyId),
            eq(skillAssignments.extensionId, extensionId),
            employeeId === null
              ? isNull(skillAssignments.employeeId)
              : eq(skillAssignments.employeeId, employeeId),
          ),
        )
        .get();
      return base ?? null;
    },

    upsert(input: CreateSkillAssignmentInput): string {
      const existing = this.getByScope(input.companyId, input.extensionId, input.employeeId ?? null);
      if (existing) {
        db.update(skillAssignments)
          .set({
            enabled: input.enabled ?? true,
            source: input.source,
            updatedAt: Date.now(),
          })
          .where(eq(skillAssignments.id, existing.id))
          .run();
        return existing.id;
      }
      return this.create(input);
    },

    delete(id: string): void {
      db.delete(skillAssignments).where(eq(skillAssignments.id, id)).run();
    },
  };
}

export type SkillAssignmentsRepo = ReturnType<typeof createSkillAssignmentsRepo>;

export function createAuthorityRepo(db: DB) {
  function toAuthorityGrantRow(row: typeof authorityGrants.$inferSelect): AuthorityGrantRow {
    return {
      ...row,
      scopeKind: row.scopeKind as AuthorityGrant['scopeKind'],
      resourceKind: row.resourceKind as AuthorityGrant['resourceKind'],
      permission: row.permission as AuthorityGrant['permission'],
    };
  }

  return {
    createGrant(input: CreateAuthorityGrantInput): string {
      const id = nanoid();
      const now = Date.now();
      db.insert(authorityGrants)
        .values({
          id,
          scopeKind: input.scopeKind,
          scopeId: input.scopeId,
          resourceKind: input.resourceKind,
          resourceId: input.resourceId,
          permission: input.permission,
          metadataJson: input.metadataJson ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return id;
    },

    getGrantById(id: string): AuthorityGrantRow | null {
      const row = db.select().from(authorityGrants).where(eq(authorityGrants.id, id)).get();
      return row ? toAuthorityGrantRow(row) : null;
    },

    listByCompany(companyId: string): AuthorityGrantRow[] {
      const employeeIds = listEmployeeIdsForCompany(db, companyId);
      const extensionIds = listExtensionIdsForCompany(db, companyId);
      return db
        .select()
        .from(authorityGrants)
        .all()
        .map(toAuthorityGrantRow)
        .filter((row) => {
          if (row.scopeKind === 'company') return row.scopeId === companyId;
          if (row.scopeKind === 'employee') return employeeIds.has(row.scopeId);
          if (row.scopeKind === 'extension') return extensionIds.has(row.scopeId);
          return false;
        });
    },

    listForEmployee(companyId: string, employeeId: string): AuthorityGrantRow[] {
      const extensionIds = listExtensionIdsForCompany(db, companyId);
      return db
        .select()
        .from(authorityGrants)
        .all()
        .map(toAuthorityGrantRow)
        .filter((row) => {
          if (row.scopeKind === 'company') return row.scopeId === companyId;
          if (row.scopeKind === 'employee') return row.scopeId === employeeId;
          if (row.scopeKind === 'extension') return extensionIds.has(row.scopeId);
          return false;
        });
    },

    deleteGrant(id: string): void {
      db.delete(authorityGrants).where(eq(authorityGrants.id, id)).run();
    },

    createRequest(input: CreateAuthorityRequestInput): string {
      const id = nanoid();
      db.insert(authorityRequests)
        .values({
          id,
          extensionId: input.extensionId,
          employeeId: input.employeeId ?? null,
          resourceKind: input.resourceKind,
          resourceId: input.resourceId,
          requestedPermission: input.requestedPermission,
          status: input.status ?? 'pending',
          reason: input.reason ?? null,
          createdAt: Date.now(),
          reviewedAt: input.reviewedAt ?? null,
        })
        .run();
      return id;
    },

    getRequestById(id: string): AuthorityRequestRow | null {
      return db.select().from(authorityRequests).where(eq(authorityRequests.id, id)).get() ?? null;
    },

    listRequestsByCompany(
      companyId: string,
      status?: 'pending' | 'approved' | 'denied',
    ): AuthorityRequestRow[] {
      const employeeIds = listEmployeeIdsForCompany(db, companyId);
      const extensionIds = listExtensionIdsForCompany(db, companyId);
      return db
        .select()
        .from(authorityRequests)
        .all()
        .filter((row) => {
          if (status && row.status !== status) return false;
          if (employeeIds.has(row.employeeId ?? '')) return true;
          return extensionIds.has(row.extensionId);
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    listPendingByCompany(companyId: string): AuthorityRequestRow[] {
      return this.listRequestsByCompany(companyId, 'pending');
    },

    reviewRequest(input: ReviewAuthorityRequestInput): void {
      db.update(authorityRequests)
        .set({
          status: input.status,
          reason: input.reason ?? null,
          reviewedAt: input.reviewedAt ?? Date.now(),
        })
        .where(eq(authorityRequests.id, input.requestId))
        .run();
    },
  };
}

export type AuthorityRepo = ReturnType<typeof createAuthorityRepo>;
