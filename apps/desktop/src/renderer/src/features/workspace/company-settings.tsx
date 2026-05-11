import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompaniesUpdateRequest, Company } from '@team-x/shared-types';
import { AlertTriangle, Archive, Building2, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useProviders } from '@/hooks/use-providers.js';

import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet.js';
import { MissionInsetSurface, MissionSheetHeader } from '@/features/mission/mission-shell.js';
import { ipc } from '@/lib/ipc.js';
import { cn } from '@/lib/utils.js';
import { useAppStore } from '@/store/app-store.js';

interface CompanySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MAX_NAME_LENGTH = 120;
type ThemeChoice = 'dark' | 'light';

function normalizeTheme(theme: string | undefined): ThemeChoice {
  return theme === 'light' ? 'light' : 'dark';
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.length > 0) return err.message;
  const message = String(err);
  return message.length > 0 ? message : fallback;
}

/**
 * Phase 5.6 M-D step (c) — workspace settings surface.
 *
 * Owns the renderer side of the M-C company write IPC that already
 * exists (`companies.update`, `companies.archive`, `companies.delete`).
 * The switcher mounts this sheet as a sibling of the dropdown so the
 * menu can close cleanly before the focus-trapped sheet opens.
 */
export function CompanySettings({ open, onOpenChange, company }: CompanySettingsProps) {
  const queryClient = useQueryClient();
  const setCompanyId = useAppStore((s) => s.setCompanyId);
  const { data: providers } = useProviders();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [theme, setTheme] = useState<ThemeChoice>('dark');
  const [defaultProviderId, setDefaultProviderId] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const updateMutation = useMutation({
    mutationFn: (req: CompaniesUpdateRequest) => ipc.companies.update(req),
  });
  const archiveMutation = useMutation({
    mutationFn: (companyId: string) => ipc.companies.archive(companyId),
  });
  const deleteMutation = useMutation({
    mutationFn: (companyId: string) => ipc.companies.delete({ companyId }),
  });

  useEffect(() => {
    if (!company || !open) return;
    setName(company.name);
    setSlug(company.slug);
    setIcon(company.icon ?? '');
    setTheme(normalizeTheme(company.theme));
    setDefaultProviderId(company.settings.defaultProviderId ?? '');
    setNameError(null);
    setSlugError(null);
    setSubmitError(null);
    setDeleteConfirm('');
  }, [company, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setNameError(null);
      setSlugError(null);
      setSubmitError(null);
      setDeleteConfirm('');
      updateMutation.reset();
      archiveMutation.reset();
      deleteMutation.reset();
    }
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
      setSlugError('Slug must be 1-63 chars, lowercase letters/digits/hyphens, no leading hyphen.');
      valid = false;
    } else {
      setSlugError(null);
    }

    setSubmitError(null);
    return valid;
  }

  async function handleSave() {
    if (!company || updateMutation.isPending) return;
    if (!validate()) return;

    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();
    const nextIcon = trimmedIcon.length > 0 ? trimmedIcon : null;

    try {
      await updateMutation.mutateAsync({
        companyId: company.id,
        name: trimmedName,
        slug,
        icon: nextIcon,
        theme,
        settings: {
          ...company.settings,
          theme,
          defaultProviderId: defaultProviderId || undefined,
        },
      });

      queryClient.setQueryData<Company[]>(['companies'], (current = []) =>
        current.map((item) =>
          item.id === company.id
            ? {
                ...item,
                name: trimmedName,
                slug,
                icon: nextIcon,
                theme,
                settings: {
                  ...item.settings,
                  theme,
                  defaultProviderId: defaultProviderId || undefined,
                },
              }
            : item,
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    } catch (err) {
      const message = errorMessage(err, 'Failed to update workspace.');
      if (/slug\s+["']?.*["']?\s+is already in use/i.test(message)) {
        setSlugError('A workspace with this slug already exists.');
        return;
      }
      setSubmitError(message);
    }
  }

  function removeCompanyFromCache(companyId: string): Company[] {
    let remainingActive: Company[] = [];
    queryClient.setQueryData<Company[]>(['companies'], (current = []) => {
      const next = current.filter((item) => item.id !== companyId);
      remainingActive = next.filter((item) => item.status !== 'archived');
      return next;
    });
    return remainingActive;
  }

  async function handleArchive() {
    if (!company || archiveMutation.isPending) return;
    try {
      await archiveMutation.mutateAsync(company.id);
      const remaining = removeCompanyFromCache(company.id);
      setCompanyId(remaining[0]?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      handleOpenChange(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Failed to archive workspace.'));
    }
  }

  async function handleDelete() {
    if (!company || deleteMutation.isPending) return;
    if (deleteConfirm !== company.name) return;
    try {
      await deleteMutation.mutateAsync(company.id);
      const remaining = removeCompanyFromCache(company.id);
      setCompanyId(remaining[0]?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
      handleOpenChange(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Failed to delete workspace.'));
    }
  }

  const isBusy = updateMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;
  const deleteEnabled = company !== null && deleteConfirm === company.name && !isBusy;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="mission-shell flex w-full flex-col overflow-hidden border-l border-white/10 bg-black p-0 sm:max-w-md"
        data-company-settings-panel=""
      >
        <div className="mission-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex h-full flex-col">
          <MissionSheetHeader
            eyebrow="Workspace control"
            icon={Building2}
            title={<SheetTitle className="text-h3">Company settings</SheetTitle>}
            description={
              <SheetDescription className="m-0 text-body">
                Keep workspace identity current, tune the visible theme, and manage lifecycle
                actions from one control sheet.
              </SheetDescription>
            }
          />

          {!company ? (
            <div className="px-5 py-8 text-body text-muted-foreground">No workspace selected.</div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
              <MissionInsetSurface className="p-4">
                <div>
                  <h3 className="text-h3 text-foreground">General</h3>
                  <p className="mt-1 text-body text-muted-foreground">
                    Name, slug, icon, and theme apply to this workspace.
                  </p>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="company-settings-name"
                      className="text-label text-muted-foreground"
                    >
                      Workspace name
                    </label>
                    <Input
                      id="company-settings-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={MAX_NAME_LENGTH + 20}
                      aria-invalid={nameError !== null}
                      aria-describedby={nameError ? 'company-settings-name-error' : undefined}
                      data-company-settings-field="name"
                      className="border-white/10 bg-black"
                    />
                    {nameError ? (
                      <p
                        id="company-settings-name-error"
                        className="text-caption text-destructive"
                        data-company-settings-error="name"
                      >
                        {nameError}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="company-settings-slug"
                      className="text-label text-muted-foreground"
                    >
                      Slug
                    </label>
                    <Input
                      id="company-settings-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      maxLength={80}
                      aria-invalid={slugError !== null}
                      aria-describedby={slugError ? 'company-settings-slug-error' : undefined}
                      data-company-settings-field="slug"
                      className="border-white/10 bg-black"
                    />
                    {slugError ? (
                      <p
                        id="company-settings-slug-error"
                        className="text-caption text-destructive"
                        data-company-settings-error="slug"
                      >
                        {slugError}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="company-settings-icon"
                      className="text-label text-muted-foreground"
                    >
                      Icon
                    </label>
                    <Input
                      id="company-settings-icon"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="Optional"
                      maxLength={16}
                      data-company-settings-field="icon"
                      className="border-white/10 bg-black"
                    />
                  </div>

                  <fieldset className="space-y-2 border-0 p-0">
                    <legend className="text-label text-muted-foreground">Theme</legend>
                    <div className="flex gap-2">
                      {(['dark', 'light'] as ThemeChoice[]).map((choice) => {
                        const isSelected = theme === choice;
                        return (
                          <label
                            key={choice}
                            data-company-settings-theme={choice}
                            className={cn(
                              'flex-1 cursor-pointer rounded-[18px] border px-3 py-3 text-center text-button-sm capitalize transition-colors',
                              'focus-within:outline-none focus-within:ring-2 focus-within:ring-brand',
                              isSelected
                                ? 'border-brand/30 bg-black text-brand'
                                : 'border-white/10 bg-black text-muted-foreground hover:bg-black',
                            )}
                          >
                            <input
                              type="radio"
                              name="company-settings-theme"
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

                  <div className="space-y-1.5">
                    <label
                      htmlFor="company-settings-provider"
                      className="text-label text-muted-foreground"
                    >
                      Default provider
                    </label>
                    <select
                      id="company-settings-provider"
                      value={defaultProviderId}
                      onChange={(e) => setDefaultProviderId(e.target.value)}
                      data-company-settings-field="defaultProviderId"
                      className="h-10 w-full rounded-md border border-white/10 bg-black px-3 text-body text-foreground outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/30"
                    >
                      <option value="">Use system defaults</option>
                      {providers?.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} ({provider.kind})
                        </option>
                      ))}
                    </select>
                    <p className="text-caption text-muted-foreground">
                      Default LLM provider for all employees. Employees can override this in their
                      profile.
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isBusy || name.trim().length === 0 || slug.length === 0}
                    data-company-settings-save=""
                    className="w-full rounded-[18px] border border-brand/40 bg-black text-brand hover:bg-black"
                  >
                    <Save className="h-4 w-4" />
                    {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </MissionInsetSurface>

              <MissionInsetSurface
                tone="danger"
                className="mt-4 border-destructive/25 bg-black p-4"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden="true" />
                  <div>
                    <h3 className="text-h3 text-foreground">Danger zone</h3>
                    <p className="mt-1 text-body text-muted-foreground">
                      Archive removes this workspace from active use. Delete is permanent.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleArchive()}
                    disabled={isBusy}
                    data-company-settings-archive=""
                    className="w-full justify-start rounded-[18px] border-white/10 bg-black text-foreground hover:bg-black"
                  >
                    <Archive className="h-4 w-4" />
                    {archiveMutation.isPending ? 'Archiving...' : 'Archive workspace'}
                  </Button>

                  <details className="rounded-[20px] border border-destructive/25 bg-black p-3">
                    <summary className="cursor-pointer text-label text-destructive">
                      Permanently delete this workspace
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="text-caption text-muted-foreground">
                        Type <span className="font-semibold text-foreground">{company.name}</span>{' '}
                        to confirm.
                      </p>
                      <Input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder={company.name}
                        data-company-settings-delete-confirm=""
                        className="border-white/10 bg-black"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void handleDelete()}
                        disabled={!deleteEnabled}
                        data-company-settings-delete=""
                        className="w-full justify-start rounded-[18px]"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleteMutation.isPending ? 'Deleting...' : 'Delete workspace'}
                      </Button>
                    </div>
                  </details>
                </div>
              </MissionInsetSurface>

              {submitError ? (
                <p
                  className="mt-4 text-caption text-destructive"
                  data-company-settings-error="submit"
                >
                  {submitError}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
