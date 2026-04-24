import { useState } from 'react';

import { Boxes, Download, LibraryBig, Loader2, PackagePlus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCompanies } from '@/hooks/use-companies.js';
import {
  useCompanyTemplates,
  useExportCompanyTemplate,
  useInstallCompanyTemplate,
} from '@/hooks/use-company-portability.js';
import { useAppStore } from '@/store/app-store.js';

export function PortabilitySection() {
  const companyId = useAppStore((state) => state.companyId);
  const { data: companies = [] } = useCompanies();
  const templatesQuery = useCompanyTemplates();
  const exportTemplate = useExportCompanyTemplate(companyId);
  const installTemplate = useInstallCompanyTemplate();
  const [packagePath, setPackagePath] = useState('');

  const activeCompany = companies.find((company) => company.id === companyId) ?? null;

  const canInstall = packagePath.trim().length > 0 && !installTemplate.isPending;

  async function handleInstall() {
    if (!canInstall) return;
    try {
      await installTemplate.mutateAsync(packagePath.trim());
      setPackagePath('');
    } catch {
      // Mutation state drives the inline error row.
    }
  }

  return (
    <section className="space-y-3" data-settings-portability="">
      <div className="flex items-center gap-2">
        <LibraryBig className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Portability & Templates
        </h4>
        {(exportTemplate.isPending || installTemplate.isPending) && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Working" />
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Save the active workspace as a reusable operating template, install external Team-X template
        packages into the local library, and then create new workspaces from those templates through
        the workspace switcher.
      </p>

      <div className="space-y-4 rounded-lg border border-border bg-surface-50 p-4">
        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-brand" />
                Save active workspace as template
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {activeCompany
                  ? `${activeCompany.name} will export into the local template library with live project and ticket state stripped out by default.`
                  : 'Select an active workspace before exporting a reusable template.'}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!activeCompany || exportTemplate.isPending}
              onClick={() => exportTemplate.mutate()}
            >
              {exportTemplate.isPending ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
          {exportTemplate.isSuccess && (
            <p className="mt-3 text-[11px] text-emerald-600">
              Template saved to {exportTemplate.data.packagePath}
            </p>
          )}
          {exportTemplate.isError && (
            <p className="mt-3 text-[11px] text-destructive">
              Failed to save template: {String(exportTemplate.error)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PackagePlus className="h-4 w-4 text-brand" />
            Install local template package
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Register an existing `.teamx-package.json` template into the local library so it shows
            up in the workspace creation flow.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={packagePath}
              onChange={(event) => setPackagePath(event.target.value)}
              placeholder="C:\\templates\\ops-template.teamx-package.json"
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" disabled={!canInstall} onClick={handleInstall}>
              {installTemplate.isPending ? 'Installing...' : 'Install'}
            </Button>
          </div>
          {installTemplate.isError && (
            <p className="mt-3 text-[11px] text-destructive">
              Failed to install template: {String(installTemplate.error)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Boxes className="h-4 w-4 text-brand" />
            Local template library
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Template-backed workspace creation lives in the workspace switcher. This library keeps
            the reusable operating models visible and local-first.
          </p>

          {templatesQuery.isLoading ? (
            <div className="mt-3 space-y-2" aria-busy="true">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : templatesQuery.isError ? (
            <p className="mt-3 text-[11px] text-destructive">
              Failed to load the local template library.
            </p>
          ) : (templatesQuery.data?.length ?? 0) === 0 ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              No local templates yet. Save the active workspace as a template or install an external
              template package to seed this library.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {templatesQuery.data?.map((template) => (
                <div
                  key={template.packagePath}
                  className="rounded-lg border border-white/10 bg-background/70 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {template.company.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {template.company.slug} · exported{' '}
                        {new Date(template.manifest.exportedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <Download className="h-3 w-3" />
                      Template
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{template.employeeCount} employees</span>
                    <span>{template.runtimeProfileCount} runtimes</span>
                    <span>{template.routineCount} routines</span>
                    <span>{template.extensionCount} extensions</span>
                    <span>{template.starterAssetCount} starter assets</span>
                  </div>

                  <p className="mt-3 truncate font-mono text-[10px] text-muted-foreground/75">
                    {template.packagePath}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
