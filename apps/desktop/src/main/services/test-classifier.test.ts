/**
 * Unit tests for the canned test-mode classifier.
 *
 * Coverage:
 *   - Exact-match canned table returns the expected intent + entities.
 *   - `fire <name>` prefix synthesises `fire_employee` + `employeeQuery`.
 *   - Unknown input falls back to `complex_request` with zero confidence.
 *   - `__ECHO_INTENT__:<json>` sentinel override is honoured verbatim.
 *   - Malformed sentinel JSON falls through to the fallback tier.
 *   - Whitespace + case insensitivity for the canned table lookup.
 *
 * The test-classifier ships purely as a test-mode shim, so these
 * tests pin the canned behaviour the Playwright E2E spec depends on.
 */

import type { NluContext } from '@team-x/intelligence';
import { describe, expect, it } from 'vitest';


import { createTestClassifier } from './test-classifier.js';

const CTX: NluContext = { companyId: 'co-1' };

describe('createTestClassifier', () => {
  it('returns canned hire_employee for "hire a senior frontend engineer"', async () => {
    const c = createTestClassifier();
    const r = await c.classify('hire a senior frontend engineer', CTX);
    expect(r.intent).toBe('hire_employee');
    // Rewritten to a role that exists in the bundled strategia-official
    // pack so the resolver returns `unique` and the spec can proceed.
    expect(r.entities.roleQuery).toBe('Growth Marketer');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r.rawText).toBe('hire a senior frontend engineer');
  });

  it('is case-insensitive for canned-table lookup', async () => {
    const c = createTestClassifier();
    const r = await c.classify('  HIRE A Growth Marketer  ', CTX);
    expect(r.intent).toBe('hire_employee');
    expect(r.entities.roleQuery).toBe('Growth Marketer');
  });

  it('synthesises fire_employee + employeeQuery from a "fire <name>" prefix', async () => {
    const c = createTestClassifier();
    const r = await c.classify('fire Alice Zhang', CTX);
    expect(r.intent).toBe('fire_employee');
    expect(r.entities.employeeQuery).toBe('Alice Zhang');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('fire pattern is case-insensitive', async () => {
    const c = createTestClassifier();
    const r = await c.classify('FIRE Bob', CTX);
    expect(r.intent).toBe('fire_employee');
    expect(r.entities.employeeQuery).toBe('Bob');
  });

  it('unknown input falls back to complex_request with zero confidence', async () => {
    const c = createTestClassifier();
    const r = await c.classify('walk the dog', CTX);
    expect(r.intent).toBe('complex_request');
    expect(r.confidence).toBe(0);
    expect(r.entities).toEqual({});
  });

  it('empty input falls back to complex_request', async () => {
    const c = createTestClassifier();
    const r = await c.classify('   ', CTX);
    expect(r.intent).toBe('complex_request');
    expect(r.confidence).toBe(0);
  });

  it('honours __ECHO_INTENT__ sentinel verbatim', async () => {
    const c = createTestClassifier();
    const r = await c.classify(
      '__ECHO_INTENT__:{"intent":"assign_ticket","entities":{"ticketQuery":"auth bug","assigneeQuery":"Sarah"},"confidence":0.88}',
      CTX,
    );
    expect(r.intent).toBe('assign_ticket');
    expect(r.entities.ticketQuery).toBe('auth bug');
    expect(r.entities.assigneeQuery).toBe('Sarah');
    expect(r.confidence).toBe(0.88);
  });

  it('falls through on malformed sentinel JSON', async () => {
    const c = createTestClassifier();
    const r = await c.classify('__ECHO_INTENT__:not a json', CTX);
    expect(r.intent).toBe('complex_request');
    expect(r.confidence).toBe(0);
  });

  it('falls through when sentinel JSON is missing the intent field', async () => {
    const c = createTestClassifier();
    const r = await c.classify('__ECHO_INTENT__:{"entities":{"x":"y"}}', CTX);
    expect(r.intent).toBe('complex_request');
  });
});
