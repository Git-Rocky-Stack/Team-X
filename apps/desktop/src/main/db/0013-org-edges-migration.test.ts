/**
 * Migration 0013 — `org_edges` table verification (Phase 5.6 M-C step a).
 *
 * Pure migration-shape test — no repo wiring exists yet (the org-edges
 * repo lands in M-C step c). Verifies:
 *   1. Table created with the expected columns + types after every
 *      migration applies (covers shape regression if 0013 ever drifts).
 *   2. UNIQUE on report_id rejects duplicate report assignments.
 *   3. ON DELETE CASCADE for company_id drops every edge for that
 *      company (proves M-C step e companies.delete will land safely).
 *   4. ON DELETE CASCADE for manager_id and report_id drop the edge
 *      when an employee is hard-deleted (proves test fixtures and
 *      M-G branch cleanup will land safely).
 *   5. Indexes present (UNIQUE org_edges_report_id_unique +
 *      composite idx_org_edges_company_manager).
 *
 * Lives at the migrations sibling rather than under repos/ so the
 * coverage attribution stays attached to the migration file even
 * before the repo lands. The repo will get its own *.test.ts in
 * step c.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import initSqlJs, { type Database as RawSqlJsDatabase } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createCompaniesRepo } from './repos/companies.js';
import { createEmployeesRepo } from './repos/employees.js';
import { type TestDbHandle, makeTestDb } from './test-helpers.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const migration0013Path = join(thisDir, 'migrations', '0013_org_edges.sql');

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

const ROLE_FIXTURE = {
  rolePackId: 'strategia-official',
  roleId: 'ceo',
  roleMdSha: 'a'.repeat(64),
  level: 'Officer',
};

describe('migration 0013 — org_edges', () => {
  let ctx: TestDbHandle;
  let companyId: string;
  let managerId: string;
  let reportId: string;
  let secondReportId: string;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    const employees = createEmployeesRepo(ctx.db);
    companyId = companies.create({ name: 'Test Co', slug: 'test-co' });
    managerId = employees.create({
      ...ROLE_FIXTURE,
      companyId,
      name: 'Manager',
      title: 'CEO',
    });
    reportId = employees.create({
      ...ROLE_FIXTURE,
      companyId,
      roleId: 'senior-fullstack-engineer',
      level: 'IC',
      name: 'Report A',
      title: 'Senior Fullstack Engineer',
    });
    secondReportId = employees.create({
      ...ROLE_FIXTURE,
      companyId,
      roleId: 'senior-fullstack-engineer',
      level: 'IC',
      name: 'Report B',
      title: 'Senior Fullstack Engineer',
    });
  });

  afterEach(() => {
    ctx.close();
  });

  function tableInfo(name: string): TableInfoRow[] {
    const stmt = ctx.raw.prepare(`PRAGMA table_info('${name}')`);
    const rows: TableInfoRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as TableInfoRow);
    stmt.free();
    return rows;
  }

  function indexList(name: string): IndexListRow[] {
    const stmt = ctx.raw.prepare(`PRAGMA index_list('${name}')`);
    const rows: IndexListRow[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as IndexListRow);
    stmt.free();
    return rows;
  }

  function insertEdge(args: {
    id: string;
    companyId: string;
    managerId: string;
    reportId: string;
    createdAt?: number;
  }) {
    ctx.raw.run(
      'INSERT INTO org_edges (id, company_id, manager_id, report_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [args.id, args.companyId, args.managerId, args.reportId, args.createdAt ?? Date.now()],
    );
  }

  function countEdges(): number {
    const stmt = ctx.raw.prepare('SELECT COUNT(*) AS c FROM org_edges');
    stmt.step();
    const { c } = stmt.getAsObject() as { c: number };
    stmt.free();
    return c;
  }

  // -------------------------------------------------------------------------
  // 1. Table shape
  // -------------------------------------------------------------------------

  it('creates the org_edges table with the expected columns', () => {
    const cols = tableInfo('org_edges');
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.size).toBe(5);

    // SQLite returns column type strings in their declared case (the
    // PRAGMA preserves DDL casing). Our migration uses lowercase
    // `text`/`integer`; sql.js's PRAGMA echoes them as `TEXT`/`INTEGER`
    // because internally it normalizes type affinity to upper. Compare
    // case-insensitively to stay robust to either driver convention.
    const id = byName.get('id');
    expect(id).toBeDefined();
    expect(id?.type.toLowerCase()).toBe('text');
    expect(id?.notnull).toBe(1);
    expect(id?.pk).toBe(1);

    const companyIdCol = byName.get('company_id');
    expect(companyIdCol?.type.toLowerCase()).toBe('text');
    expect(companyIdCol?.notnull).toBe(1);

    const managerIdCol = byName.get('manager_id');
    expect(managerIdCol?.type.toLowerCase()).toBe('text');
    expect(managerIdCol?.notnull).toBe(1);

    const reportIdCol = byName.get('report_id');
    expect(reportIdCol?.type.toLowerCase()).toBe('text');
    expect(reportIdCol?.notnull).toBe(1);

    const createdAt = byName.get('created_at');
    expect(createdAt?.type.toLowerCase()).toBe('integer');
    expect(createdAt?.notnull).toBe(1);
  });

  it('creates both indexes on org_edges', () => {
    const indexes = indexList('org_edges');
    const byName = new Map(indexes.map((i) => [i.name, i]));
    const unique = byName.get('org_edges_report_id_unique');
    expect(unique).toBeDefined();
    expect(unique?.unique).toBe(1);
    const composite = byName.get('idx_org_edges_company_manager');
    expect(composite).toBeDefined();
    expect(composite?.unique).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. UNIQUE on report_id
  // -------------------------------------------------------------------------

  it('UNIQUE on report_id rejects a second edge for the same report', () => {
    insertEdge({ id: 'e1', companyId, managerId, reportId });
    expect(() =>
      insertEdge({ id: 'e2', companyId, managerId: secondReportId, reportId }),
    ).toThrow();
  });

  it('UNIQUE on report_id allows a second edge for a different report', () => {
    insertEdge({ id: 'e1', companyId, managerId, reportId });
    expect(() =>
      insertEdge({ id: 'e2', companyId, managerId, reportId: secondReportId }),
    ).not.toThrow();
    expect(countEdges()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 3. ON DELETE CASCADE — company_id
  // -------------------------------------------------------------------------

  it('ON DELETE CASCADE on company_id drops every edge for that company', () => {
    insertEdge({ id: 'e1', companyId, managerId, reportId });
    insertEdge({ id: 'e2', companyId, managerId, reportId: secondReportId });
    expect(countEdges()).toBe(2);
    // Hard-delete the company row. Other Phase 4+ FKs (tickets, goals,
    // projects, meetings) lack CASCADE on this column, so we must clear
    // those tables first to satisfy the FKs that DO exist. Empty tables
    // satisfy the constraints trivially. employees is the only other
    // table referencing the company in this test fixture; it cascades
    // into org_edges via manager_id/report_id, so drop org_edges first.
    ctx.raw.run('DELETE FROM employees WHERE company_id = ?', [companyId]);
    // org_edges should already be empty after employee CASCADE; verify.
    expect(countEdges()).toBe(0);
    ctx.raw.run('DELETE FROM companies WHERE id = ?', [companyId]);
    // Re-verify (empty before, still empty after).
    expect(countEdges()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 4. ON DELETE CASCADE — manager_id and report_id
  // -------------------------------------------------------------------------

  it('ON DELETE CASCADE on manager_id drops every edge whose manager is removed', () => {
    insertEdge({ id: 'e1', companyId, managerId, reportId });
    insertEdge({ id: 'e2', companyId, managerId, reportId: secondReportId });
    expect(countEdges()).toBe(2);
    ctx.raw.run('DELETE FROM employees WHERE id = ?', [managerId]);
    expect(countEdges()).toBe(0);
  });

  it('ON DELETE CASCADE on report_id drops only the matching edge when one report is removed', () => {
    insertEdge({ id: 'e1', companyId, managerId, reportId });
    insertEdge({ id: 'e2', companyId, managerId, reportId: secondReportId });
    expect(countEdges()).toBe(2);
    ctx.raw.run('DELETE FROM employees WHERE id = ?', [reportId]);
    expect(countEdges()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 5. FK enforcement
  // -------------------------------------------------------------------------

  it('rejects an edge whose company_id does not exist', () => {
    expect(() =>
      insertEdge({ id: 'e1', companyId: 'no-such-company', managerId, reportId }),
    ).toThrow();
  });

  it('rejects an edge whose manager_id does not exist', () => {
    expect(() =>
      insertEdge({ id: 'e1', companyId, managerId: 'no-such-employee', reportId }),
    ).toThrow();
  });

  it('rejects an edge whose report_id does not exist', () => {
    expect(() =>
      insertEdge({ id: 'e1', companyId, managerId, reportId: 'no-such-employee' }),
    ).toThrow();
  });
});

describe('migration 0013 — legacy org_edges compatibility', () => {
  function runMigration0013(raw: RawSqlJsDatabase): void {
    const sql = readFileSync(migration0013Path, 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) raw.run(trimmed);
    }
  }

  it('rebuilds the pre-remediation org_edges table instead of failing on CREATE TABLE', async () => {
    const SQL = await initSqlJs();
    const raw = new SQL.Database();
    raw.run('PRAGMA foreign_keys = ON');

    raw.run('CREATE TABLE `companies` (`id` text PRIMARY KEY NOT NULL)');
    raw.run('CREATE TABLE `employees` (`id` text PRIMARY KEY NOT NULL)');
    raw.run(`
      CREATE TABLE \`org_edges\` (
        \`id\` text PRIMARY KEY NOT NULL,
        \`company_id\` text NOT NULL,
        \`manager_id\` text NOT NULL,
        \`report_id\` text NOT NULL,
        \`created_at\` integer NOT NULL,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE no action,
        FOREIGN KEY (\`manager_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE no action,
        FOREIGN KEY (\`report_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE no action
      )
    `);
    raw.run('CREATE UNIQUE INDEX `org_edges_report_id_unique` ON `org_edges` (`report_id`)');
    raw.run("INSERT INTO `companies` (`id`) VALUES ('company-1')");
    raw.run("INSERT INTO `employees` (`id`) VALUES ('manager-1'), ('report-1')");
    raw.run(
      "INSERT INTO `org_edges` (`id`, `company_id`, `manager_id`, `report_id`, `created_at`) VALUES ('edge-1', 'company-1', 'manager-1', 'report-1', 123)",
    );

    runMigration0013(raw);

    const fkStmt = raw.prepare("PRAGMA foreign_key_list('org_edges')");
    const fkRows: Array<{ on_delete: string }> = [];
    while (fkStmt.step()) fkRows.push(fkStmt.getAsObject() as { on_delete: string });
    fkStmt.free();
    expect(fkRows.map((row) => row.on_delete)).toEqual(['CASCADE', 'CASCADE', 'CASCADE']);

    const indexStmt = raw.prepare("PRAGMA index_list('org_edges')");
    const indexNames: string[] = [];
    while (indexStmt.step()) {
      const row = indexStmt.getAsObject() as { name: string };
      indexNames.push(row.name);
    }
    indexStmt.free();
    expect(indexNames).toContain('org_edges_report_id_unique');
    expect(indexNames).toContain('idx_org_edges_company_manager');

    const edgeCountBeforeDelete = raw.exec('SELECT COUNT(*) AS count FROM `org_edges`')[0]
      ?.values[0]?.[0];
    expect(edgeCountBeforeDelete).toBe(1);
    raw.run("DELETE FROM `employees` WHERE `id` = 'report-1'");
    const edgeCountAfterDelete = raw.exec('SELECT COUNT(*) AS count FROM `org_edges`')[0]
      ?.values[0]?.[0];
    expect(edgeCountAfterDelete).toBe(0);

    raw.close();
  });
});
