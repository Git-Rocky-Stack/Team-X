/**
 * Source-string audit for `CreateCompanyDialog` (Phase 5.6 M-D step
 * (a+b) collapse per Rocky's iron-rule directive + the 2026-04-19
 * ground-zero audit remediation).
 *
 * Renderer-test convention reminder: every renderer test in this
 * workspace runs under `environment: 'node'` per
 * `apps/desktop/vitest.config.ts`. Pure source-string audits, no
 * jsdom / RTL. Visual + interactive behavior lives in the step (g)
 * E2E spec — this file pins contracts that make refactor-introduced
 * drift fail first, cheapest, with a clear error.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const DIALOG_PATH = join(currentDirname, 'create-company-dialog.tsx');
const HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-create-company.ts');

const dialogSrc = readFileSync(DIALOG_PATH, 'utf8');
const hookSrc = readFileSync(HOOK_PATH, 'utf8');

describe('CreateCompanyDialog (features/workspace/create-company-dialog.tsx)', () => {
  it('exports the CreateCompanyDialog component with the controlled-open props contract', () => {
    expect(dialogSrc).toContain('export function CreateCompanyDialog(');
    expect(dialogSrc).toMatch(/open:\s*boolean/);
    expect(dialogSrc).toMatch(/onOpenChange:\s*\(open:\s*boolean\)\s*=>\s*void/);
  });

  it('wires to ipc.companies.create via the useCreateCompany mutation', () => {
    expect(dialogSrc).toContain('useCreateCompany');
    expect(dialogSrc).toMatch(/createMutation\.mutate\(/);
  });

  // Validation contract — mirrors the main-side handler contract.

  it('enforces the slug regex matching the main-side handler', () => {
    // The regex MUST be the exact slug shape the M-C step b handler
    // enforces. A drift here silently loosens client-side validation
    // and surfaces server-side rejections users could have avoided.
    expect(dialogSrc).toMatch(/\/\^\[a-z0-9\]\[a-z0-9-\]\{0,62\}\$\//);
  });

  it('enforces the 120-character name length cap', () => {
    expect(dialogSrc).toMatch(/MAX_NAME_LENGTH\s*=\s*120/);
  });

  it('auto-suggests slug from name via the suggestSlug helper', () => {
    expect(dialogSrc).toMatch(/function\s+suggestSlug/);
    // Multi-line tolerant — the helper chains .toLowerCase().replace()
    // across newlines per the prevailing format style. The audit only
    // cares that the chain exists, not the exact whitespace shape.
    expect(dialogSrc).toMatch(
      /name[\s\S]*?\.toLowerCase\(\)[\s\S]*?\.replace\(\/\[\^a-z0-9\]\+\/g/,
    );
    // Slice to the 63-char slug cap — matches the regex upper bound.
    expect(dialogSrc).toMatch(/\.slice\(0,\s*63\)/);
  });

  it('latches slug-dirty on first manual edit so auto-suggest stops overwriting user input', () => {
    expect(dialogSrc).toMatch(/if\s*\(!slugDirty\)\s*setSlugDirty\(true\)/);
    expect(dialogSrc).toMatch(/if\s*\(slugDirty\)\s*return/);
  });

  it('trims the name before submitting to match the handler contract', () => {
    expect(dialogSrc).toMatch(/name:\s*name\.trim\(\)/);
  });

  // Submit / success / error paths.

  it('flips the active companyId on success so downstream views re-scope immediately', () => {
    expect(dialogSrc).toMatch(/setCompanyId\(result\.companyId\)/);
  });

  it('closes the dialog on success and resets form state', () => {
    expect(dialogSrc).toMatch(
      /onSuccess:\s*\(result\)\s*=>\s*\{[\s\S]*?reset\(\)[\s\S]*?onOpenChange\(false\)/,
    );
  });

  it('pattern-matches duplicate-slug rewrap and surfaces it as a slug field error', () => {
    // The main-side handler re-wraps SQL UNIQUE violations as
    // "slug \"X\" is already in use" — the client must recognise
    // that shape and route the error to the slug field, not the
    // generic footer row.
    expect(dialogSrc).toMatch(/slug\\s\+\["'\]\?\.\*\["'\]\?\\s\+is already in use/);
    expect(dialogSrc).toMatch(/setSlugError\('A workspace with this slug already exists\.'\)/);
  });

  it('surfaces generic errors in a separate footer row (not overwriting field errors)', () => {
    expect(dialogSrc).toContain('data-create-company-error="submit"');
    expect(dialogSrc).toMatch(/setSubmitError\(/);
  });

  it('guards against double-submit when a mutation is pending', () => {
    expect(dialogSrc).toMatch(/if\s*\(createMutation\.isPending\)\s*return/);
    expect(dialogSrc).toMatch(/submitDisabled\s*=\s*createMutation\.isPending/);
  });

  // F10 states — stable data-* anchors for the step (g) E2E.

  it('anchors the dialog + fields + theme choices + submit with stable data-* selectors', () => {
    expect(dialogSrc).toContain('data-create-company-dialog=""');
    expect(dialogSrc).toContain('data-create-company-field="name"');
    expect(dialogSrc).toContain('data-create-company-field="slug"');
    expect(dialogSrc).toContain('data-create-company-theme={choice}');
    expect(dialogSrc).toContain('data-create-company-submit=""');
  });

  it('anchors each error state with a stable data-create-company-error selector', () => {
    expect(dialogSrc).toContain('data-create-company-error="name"');
    expect(dialogSrc).toContain('data-create-company-error="slug"');
    expect(dialogSrc).toContain('data-create-company-error="submit"');
  });

  it('loading state: submit label + disabled ternary on createMutation.isPending', () => {
    expect(dialogSrc).toMatch(
      /createMutation\.isPending\s*\?\s*'Creating\.\.\.'\s*:\s*'Create workspace'/,
    );
  });

  it('disabled state: submit disabled when fields empty OR mutation pending', () => {
    expect(dialogSrc).toMatch(/submitDisabled\s*=\s*createMutation\.isPending\s*\|\|/);
    expect(dialogSrc).toMatch(/name\.trim\(\)\.length\s*===\s*0/);
    expect(dialogSrc).toMatch(/slug\.length\s*===\s*0/);
  });

  // Accessibility contract.

  it('marks invalid fields with aria-invalid + aria-describedby pointing at the error element', () => {
    expect(dialogSrc).toMatch(/aria-invalid=\{nameError\s*!==\s*null\}/);
    expect(dialogSrc).toMatch(/aria-invalid=\{slugError\s*!==\s*null\}/);
    expect(dialogSrc).toMatch(
      /aria-describedby=\{nameError\s*\?\s*'create-company-name-error'\s*:\s*undefined\}/,
    );
    expect(dialogSrc).toMatch(
      /aria-describedby=\{slugError\s*\?\s*'create-company-slug-error'\s*:\s*undefined\}/,
    );
  });

  it('renders the theme selector as a semantic fieldset + legend with native radio inputs', () => {
    // Native HTML semantics (fieldset / legend / input type=radio +
    // shared name) — preferred over an ARIA composite-widget pattern
    // per Biome's useSemanticElements rule + WCAG 4.1.2 / 1.3.1. The
    // visual button-like styling lives on the wrapping <label>; the
    // native radio is sr-only so screen readers see the real
    // form control while sighted users see the styled affordance.
    expect(dialogSrc).toMatch(/<fieldset[^>]*>/);
    expect(dialogSrc).toMatch(/<legend[^>]*>Theme<\/legend>/);
    expect(dialogSrc).toMatch(/<input\s+type="radio"/);
    expect(dialogSrc).toMatch(/name="create-company-theme"/);
    expect(dialogSrc).toMatch(/checked=\{isSelected\}/);
    expect(dialogSrc).toMatch(/className="sr-only"/);
    // Negative — the previous role="radio" + aria-checked composite
    // pattern was replaced; a refactor that brings it back would
    // re-introduce the Biome useSemanticElements lint error.
    expect(dialogSrc).not.toMatch(/role="radiogroup"/);
    expect(dialogSrc).not.toMatch(/role="radio"/);
  });

  it('focus-within + brand-ring accessibility on the theme labels', () => {
    // The label wraps a focusable input — focus styling lives on the
    // label via focus-within (the input is sr-only, so focus-visible
    // on the input itself wouldn't surface the ring to sighted users).
    expect(dialogSrc).toContain('focus-within:ring-brand');
  });

  it('documents the step (a+b) collapse + iron-rule + 2026-04-19 audit in JSDoc', () => {
    expect(dialogSrc).toContain('Phase 5.6 M-D step (b)');
    expect(dialogSrc).toContain('iron-rule');
    expect(dialogSrc).toContain('2026-04-19');
  });
});

describe('useCreateCompany (hooks/use-create-company.ts)', () => {
  it('exports a useMutation hook wired to ipc.companies.create', () => {
    expect(hookSrc).toContain('export function useCreateCompany()');
    expect(hookSrc).toMatch(/useMutation</);
    expect(hookSrc).toMatch(/mutationFn:\s*\(req\)\s*=>\s*ipc\.companies\.create\(req\)/);
  });

  it('does NOT carry its own onSuccess invalidation (global useCompanyEventSync owns that path)', () => {
    // The global event-sync hook listens for company.created and
    // invalidates ['companies'] via the bus per invariant #11. A
    // local onSuccess invalidation here would double-invalidate +
    // re-establish the per-hook invalidation pattern the sync hook
    // was designed to replace. The negative assertion catches a
    // future refactor that accidentally re-adds it.
    expect(hookSrc).not.toMatch(/onSuccess[\s\S]*?invalidateQueries/);
    expect(hookSrc).not.toMatch(/useQueryClient/);
  });

  it('types the mutation parameters to the shared IPC contract', () => {
    expect(hookSrc).toContain('CompaniesCreateRequest');
    expect(hookSrc).toContain('CompaniesCreateResponse');
    expect(hookSrc).toMatch(/from\s+['"]@team-x\/shared-types['"]/);
  });

  it('documents the M-D step (b) lineage + audit anchor', () => {
    expect(hookSrc).toContain('Phase 5.6 M-D step (b)');
    expect(hookSrc).toContain('2026-04-19-m-d-step-a-ground-zero-audit.md');
  });
});
