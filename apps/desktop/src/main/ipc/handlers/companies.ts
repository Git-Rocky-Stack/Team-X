/**
 * IPC handlers — Workspace lifecycle: list, update, archive, delete, package
 * export/import, templates.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import { COMPANY_PACKAGE_MODES } from '@team-x/shared-types';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import {
  applySecretBindings,
  assertCompanyActive,
  assertPackageRef,
  assertSecretBindings,
  rowToCompany,
} from './mappers.js';

export type CompaniesHandlers = Pick<
  IpcHandlers,
  | 'companiesList'
  | 'companiesExportPackage'
  | 'companiesPreviewImportPackage'
  | 'companiesImportPackage'
  | 'companiesListTemplates'
  | 'companiesInstallTemplate'
>;

export function createCompaniesHandlers(ctx: HandlerContext): CompaniesHandlers {
  const { companiesRepo, companyPortabilityService, secretsStore, emitUserAuditEvent } = ctx;
  return {
    async companiesList() {
      return companiesRepo.list().map(rowToCompany);
    },

    async companiesExportPackage(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] companies.exportPackage: companyId is required');
      }
      if (!COMPANY_PACKAGE_MODES.includes(req.mode)) {
        throw new Error(`[ipc] companies.exportPackage: invalid mode "${String(req.mode)}"`);
      }
      if (!companyPortabilityService) {
        throw new Error('[ipc] companies.exportPackage: companyPortabilityService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'companies.exportPackage');
      const result = await companyPortabilityService.exportCompany(req);
      emitUserAuditEvent('company.packageExported', req.companyId, {
        mode: req.mode,
        packageId: result.manifest.packageId,
        packagePath: result.packagePath,
        exportedAt: result.manifest.exportedAt,
        sharingMode: result.manifest.sharingMode,
        sectionCount: result.manifest.sections.length,
      });
      return result;
    },

    async companiesPreviewImportPackage(req) {
      const packageRef = assertPackageRef(req, 'companies.previewImportPackage');
      if (!companyPortabilityService) {
        throw new Error(
          '[ipc] companies.previewImportPackage: companyPortabilityService dep is required',
        );
      }
      return companyPortabilityService.previewImport(packageRef);
    },

    async companiesImportPackage(req) {
      const packageRef = assertPackageRef(req, 'companies.importPackage');
      if (req.name !== undefined && typeof req.name !== 'string') {
        throw new Error('[ipc] companies.importPackage: name must be a string when provided');
      }
      if (req.slug !== undefined && typeof req.slug !== 'string') {
        throw new Error('[ipc] companies.importPackage: slug must be a string when provided');
      }
      const secretBindings = assertSecretBindings(req.secretBindings, 'companies.importPackage');
      if (!companyPortabilityService) {
        throw new Error('[ipc] companies.importPackage: companyPortabilityService dep is required');
      }
      await applySecretBindings(secretsStore, secretBindings);
      const result = await companyPortabilityService.importAsNewCompany({
        ...packageRef,
        name: req.name,
        slug: req.slug,
        secretBindings,
      });
      emitUserAuditEvent('company.packageImported', result.companyId, {
        packageId: result.manifest.packageId,
        mode: result.manifest.mode,
        packageRef: packageRef.packageRef ?? packageRef.packagePath,
        sharingMode: result.manifest.sharingMode,
        secretBindingCount: secretBindings.length,
        importedAt: Date.now(),
      });
      return result;
    },

    async companiesListTemplates(req) {
      if (!companyPortabilityService) {
        throw new Error('[ipc] companies.listTemplates: companyPortabilityService dep is required');
      }
      if (req?.companyId !== undefined) {
        if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
          throw new Error(
            '[ipc] companies.listTemplates: companyId must be a non-empty string when provided',
          );
        }
        assertCompanyActive(companiesRepo, req.companyId.trim(), 'companies.listTemplates');
      }
      return {
        templates: await companyPortabilityService.listTemplates(),
      };
    },

    async companiesInstallTemplate(req) {
      const packageRef = assertPackageRef(req, 'companies.installTemplate');
      if (req.companyId !== undefined) {
        if (typeof req.companyId !== 'string' || req.companyId.trim().length === 0) {
          throw new Error(
            '[ipc] companies.installTemplate: companyId must be a non-empty string when provided',
          );
        }
        assertCompanyActive(companiesRepo, req.companyId.trim(), 'companies.installTemplate');
      }
      const secretBindings = assertSecretBindings(req.secretBindings, 'companies.installTemplate');
      if (!companyPortabilityService) {
        throw new Error(
          '[ipc] companies.installTemplate: companyPortabilityService dep is required',
        );
      }
      await applySecretBindings(secretsStore, secretBindings);
      const result = await companyPortabilityService.installTemplate(packageRef);
      if (req.companyId) {
        emitUserAuditEvent('company.templateInstalled', req.companyId.trim(), {
          packageId: result.manifest.packageId,
          packagePath: result.packagePath,
          packageRef: packageRef.packageRef ?? packageRef.packagePath,
          templateName: result.company.name,
          sharingMode: result.manifest.sharingMode,
          secretBindingCount: secretBindings.length,
        });
      }
      return {
        template: result,
      };
    },
  };
}
