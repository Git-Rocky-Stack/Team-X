import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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
export type AuthorityGrantRow = typeof authorityGrants.$inferSelect;
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
  };
}

export type SkillAssignmentsRepo = ReturnType<typeof createSkillAssignmentsRepo>;

export function createAuthorityRepo(db: DB) {
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

    listByCompany(companyId: string): AuthorityGrantRow[] {
      const employeeIds = listEmployeeIdsForCompany(db, companyId);
      const extensionIds = listExtensionIdsForCompany(db, companyId);
      return db
        .select()
        .from(authorityGrants)
        .all()
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
        .filter((row) => {
          if (row.scopeKind === 'company') return row.scopeId === companyId;
          if (row.scopeKind === 'employee') return row.scopeId === employeeId;
          if (row.scopeKind === 'extension') return extensionIds.has(row.scopeId);
          return false;
        });
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

    listPendingByCompany(companyId: string): AuthorityRequestRow[] {
      const employeeIds = listEmployeeIdsForCompany(db, companyId);
      const extensionIds = listExtensionIdsForCompany(db, companyId);
      return db
        .select()
        .from(authorityRequests)
        .all()
        .filter((row) => {
          if (row.status !== 'pending') return false;
          if (employeeIds.has(row.employeeId ?? '')) return true;
          return extensionIds.has(row.extensionId);
        });
    },
  };
}

export type AuthorityRepo = ReturnType<typeof createAuthorityRepo>;
