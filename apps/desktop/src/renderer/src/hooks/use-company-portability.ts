import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useExportCompanyTemplate(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      ipc.companies.exportPackage({
        companyId: requireString(companyId, 'companyId'),
        mode: 'template',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-templates'] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useInstallCompanyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packagePath: string) => ipc.companies.installTemplate({ packagePath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-templates'] });
    },
  });
}

export function useImportCompanyPackage() {
  return useMutation({
    mutationFn: ipc.companies.importPackage,
  });
}
