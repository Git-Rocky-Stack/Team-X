import { useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Company } from '@team-x/shared-types';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { useCreateCompany } from '@/hooks/use-create-company.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

/**
 * Phase 5.6 M-D step (b) — `CreateCompanyDialog`.
 *
 * Wires the workspace create flow end-to-end. Per Rocky's iron-rule
 * directive (no disabled "Soon" placeholders, no deferred corner-
 * cutting — documented in the 2026-04-19 ground-zero audit remediation
 * section), the dialog is a full ship: name + slug + theme fields,
 * client-side validation mirroring the M-C step b handler contract,
 * auto-slug suggestion from name with a dirty-flag opt-out, submit
 * path to `companies.create` + `setCompanyId` flip on success.
 *
 * Validation mirrors the main-side handler contract exactly so a
 * server-side rejection is a genuine edge case (duplicate slug
 * under concurrency) rather than a trivial typo the client could
 * have caught:
 *   - name: trimmed, non-empty, ≤120 chars.
 *   - slug: `/^[a-z0-9][a-z0-9-]{0,62}$/` (lowercase alphanumerics +
 *     hyphen, 1–63 chars, no leading hyphen).
 *   - theme: optional, one of `'dark' | 'light'` when supplied.
 *   - settings: optional; omitted in step (b) — step (c)
 *     CompanySettings panel surfaces the mcp_configs_json /
 *     provider_prefs_json / max_concurrent_agents editors.
 *
 * Success path:
 *   - `setCompanyId(result.companyId)` flips the active workspace so
 *     the switcher + every downstream view re-scope immediately.
 *   - Dialog closes.
 *   - No toast — matches the existing HireDialog convention (the
 *     switcher re-render itself is the visual confirmation). A
 *     repo-wide toast infrastructure does not exist today; adding it
 *     is a future cross-cutting concern, not a step (b) scope.
 *
 * Error path:
 *   - Duplicate slug → handler re-wraps as `slug "X" is already in
 *     use`. Renderer pattern-matches the message and surfaces it as
 *     an inline field error on the slug input without closing the
 *     dialog, so the user can correct and resubmit.
 *   - Other errors → inline generic error row under the footer; user
 *     can retry.
 *
 * Anchors stable `data-create-company-*` selectors across the 5 F10
 * states (loading during submit / field-error / duplicate-slug-error /
 * generic-error / disabled-submit) for the step (g) E2E spec.
 */
interface CreateCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Matches the main-side handler contract in `apps/desktop/src/main/ipc/
// handlers.ts companiesCreate`. Changing either side in isolation
// would introduce a client/server validation gap.
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_NAME_LENGTH = 120;

type ThemeChoice = 'dark' | 'light';

