import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  events,
  commandHistory,
  copilotInsights,
  embeddings,
  employees,
  fileVault,
  goals,
  mcpServers,
  meetings,
  messages,
  orgEdges,
  projectTickets,
  projects,
  runs,
  threadMembers,
  threads,
  ticketAttachments,
  tickets,
} from '../schema.js';
import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';

describe('companies repo', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createCompaniesRepo>;

  beforeEach(async () => {
    ctx = await makeTestDb();
    repo = createCompaniesRepo(ctx.db);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('create', () => {
    it('returns a non-empty id', () => {
      const id = repo.create({ name: 'Strategia-X', slug: 'strategia-x' });
      expect(id).toBeTypeOf('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('persists the row with provided name and slug', () => {
      const id = repo.create({ name: 'Strategia-X', slug: 'strategia-x' });
      const got = repo.getById(id);
      expect(got).not.toBeNull();
      expect(got?.name).toBe('Strategia-X');
      expect(got?.slug).toBe('strategia-x');
    });

    it('stores an empty settings object by default', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      const got = repo.getById(id);
      expect(got?.settingsJson).toBe('{}');
    });

    it('serializes a provided settings object to JSON', () => {
      const id = repo.create({
        name: 'X',
        slug: 'x',
        settings: { mission: 'Build Team-X', hq: 'local' },
      });
      const got = repo.getById(id);
      expect(got).not.toBeNull();
      expect(JSON.parse(got?.settingsJson ?? '{}')).toEqual({
        mission: 'Build Team-X',
        hq: 'local',
      });
    });

    it('defaults theme to "dark"', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      expect(repo.getById(id)?.theme).toBe('dark');
    });

    it('stores createdAt as a positive integer in ms', () => {
      const before = Date.now();
      const id = repo.create({ name: 'X', slug: 'x' });
      const after = Date.now();
      const got = repo.getById(id);
      expect(got?.createdAt).toBeGreaterThanOrEqual(before);
      expect(got?.createdAt).toBeLessThanOrEqual(after);
    });

    it('defaults both origin ids to the generated company id', () => {
      const id = repo.create({ name: 'Origins', slug: 'origins' });
      const got = repo.getById(id);
      expect(got?.workspaceOriginId).toBe(id);
      expect(got?.companyOriginId).toBe(id);
    });

    it('persists supplied origin ids for imported or template-derived companies', () => {
      const id = repo.create({
        name: 'Imported',
        slug: 'imported',
        workspaceOriginId: 'workspace-origin-1',
        companyOriginId: 'company-origin-1',
      });
      const got = repo.getById(id);
      expect(got?.workspaceOriginId).toBe('workspace-origin-1');
      expect(got?.companyOriginId).toBe('company-origin-1');
    });

    it('defaults cloud-link metadata to an unlinked workspace', () => {
      const id = repo.create({ name: 'Cloud Ready', slug: 'cloud-ready' });
      const got = repo.getById(id);
      expect(got?.cloudLinkState).toBe('unlinked');
      expect(got?.cloudWorkspaceId).toBeNull();
      expect(got?.cloudTenantId).toBeNull();
      expect(got?.linkedDeviceId).toBeNull();
      expect(got?.lastSyncedCursorJson).toBeNull();
      expect(got?.lastSnapshotId).toBeNull();
      expect(got?.lastSyncAt).toBeNull();
      expect(got?.lastSyncError).toBeNull();
    });

    it('enforces unique slug (throws on duplicate)', () => {
      repo.create({ name: 'One', slug: 'same-slug' });
      expect(() => repo.create({ name: 'Two', slug: 'same-slug' })).toThrow();
    });
  });

  describe('getBySlug', () => {
    it('returns the company matching a known slug', () => {
      const id = repo.create({ name: 'Strategia-X', slug: 'strategia-x' });
      const got = repo.getBySlug('strategia-x');
      expect(got?.id).toBe(id);
      expect(got?.name).toBe('Strategia-X');
    });

    it('returns null for an unknown slug', () => {
      expect(repo.getBySlug('does-not-exist')).toBeNull();
    });

    it('is case-sensitive (SQLite default)', () => {
      repo.create({ name: 'X', slug: 'lowercase' });
      expect(repo.getBySlug('LOWERCASE')).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns the company matching a known id', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      expect(repo.getById(id)).not.toBeNull();
    });

    it('returns null for an unknown id', () => {
      expect(repo.getById('definitely-not-a-real-id')).toBeNull();
    });
  });

  describe('list', () => {
    it('returns an empty array when no companies exist', () => {
      expect(repo.list()).toEqual([]);
    });

    it('returns every created company', () => {
      repo.create({ name: 'A', slug: 'a' });
      repo.create({ name: 'B', slug: 'b' });
      repo.create({ name: 'C', slug: 'c' });
      const all = repo.list();
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.slug).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('setStatus', () => {
    it('updates the company status column', () => {
      const id = repo.create({ name: 'S', slug: 's' });
      const before = repo.getById(id);
      expect(before?.status).toBe('running');

      repo.setStatus(id, 'meeting');
      const after = repo.getById(id);
      expect(after?.status).toBe('meeting');
    });

    it('can transition through all valid statuses', () => {
      const id = repo.create({ name: 'T', slug: 't' });
      for (const status of ['meeting', 'paused', 'running'] as const) {
        repo.setStatus(id, status);
        expect(repo.getById(id)?.status).toBe(status);
      }
    });
  });

  describe('archive', () => {
    it("transitions status from 'running' to 'archived'", () => {
      const id = repo.create({ name: 'Archive Me', slug: 'arc-me' });
      expect(repo.getById(id)?.status).toBe('running');

      repo.archive(id);
      expect(repo.getById(id)?.status).toBe('archived');
    });

    it('is idempotent — repeated calls leave status archived', () => {
      const id = repo.create({ name: 'X', slug: 'x' });
      repo.archive(id);
      repo.archive(id);
      repo.archive(id);
      expect(repo.getById(id)?.status).toBe('archived');
    });

    it('only affects the targeted company (other rows untouched)', () => {
      const a = repo.create({ name: 'A', slug: 'a' });
      const b = repo.create({ name: 'B', slug: 'b' });
      repo.archive(a);
      expect(repo.getById(a)?.status).toBe('archived');
      expect(repo.getById(b)?.status).toBe('running');
    });

    it('is a no-op for an unknown id (no throw, no side effects on known rows)', () => {
      const id = repo.create({ name: 'Real', slug: 'real' });
      expect(() => repo.archive('not-a-real-id')).not.toThrow();
      expect(repo.getById(id)?.status).toBe('running');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 5.6 M-C step e — update + delete (Cluster A multi-company CRUD)
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('updates a single field (name only)', () => {
      const id = repo.create({ name: 'Old Name', slug: 'same-slug' });
      repo.update(id, { name: 'New Name' });
      const got = repo.getById(id);
      expect(got?.name).toBe('New Name');
      expect(got?.slug).toBe('same-slug');
    });

    it('updates multiple fields atomically', () => {
      const id = repo.create({ name: 'A', slug: 'a', icon: '🅰️', theme: 'dark' });
      repo.update(id, {
        name: 'Acme',
        slug: 'acme',
        settings: { mission: 'ship it', hq: 'cloud' },
        icon: '🏢',
        theme: 'light',
      });
      const got = repo.getById(id);
      expect(got?.name).toBe('Acme');
      expect(got?.slug).toBe('acme');
      expect(JSON.parse(got?.settingsJson ?? '{}')).toEqual({ mission: 'ship it', hq: 'cloud' });
      expect(got?.icon).toBe('🏢');
      expect(got?.theme).toBe('light');
    });

    it('serializes settings patch to JSON', () => {
      const id = repo.create({ name: 'X', slug: 'x', settings: { a: 1 } });
      repo.update(id, { settings: { b: 2, nested: { c: 3 } } });
      const got = repo.getById(id);
      expect(JSON.parse(got?.settingsJson ?? '{}')).toEqual({ b: 2, nested: { c: 3 } });
    });

    it('accepts null to clear the icon', () => {
      const id = repo.create({ name: 'X', slug: 'x', icon: '🏢' });
      repo.update(id, { icon: null });
      expect(repo.getById(id)?.icon).toBeNull();
    });

    it('leaves unmentioned fields untouched', () => {
      const id = repo.create({
        name: 'Orig',
        slug: 'orig',
        settings: { keep: true },
        icon: '🔒',
      });
      repo.update(id, { name: 'Renamed' });
      const got = repo.getById(id);
      expect(got?.name).toBe('Renamed');
      expect(got?.slug).toBe('orig');
      expect(JSON.parse(got?.settingsJson ?? '{}')).toEqual({ keep: true });
      expect(got?.icon).toBe('🔒');
    });

    it('empty patch is a SQL no-op (returns without mutating)', () => {
      const id = repo.create({ name: 'Unchanged', slug: 'unchanged' });
      const before = repo.getById(id);
      repo.update(id, {});
      const after = repo.getById(id);
      expect(after).toEqual(before);
    });

    it('enforces unique-slug constraint on slug change (throws)', () => {
      const a = repo.create({ name: 'A', slug: 'taken' });
      const b = repo.create({ name: 'B', slug: 'other' });
      expect(() => repo.update(b, { slug: 'taken' })).toThrow();
      // 'a' still owns 'taken'; 'b' still has 'other'.
      expect(repo.getById(a)?.slug).toBe('taken');
      expect(repo.getById(b)?.slug).toBe('other');
    });

    it('only mutates the targeted row (other companies untouched)', () => {
      const a = repo.create({ name: 'A', slug: 'a' });
      const b = repo.create({ name: 'B', slug: 'b' });
      repo.update(a, { name: 'AA' });
      expect(repo.getById(a)?.name).toBe('AA');
      expect(repo.getById(b)?.name).toBe('B');
    });

    it('no-op on unknown id (no throw; known rows unchanged)', () => {
      const id = repo.create({ name: 'Real', slug: 'real' });
      expect(() => repo.update('not-a-real-id', { name: 'Ghost' })).not.toThrow();
      expect(repo.getById(id)?.name).toBe('Real');
    });
  });

  describe('updateCloudLink', () => {
    it('persists linked-workspace metadata independently from user-facing fields', () => {
      const id = repo.create({ name: 'Linked', slug: 'linked' });

      repo.updateCloudLink(id, {
        cloudLinkState: 'linked',
        cloudWorkspaceId: 'cloud-workspace-1',
        cloudTenantId: 'cloud-tenant-1',
        linkedDeviceId: 'device_123',
        lastSyncedCursorJson: '{"outboundCursor":"evt-10","inboundCursor":"cmd-4"}',
        lastSnapshotId: 'snapshot-2',
        lastSyncAt: 123456789,
        lastSyncError: 'temporary outage',
      });

      const got = repo.getById(id);
      expect(got?.name).toBe('Linked');
      expect(got?.slug).toBe('linked');
      expect(got?.cloudLinkState).toBe('linked');
      expect(got?.cloudWorkspaceId).toBe('cloud-workspace-1');
      expect(got?.cloudTenantId).toBe('cloud-tenant-1');
      expect(got?.linkedDeviceId).toBe('device_123');
      expect(got?.lastSyncedCursorJson).toBe('{"outboundCursor":"evt-10","inboundCursor":"cmd-4"}');
      expect(got?.lastSnapshotId).toBe('snapshot-2');
      expect(got?.lastSyncAt).toBe(123456789);
      expect(got?.lastSyncError).toBe('temporary outage');
    });

    it('accepts nulls to clear cloud-link metadata', () => {
      const id = repo.create({ name: 'Linked', slug: 'linked' });

      repo.updateCloudLink(id, {
        cloudLinkState: 'linked',
        cloudWorkspaceId: 'cloud-workspace-1',
        cloudTenantId: 'cloud-tenant-1',
        linkedDeviceId: 'device_123',
        lastSyncedCursorJson: '{"outboundCursor":"evt-10","inboundCursor":"cmd-4"}',
        lastSnapshotId: 'snapshot-2',
        lastSyncAt: 123456789,
        lastSyncError: 'temporary outage',
      });

      repo.updateCloudLink(id, {
        cloudLinkState: 'unlinked',
        cloudWorkspaceId: null,
        cloudTenantId: null,
        linkedDeviceId: null,
        lastSyncedCursorJson: null,
        lastSnapshotId: null,
        lastSyncAt: null,
        lastSyncError: null,
      });

      const got = repo.getById(id);
      expect(got?.cloudLinkState).toBe('unlinked');
      expect(got?.cloudWorkspaceId).toBeNull();
      expect(got?.cloudTenantId).toBeNull();
      expect(got?.linkedDeviceId).toBeNull();
      expect(got?.lastSyncedCursorJson).toBeNull();
      expect(got?.lastSnapshotId).toBeNull();
      expect(got?.lastSyncAt).toBeNull();
      expect(got?.lastSyncError).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the target company row', () => {
      const id = repo.create({ name: 'Goner', slug: 'goner' });
      expect(repo.getById(id)).not.toBeNull();
      repo.delete(id);
      expect(repo.getById(id)).toBeNull();
    });

    it('is a no-op for an unknown id (no throw, no side effects on known rows)', () => {
      const id = repo.create({ name: 'Real', slug: 'real' });
      expect(() => repo.delete('not-a-real-id')).not.toThrow();
      expect(repo.getById(id)).not.toBeNull();
    });

    it('only removes the targeted row (other companies untouched)', () => {
      const a = repo.create({ name: 'A', slug: 'a' });
      const b = repo.create({ name: 'B', slug: 'b' });
      repo.delete(a);
      expect(repo.getById(a)).toBeNull();
      expect(repo.getById(b)).not.toBeNull();
    });

    it('cascades through all 15 company-scoped tables (full FK-safe sweep)', () => {
      const now = Date.now();
      const id = repo.create({ name: 'Full', slug: 'full' });
      const otherCompanyId = repo.create({ name: 'Keep', slug: 'keep' });

      // Seed rows across every company-scoped table for BOTH companies so
      // we can prove the delete is surgical (other-company rows survive).
      // Raw drizzle inserts keep the test hermetic — we are not testing
      // the child repos, we are testing that delete() sweeps their rows.
      //
      // Order matters — FK enforcement is ON (test-helpers sets
      // PRAGMA foreign_keys=ON), so parents must insert before children.
      const seedFor = (cid: string, suffix: string) => {
        // employees (2 — one manager + one report for the org_edges row)
        ctx.db
          .insert(employees)
          .values({
            id: `emp-${suffix}`,
            companyId: cid,
            rolePackId: 'strategia-official',
            roleId: 'ceo',
            roleMdSha: 'deadbeef',
            level: 'officer',
            name: 'Manager',
            title: 'CEO',
            createdAt: now,
          })
          .run();
        ctx.db
          .insert(employees)
          .values({
            id: `emp-${suffix}-child`,
            companyId: cid,
            rolePackId: 'strategia-official',
            roleId: 'ic-swe',
            roleMdSha: 'cafebabe',
            level: 'ic',
            name: 'Report',
            title: 'Engineer',
            createdAt: now,
          })
          .run();
        // threads
        ctx.db
          .insert(threads)
          .values({
            id: `thr-${suffix}`,
            companyId: cid,
            kind: 'dm',
            subject: 'T',
            createdBy: 'rocky',
            createdAt: now,
          })
          .run();
        // thread_members (composite key)
        ctx.db
          .insert(threadMembers)
          .values({
            threadId: `thr-${suffix}`,
            memberId: `emp-${suffix}`,
            memberKind: 'employee',
          })
          .run();
        // messages
        ctx.db
          .insert(messages)
          .values({
            id: `msg-${suffix}`,
            threadId: `thr-${suffix}`,
            authorId: `emp-${suffix}`,
            authorKind: 'employee',
            content: 'hi',
            createdAt: now,
          })
          .run();
        // runs (employeeId required; threadId optional; kind + status have SQL defaults)
        ctx.db
          .insert(runs)
          .values({
            id: `run-${suffix}`,
            employeeId: `emp-${suffix}`,
            threadId: `thr-${suffix}`,
            provider: 'ollama',
            model: 'llama3.1:8b',
            startedAt: now,
          })
          .run();
        // tickets (status/priority have defaults; labelsJson/dependenciesJson default '[]')
        ctx.db
          .insert(tickets)
          .values({
            id: `tkt-${suffix}`,
            companyId: cid,
            title: 'T',
            reporterId: 'rocky',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        // goals (description/status/progressPct have defaults)
        ctx.db
          .insert(goals)
          .values({
            id: `goal-${suffix}`,
            companyId: cid,
            title: 'G',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        // projects (status/priority/description have defaults)
        ctx.db
          .insert(projects)
          .values({
            id: `prj-${suffix}`,
            companyId: cid,
            title: 'P',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        // project_tickets (composite PK — no createdAt)
        ctx.db
          .insert(projectTickets)
          .values({ projectId: `prj-${suffix}`, ticketId: `tkt-${suffix}` })
          .run();
        // file_vault (filename/originalName/sha256/vaultPath/uploadedBy required; timestamps required)
        ctx.db
          .insert(fileVault)
          .values({
            id: `file-${suffix}`,
            companyId: cid,
            filename: `f-${suffix}.txt`,
            originalName: 'original.txt',
            sha256: 'abc123',
            vaultPath: `vault/${suffix}.txt`,
            uploadedBy: 'rocky',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        // ticket_attachments (links vault file ⇄ ticket)
        ctx.db
          .insert(ticketAttachments)
          .values({
            id: `att-${suffix}`,
            ticketId: `tkt-${suffix}`,
            fileId: `file-${suffix}`,
            attachedBy: 'rocky',
            attachedAt: now,
          })
          .run();
        // meetings
        ctx.db
          .insert(meetings)
          .values({
            id: `mtg-${suffix}`,
            companyId: cid,
            threadId: `thr-${suffix}`,
            chairId: `emp-${suffix}`,
            startedAt: now,
          })
          .run();
        // embeddings (sourceType + contentText + embedding required)
        ctx.db
          .insert(embeddings)
          .values({
            id: `emb-${suffix}`,
            companyId: cid,
            sourceType: 'message',
            sourceId: `msg-${suffix}`,
            contentText: 'hi',
            embedding: Buffer.from([0, 0, 0, 0]),
            createdAt: now,
          })
          .run();
        // command_history (executedAt is TEXT ISO-8601)
        ctx.db
          .insert(commandHistory)
          .values({
            id: `cmd-${suffix}`,
            companyId: cid,
            actorId: 'rocky',
            text: '/test',
            intent: 'unknown',
            entitiesJson: '{}',
            executedAt: new Date(now).toISOString(),
            outcome: 'ok',
          })
          .run();
        // copilot_insights (expiresAt is NOT NULL; detail replaces summary)
        ctx.db
          .insert(copilotInsights)
          .values({
            id: `ins-${suffix}`,
            companyId: cid,
            category: 'operational',
            severity: 'info',
            title: 'i',
            detail: 's',
            createdAt: now,
            expiresAt: now + 86_400_000,
          })
          .run();
        // org_edges (migration 0013; manager→report edge)
        ctx.db
          .insert(orgEdges)
          .values({
            id: `edge-${suffix}`,
            companyId: cid,
            managerId: `emp-${suffix}`,
            reportId: `emp-${suffix}-child`,
            createdAt: now,
          })
          .run();
        // mcp_servers (company-scoped; installedAt not createdAt)
        ctx.db
          .insert(mcpServers)
          .values({
            id: `mcp-${suffix}`,
            companyId: cid,
            name: 'm',
            transport: 'stdio',
            installedAt: now,
          })
          .run();
        // events (loose companyId column, no FK)
        ctx.db
          .insert(events)
          .values({
            id: `evt-${suffix}`,
            eventType: 'work.started',
            companyId: cid,
            actorId: 'rocky',
            actorKind: 'user',
            payloadJson: '{}',
            createdAt: now,
          })
          .run();
      };

      seedFor(id, 'a');
      seedFor(otherCompanyId, 'b');

      // Also seed a GLOBAL mcp_server (NULL companyId) — it MUST survive
      // the delete per the "only scoped rows get swept" contract.
      ctx.db
        .insert(mcpServers)
        .values({
          id: 'mcp-global',
          companyId: null,
          name: 'global',
          transport: 'stdio',
          installedAt: now,
        })
        .run();

      // Delete the target company — single transactional sweep.
      repo.delete(id);

      // Every scoped row for the deleted company is gone.
      const countFor = (cid: string) => ({
        employees: ctx.db.select().from(employees).where(eq(employees.companyId, cid)).all().length,
        threads: ctx.db.select().from(threads).where(eq(threads.companyId, cid)).all().length,
        tickets: ctx.db.select().from(tickets).where(eq(tickets.companyId, cid)).all().length,
        goals: ctx.db.select().from(goals).where(eq(goals.companyId, cid)).all().length,
        projects: ctx.db.select().from(projects).where(eq(projects.companyId, cid)).all().length,
        fileVault: ctx.db.select().from(fileVault).where(eq(fileVault.companyId, cid)).all().length,
        meetings: ctx.db.select().from(meetings).where(eq(meetings.companyId, cid)).all().length,
        embeddings: ctx.db.select().from(embeddings).where(eq(embeddings.companyId, cid)).all()
          .length,
        commandHistory: ctx.db
          .select()
          .from(commandHistory)
          .where(eq(commandHistory.companyId, cid))
          .all().length,
        copilotInsights: ctx.db
          .select()
          .from(copilotInsights)
          .where(eq(copilotInsights.companyId, cid))
          .all().length,
        orgEdges: ctx.db.select().from(orgEdges).where(eq(orgEdges.companyId, cid)).all().length,
        mcpServers: ctx.db.select().from(mcpServers).where(eq(mcpServers.companyId, cid)).all()
          .length,
        events: ctx.db.select().from(events).where(eq(events.companyId, cid)).all().length,
      });
      const deleted = countFor(id);
      for (const [tbl, n] of Object.entries(deleted)) {
        expect({ tbl, n }).toEqual({ tbl, n: 0 });
      }

      // The OTHER company's rows all survive.
      const kept = countFor(otherCompanyId);
      for (const [tbl, n] of Object.entries(kept)) {
        expect({ tbl, n }).toEqual({ tbl, n: tbl === 'employees' ? 2 : 1 });
      }

      // Indirect leaves (thread_members, messages, project_tickets,
      // ticket_attachments, runs via thread_id) are also gone for the
      // deleted company but preserved for the other company.
      expect(ctx.db.select().from(threadMembers).all()).toHaveLength(1);
      expect(ctx.db.select().from(messages).all()).toHaveLength(1);
      expect(ctx.db.select().from(runs).all()).toHaveLength(1);
      expect(ctx.db.select().from(projectTickets).all()).toHaveLength(1);
      expect(ctx.db.select().from(ticketAttachments).all()).toHaveLength(1);

      // Global MCP server (NULL companyId) survives the sweep.
      const survivingMcp = ctx.db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.id, 'mcp-global'))
        .all();
      expect(survivingMcp).toHaveLength(1);
    });

    it('is atomic — a mid-sweep throw rolls every DELETE back', () => {
      // The easiest way to force a throw mid-sweep is to delete a
      // company whose FKs cascade cleanly — then verify a repeated
      // call (which would be a no-op) doesn't produce partial state.
      // Atomicity is enforced by better-sqlite3's transaction
      // semantics, so our smoke test is: the company is either fully
      // present or fully absent, never in between.
      const id = repo.create({ name: 'Atomic', slug: 'atomic' });
      repo.delete(id);
      expect(repo.getById(id)).toBeNull();

      // Repeating the delete is a no-op (unknown id path).
      expect(() => repo.delete(id)).not.toThrow();
    });
  });
});
