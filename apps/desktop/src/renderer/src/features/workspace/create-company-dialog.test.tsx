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
// Sweep Phase 2 (Task 8) extracted the cap-chooser class literals to a shared
// module consumed by both create-company-dialog and company-settings (DRY).
// The focus-form pin below now reads that module's source.
const CHOOSER_CAP_PATH = join(currentDirname, 'chooser-cap.ts');

const dialogSrc = readFileSync(DIALOG_PATH, 'utf8');
const hookSrc = readFileSync(HOOK_PATH, 'utf8');
const chooserCapSrc = readFileSync(CHOOSER_CAP_PATH, 'utf8');

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

  it('adds a template-backed create flow via the portability hooks', () => {
    expect(dialogSrc).toContain('useCompanyTemplates');
    expect(dialogSrc).toContain('useCompanyTemplatePreview');
    expect(dialogSrc).toContain('useImportCompanyPackage');
    expect(dialogSrc).toContain("type CreateCompanyMode = 'blank' | 'template';");
    expect(dialogSrc).toContain('data-create-company-mode=""');
    expect(dialogSrc).toContain('data-create-company-template=""');
    expect(dialogSrc).toContain('Create from template');
    expect(dialogSrc).toContain('Workspace source');
    expect(dialogSrc).toContain('Blank Workspace');
    expect(dialogSrc).toContain('From Template');
    expect(dialogSrc).toContain('Settings &gt; Portability &amp; Templates');
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
    expect(dialogSrc).toContain('const trimmedName = name.trim();');
    expect(dialogSrc).toContain('{ name: trimmedName, slug: nextSlug, theme }');
  });

  // Submit / success / error paths.

  it('flips the active companyId on success so downstream views re-scope immediately', () => {
    expect(dialogSrc).toMatch(/setCompanyId\(result\.companyId\)/);
  });

  it('closes the dialog on success and resets form state', () => {
    expect(dialogSrc).toContain(
      'const onSuccess = async (result: { companyId: string }, createdCompany: Company) => {',
    );
    expect(dialogSrc).toContain('reset();');
    expect(dialogSrc).toContain('onOpenChange(false);');
  });

  it('hydrates imported template workspaces into the companies cache too', () => {
    expect(dialogSrc).toContain('importMutation.mutate(');
    expect(dialogSrc).toContain('workspaceOriginId: result.manifest.workspaceOriginId');
    expect(dialogSrc).toContain('companyOriginId: result.manifest.companyOriginId');
  });

  it('hydrates the companies cache before flipping the active companyId', () => {
    expect(dialogSrc).toContain('useQueryClient');
    expect(dialogSrc).toMatch(/setQueryData<Company\[\]>\(\['companies'\]/);
    expect(dialogSrc).toMatch(
      /setQueryData<Company\[\]>\(\['companies'\][\s\S]*?invalidateQueries\(\{ queryKey:\s*\['companies'\]\s*\}\)[\s\S]*?finally\s*\{[\s\S]*?setCompanyId\(result\.companyId\)/,
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
    expect(dialogSrc).toContain(
      'if (createMutation.isPending || importMutation.isPending) return;',
    );
    expect(dialogSrc).toMatch(/submitDisabled\s*=\s*createMutation\.isPending/);
  });

  it('disables template submission until a template is actually selected', () => {
    expect(dialogSrc).toContain("(mode === 'template' && !selectedTemplate)");
    expect(dialogSrc).toContain('No templates available');
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
    expect(dialogSrc).toContain("'Creating from template...'");
    expect(dialogSrc).toContain("'Creating...'");
    expect(dialogSrc).toContain("'Create from template'");
    expect(dialogSrc).toContain("'Create workspace'");
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

  it('focus-within outline accessibility on the theme labels (cap cascade guard)', () => {
    // The label wraps a focusable input — focus styling lives on the
    // label via focus-within (the input is sr-only, so focus-visible
    // on the input itself wouldn't surface the indicator to sighted
    // users). Sweep Phase 2 restyled these labels onto the .cap chooser
    // vocabulary, where the cap recipe sets box-shadow via .dark .cap /
    // .cap.cap-select (specificity 0,2,0 / 0,3,0). Tailwind ring-* is
    // box-shadow-based at (0,1,0) and LOSES to the cap recipes in Night
    // Ops, making a ring focus indicator invisible. The OUTLINE form is
    // used instead — outline does not compete with box-shadow. The literals
    // were extracted to the shared chooser-cap module in Task 8 (DRY), so
    // the positive pin reads that module's source.
    expect(chooserCapSrc).toContain('focus-within:outline');
    expect(chooserCapSrc).toContain('focus-within:outline-2');
    expect(chooserCapSrc).toContain('focus-within:outline-[hsl(var(--ring))]');
    expect(chooserCapSrc).toContain('focus-within:outline-offset-2');
    // The dialog still composes the shared focus token onto its labels.
    expect(dialogSrc).toContain('chooserCapFocus');
    // Negative — the retired ring form is known-broken on caps (loses
    // the box-shadow specificity fight in Night Ops); a refactor that
    // brings it back would silently kill the focus indicator.
    expect(dialogSrc).not.toContain('focus-within:ring-brand');
    expect(chooserCapSrc).not.toContain('focus-within:ring-brand');
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