function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function CreateCompanyDialog({ open, onOpenChange }: CreateCompanyDialogProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>('dark');
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const setCompanyId = useAppStore((s) => s.setCompanyId);
  const queryClient = useQueryClient();
  const createMutation = useCreateCompany();

  // Auto-suggest slug from name UNTIL the user manually edits the slug
  // field, matching the standard create-flow UX convention. Once the
  // user touches the slug, `slugDirty` latches and typing in the name
  // no longer overwrites the user's custom slug.
  useEffect(() => {
    if (slugDirty) return;
    setSlug(suggestSlug(name));
  }, [name, slugDirty]);

  function reset() {
    setName('');
    setSlug('');
    setSlugDirty(false);
    setTheme('dark');
    setNameError(null);
    setSlugError(null);
    setSubmitError(null);
    createMutation.reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function validate(): boolean {
    let valid = true;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError('Name is required.');
      valid = false;
    } else if (trimmedName.length > MAX_NAME_LENGTH) {
      setNameError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
      valid = false;
    } else {
      setNameError(null);
    }

    if (!SLUG_REGEX.test(slug)) {
      setSlugError('Slug must be 1–63 chars, lowercase letters/digits/hyphens, no leading hyphen.');
      valid = false;
    } else {
      setSlugError(null);
    }

    setSubmitError(null);
    return valid;
  }

  function handleSubmit() {
    if (createMutation.isPending) return;
    if (!validate()) return;

    createMutation.mutate(
      { name: name.trim(), slug, theme },
      {
        onSuccess: async (result, variables) => {
          const createdCompany: Company = {
            id: result.companyId,
            name: variables.name,
            slug: variables.slug,
            createdAt: Date.now(),
            settings:
              variables.theme === 'light' || variables.theme === 'dark'
                ? { theme: variables.theme }
                : {},
          };

          queryClient.setQueryData<Company[]>(['companies'], (current = []) => {
            if (current.some((company) => company.id === createdCompany.id)) return current;
            return [...current, createdCompany];
          });

          try {
            await queryClient.invalidateQueries({ queryKey: ['companies'] });
          } finally {
            setCompanyId(result.companyId);
            reset();
            onOpenChange(false);
          }
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : String(err);
          // Handler re-wraps duplicate-slug UNIQUE violations as
          // `slug "X" is already in use`. Pattern-match on that
          // prefix + the quoted slug substring so the error surfaces
          // on the slug field, not the generic footer row.
          if (/slug\s+["']?.*["']?\s+is already in use/i.test(message)) {
            setSlugError('A workspace with this slug already exists.');
            return;
          }
          setSubmitError(message || 'Failed to create workspace.');
        },
      },
    );
  }

  const submitDisabled = createMutation.isPending || name.trim().length === 0 || slug.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg" data-create-company-dialog="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand" />
            Create workspace
          </DialogTitle>
          <DialogDescription>
            Spin up a new Strategia workspace. The system-agent and system-copilot are provisioned
            automatically so the workspace is usable on first open.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <label
              htmlFor="create-company-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Workspace name
            </label>
            <Input
              id="create-company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dynasty-X"
              maxLength={MAX_NAME_LENGTH + 20}
              autoFocus
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? 'create-company-name-error' : undefined}
              data-create-company-field="name"
            />
            {nameError ? (
              <p
                id="create-company-name-error"
                className="text-xs text-destructive"
                data-create-company-error="name"
              >
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="create-company-slug"
              className="text-xs font-medium text-muted-foreground"
            >
              Slug
              <span className="ml-1 font-normal text-muted-foreground/70">
                (URL-safe identifier — auto-suggested from name)
              </span>
            </label>
            <Input
              id="create-company-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                if (!slugDirty) setSlugDirty(true);
              }}
              placeholder="e.g. dynasty-x"
              maxLength={80}
              aria-invalid={slugError !== null}
              aria-describedby={slugError ? 'create-company-slug-error' : undefined}
              data-create-company-field="slug"
            />
            {slugError ? (
              <p
                id="create-company-slug-error"
                className="text-xs text-destructive"
                data-create-company-error="slug"
              >
                {slugError}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-1.5 border-0 p-0">
            <legend className="text-xs font-medium text-muted-foreground">Theme</legend>
            <div className="flex gap-2">
              {(['dark', 'light'] as ThemeChoice[]).map((choice) => {
                const isSelected = theme === choice;
                return (
                  <label
                    key={choice}
                    data-create-company-theme={choice}
                    className={cn(
                      'flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-xs font-medium capitalize transition-colors',
                      'focus-within:outline-none focus-within:ring-2 focus-within:ring-brand',
                      isSelected
                        ? 'border-brand/40 bg-brand/5 text-brand'
                        : 'border-border bg-surface-50 text-muted-foreground hover:bg-surface-100',
                    )}
                  >
                    <input
                      type="radio"
                      name="create-company-theme"
                      value={choice}
                      checked={isSelected}
                      onChange={() => setTheme(choice)}
                      className="sr-only"
                    />
                    <span>{choice}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        {submitError ? (
          <p className="text-xs text-destructive" data-create-company-error="submit">
            {submitError}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitDisabled}
            data-create-company-submit=""
            className="bg-brand text-white hover:bg-brand/90"
          >
            {createMutation.isPending ? 'Creating...' : 'Create workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
