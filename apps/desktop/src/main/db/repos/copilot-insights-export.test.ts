import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TestDbHandle, makeTestDb } from '../test-helpers.js';

import { createCompaniesRepo } from './companies.js';
import {
  createCopilotInsightsRepo,
  serializeCopilotInsightsCsv,
  serializeCopilotInsightsJson,
} from './copilot-insights.js';

describe('copilot-insights export read model', () => {
  let ctx: TestDbHandle;
  let repo: ReturnType<typeof createCopilotInsightsRepo>;
  let companyOne: string;
  let companyTwo: string;
  const now = 1_700_000_000_000;

  beforeEach(async () => {
    ctx = await makeTestDb();
    const companies = createCompaniesRepo(ctx.db);
    repo = createCopilotInsightsRepo(ctx.db);
    companyOne = companies.create({ name: 'One Co', slug: 'one-co' });
    companyTwo = companies.create({ name: 'Two Co', slug: 'two-co' });
  });

  afterEach(() => {
    ctx.close();
  });

  function seedExportRows() {
    const activeCost = repo.create({
      companyId: companyOne,
      category: 'cost',
      severity: 'warning',
      title: 'Token spend, rising',
      detail: 'Cost rose "30%" today.\nReview telemetry.',
      actionSuggestion: 'Open telemetry',
      actionIntent: 'show_view',
      actionEntitiesJson: '{"view":"telemetry"}',
      now: now + 1,
      expiresAt: now + 60_000,
    });
    const activeOrg = repo.create({
      companyId: companyOne,
      category: 'org',
      severity: 'info',
      title: 'New hire needs tickets',
      detail: 'Assign starter work.',
      now: now + 2,
      expiresAt: now + 60_000,
    });
    const otherCompany = repo.create({
      companyId: companyTwo,
      category: 'cost',
      severity: 'critical',
      title: 'Global cost spike',
      detail: 'All-company export should include this.',
      now: now + 3,
      expiresAt: now + 60_000,
    });
    const dismissed = repo.create({
      companyId: companyOne,
      category: 'cost',
      severity: 'warning',
      title: 'Dismissed cost',
      detail: 'Should not export.',
      now: now + 4,
      expiresAt: now + 60_000,
    });
    repo.dismiss(dismissed, now + 5);
    const expired = repo.create({
      companyId: companyOne,
      category: 'cost',
      severity: 'warning',
      title: 'Expired cost',
      detail: 'Should not export.',
      now: now - 10_000,
      expiresAt: now - 1,
    });

    return { activeCost, activeOrg, otherCompany, dismissed, expired };
  }

  it('exports active company rows with category and severity filters', () => {
    const ids = seedExportRows();

    const result = repo.listActiveForExport({
      scope: 'company',
      companyId: companyOne,
      category: 'cost',
      severity: 'warning',
      now,
    });

    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => row.id)).toEqual([ids.activeCost]);
    expect(result.rows[0]?.companyId).toBe(companyOne);
  });

  it('fails closed when company scope is missing companyId', () => {
    seedExportRows();

    const result = repo.listActiveForExport({
      scope: 'company',
      now,
    });

    expect(result).toEqual({ rows: [], truncated: false });
  });

  it('exports active rows across companies for all-company scope', () => {
    const ids = seedExportRows();

    const result = repo.listActiveForExport({
      scope: 'all',
      category: 'cost',
      now,
    });

    expect(result.rows.map((row) => row.id)).toEqual([ids.otherCompany, ids.activeCost]);
    expect(result.rows.map((row) => row.companyId)).toEqual([companyTwo, companyOne]);
  });

  it('reports truncation when more active rows match than the cap includes', () => {
    seedExportRows();

    const result = repo.listActiveForExport({
      scope: 'all',
      limit: 2,
      now,
    });

    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('serializes JSON with metadata, filters, row count, and insight rows', () => {
    const ids = seedExportRows();
    const result = repo.listActiveForExport({
      scope: 'company',
      companyId: companyOne,
      category: 'cost',
      severity: 'warning',
      now,
    });

    const parsed = JSON.parse(
      serializeCopilotInsightsJson({
        rows: result.rows,
        filter: {
          scope: 'company',
          companyId: companyOne,
          category: 'cost',
          severity: 'warning',
        },
        exportedAtIso: '2026-04-20T10:10:00.000Z',
        truncated: result.truncated,
      }),
    ) as {
      version: number;
      exportedAt: string;
      scope: string;
      companyId: string;
      filters: { category: string; severity: string };
      rowCount: number;
      truncated: boolean;
      insights: Array<{ id: string; title: string; actionEntitiesJson: string | null }>;
    };

    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe('2026-04-20T10:10:00.000Z');
    expect(parsed.scope).toBe('company');
    expect(parsed.companyId).toBe(companyOne);
    expect(parsed.filters).toEqual({ category: 'cost', severity: 'warning' });
    expect(parsed.rowCount).toBe(1);
    expect(parsed.truncated).toBe(false);
    expect(parsed.insights[0]).toMatchObject({
      id: ids.activeCost,
      title: 'Token spend, rising',
      actionEntitiesJson: '{"view":"telemetry"}',
    });
  });

  it('serializes CSV with stable header and escaped text fields', () => {
    seedExportRows();
    const result = repo.listActiveForExport({
      scope: 'company',
      companyId: companyOne,
      category: 'cost',
      severity: 'warning',
      now,
    });

    const csv = serializeCopilotInsightsCsv(result.rows);

    expect(csv.split('\n')[0]).toBe(
      'id,companyId,category,severity,title,detail,actionSuggestion,actionIntent,actionEntitiesJson,createdAt,expiresAt',
    );
    expect(csv).toContain('"Token spend, rising"');
    expect(csv).toContain('"Cost rose ""30%"" today.\nReview telemetry."');
  });
});
