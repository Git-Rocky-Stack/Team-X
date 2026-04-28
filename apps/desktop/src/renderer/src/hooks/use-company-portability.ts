import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CompanyPackageMode, CompanyPackageSecretBinding } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';
import { requireString } from '@/lib/required.js';

export function useCompanyTemplates() {
  return useQuery({
    queryKey: ['company-templates'],
    queryFn: async () => (await ipc.companies.listTemplates()).templates,
  });
}

export function useCompanyTemplatePreview(packageRef: string | null) {
  return useQuery({
    queryKey: ['company-template-preview', packageRef],
    queryFn: () =>
      ipc.companies.previewImportPackage({
        packageRef: requireString(packageRef, 'packageRef'),
      }),
    enabled: packageRef !== null && packageRef.length > 0,
  });
}

export function useCompanyPackagePreview(packageRef: string | null) {
  return useCompanyTemplatePreview(packageRef);
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
    mutationFn: (input: string | { packageRef: string; secretBindings?: CompanyPackageSecretBinding[] }) => {
      const packageRef = typeof input === 'string' ? input : input.packageRef;
      const secretBindings = typeof input === 'string' ? undefined : input.secretBindings;
      return ipc.companies.installTemplate({
        ...(companyId ? { companyId } : {}),
        packageRef,
        secretBindings,
      });
    },
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
