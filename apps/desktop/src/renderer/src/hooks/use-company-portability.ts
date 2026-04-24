import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CompanyPackageMode } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';
import { requireString } from '@/lib/required.js';

export function useCompanyTemplates() {
  return useQuery({
    queryKey: ['company-templates'],
    queryFn: async () => (await ipc.companies.listTemplates()).templates,
  });
}

export function useCompanyTemplatePreview(packagePath: string | null) {
  return useQuery({
    queryKey: ['company-template-preview', packagePath],
    queryFn: () =>
      ipc.companies.previewImportPackage({
        packagePath: requireString(packagePath, 'packagePath'),
      }),
    enabled: packagePath !== null && packagePath.length > 0,
  });
}

export function useCompanyPackagePreview(packagePath: string | null) {
  return useCompanyTemplatePreview(packagePath);
}

export function useExportCompanyPackage(
  companyId: string | null,
  mode: CompanyPackageMode,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      ipc.companies.exportPackage({
        companyId: requireString(companyId, 'companyId'),
        mode,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-templates'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useExportCompanyTemplate(companyId: string | null) {
  return useExportCompanyPackage(companyId, 'template');
}

export function useExportWorkspacePackage(companyId: string | null) {
  return useExportCompanyPackage(companyId, 'workspace-export');
}

export function useInstallCompanyTemplate(companyId: string | null = null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packagePath: string) =>
      ipc.companies.installTemplate({
        ...(companyId ? { companyId } : {}),
        packagePath,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-templates'] });
    },
  });
}

export function useImportCompanyPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.companies.importPackage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
