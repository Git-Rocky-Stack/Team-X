/**
 * IPC handlers — Local operators and the cloud-link device identity.
 * Split from handlers.ts by bounded context (audit 2026-10-07 P1-7).
 */

import { OPERATOR_MEMBERSHIP_ROLES, SHARED_OPERATOR_AUTH_MODES } from '@team-x/shared-types';

import type { HandlerContext } from './context.js';
import type { IpcHandlers } from './contract.js';
import { assertCompanyActive } from './mappers.js';

export type OperatorsCloudHandlers = Pick<
  IpcHandlers,
  | 'operatorsList'
  | 'operatorsReadiness'
  | 'cloudGetWorkspaceLink'
  | 'cloudLinkWorkspace'
  | 'cloudUnlinkWorkspace'
  | 'cloudReconnectWorkspace'
  | 'operatorsListInvites'
  | 'operatorsCreateInvite'
  | 'operatorsRevokeInvite'
  | 'operatorsAcceptInvite'
>;

export function createOperatorsCloudHandlers(ctx: HandlerContext): OperatorsCloudHandlers {
  const { companiesRepo, operatorAccessService, cloudLinkService, emitUserAuditEvent } = ctx;
  return {
    async operatorsList(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] operators.list: companyId is required');
      }
      if (!operatorAccessService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] operators.list: operatorAccessService dep unwired — returning an empty operator set',
          );
        }
        return [];
      }
      return operatorAccessService.listByCompany(req.companyId);
    },

    async operatorsReadiness(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] operators.readiness: companyId is required');
      }
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.readiness: operatorAccessService dep is required');
      }
      return operatorAccessService.getSharingReadiness(req.companyId);
    },

    async cloudGetWorkspaceLink(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.getWorkspaceLink: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.getWorkspaceLink: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.getWorkspaceLink');
      return cloudLinkService.getWorkspaceLink(req.companyId);
    },

    async cloudLinkWorkspace(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.linkWorkspace: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.linkWorkspace: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.linkWorkspace');

      const started = cloudLinkService.startLink(req.companyId);
      emitUserAuditEvent('company.linkStarted', req.companyId, {
        companyId: req.companyId,
        cloudWorkspaceId: started.cloudWorkspaceId ?? 'unknown',
        cloudTenantId: started.cloudTenantId ?? 'unknown',
        linkedDeviceId: started.linkedDeviceId ?? started.deviceId,
        startedAt: Date.now(),
      });

      try {
        const linked = cloudLinkService.completeLink(req.companyId);
        emitUserAuditEvent('company.linked', req.companyId, {
          companyId: req.companyId,
          cloudWorkspaceId: linked.cloudWorkspaceId ?? 'unknown',
          cloudTenantId: linked.cloudTenantId ?? 'unknown',
          linkedDeviceId: linked.linkedDeviceId ?? linked.deviceId,
          linkedAt: linked.lastSyncAt ?? Date.now(),
        });
        return linked;
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : 'Workspace link failed.';
        const failed = cloudLinkService.failLink(req.companyId, message);
        emitUserAuditEvent('company.linkFailed', req.companyId, {
          companyId: req.companyId,
          action: 'link',
          error: failed.lastSyncError ?? message,
          failedAt: Date.now(),
        });
        throw err;
      }
    },

    async cloudUnlinkWorkspace(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.unlinkWorkspace: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.unlinkWorkspace: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.unlinkWorkspace');

      const previous = cloudLinkService.getWorkspaceLink(req.companyId);
      const unlinked = cloudLinkService.unlinkWorkspace(req.companyId);
      emitUserAuditEvent('company.unlinked', req.companyId, {
        companyId: req.companyId,
        previousCloudWorkspaceId: previous.cloudWorkspaceId,
        previousCloudTenantId: previous.cloudTenantId,
        unlinkedAt: Date.now(),
      });
      return unlinked;
    },

    async cloudReconnectWorkspace(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] cloud.reconnectWorkspace: companyId is required');
      }
      if (!cloudLinkService) {
        throw new Error('[ipc] cloud.reconnectWorkspace: cloudLinkService dep is required');
      }
      assertCompanyActive(companiesRepo, req.companyId, 'cloud.reconnectWorkspace');

      try {
        const reconnected = cloudLinkService.reconnectWorkspace(req.companyId);
        emitUserAuditEvent('company.reconnected', req.companyId, {
          companyId: req.companyId,
          cloudWorkspaceId: reconnected.cloudWorkspaceId ?? 'unknown',
          cloudTenantId: reconnected.cloudTenantId ?? 'unknown',
          linkedDeviceId: reconnected.linkedDeviceId ?? reconnected.deviceId,
          reconnectedAt: reconnected.lastSyncAt ?? Date.now(),
        });
        return reconnected;
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : 'Workspace reconnect failed.';
        const failed = cloudLinkService.failLink(req.companyId, message);
        emitUserAuditEvent('company.linkFailed', req.companyId, {
          companyId: req.companyId,
          action: 'reconnect',
          error: failed.lastSyncError ?? message,
          failedAt: Date.now(),
        });
        throw err;
      }
    },

    async operatorsListInvites(req) {
      if (typeof req.companyId !== 'string' || req.companyId.length === 0) {
        throw new Error('[ipc] operators.listInvites: companyId is required');
      }
      if (!operatorAccessService) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '[ipc] operators.listInvites: operatorAccessService dep unwired — returning an empty invite set',
          );
        }
        return [];
      }
      return operatorAccessService.listInvitesByCompany(req.companyId);
    },

    async operatorsCreateInvite(req) {
      const companyId = req.companyId?.trim();
      if (!companyId) {
        throw new Error('[ipc] operators.createInvite: companyId is required');
      }
      const email = req.email?.trim();
      if (!email) {
        throw new Error('[ipc] operators.createInvite: email is required');
      }
      if (!email.includes('@')) {
        throw new Error('[ipc] operators.createInvite: email must look like a real email');
      }
      if (!SHARED_OPERATOR_AUTH_MODES.includes(req.authMode)) {
        throw new Error(
          `[ipc] operators.createInvite: authMode must be one of ${SHARED_OPERATOR_AUTH_MODES.join(', ')}`,
        );
      }
      if (!OPERATOR_MEMBERSHIP_ROLES.includes(req.role)) {
        throw new Error(
          `[ipc] operators.createInvite: role must be one of ${OPERATOR_MEMBERSHIP_ROLES.join(', ')}`,
        );
      }
      if (req.role === 'owner') {
        throw new Error(
          '[ipc] operators.createInvite: owner invites are not supported until shared ownership lands',
        );
      }
      assertCompanyActive(companiesRepo, companyId, 'operators.createInvite');
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.createInvite: operatorAccessService dep is required');
      }
      return {
        invite: operatorAccessService.createInvite({
          ...req,
          companyId,
          email,
        }),
      };
    },

    async operatorsRevokeInvite(req) {
      const inviteId = req.inviteId?.trim();
      if (!inviteId) {
        throw new Error('[ipc] operators.revokeInvite: inviteId is required');
      }
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.revokeInvite: operatorAccessService dep is required');
      }
      return operatorAccessService.revokeInvite(inviteId);
    },

    async operatorsAcceptInvite(req) {
      const inviteId = req.inviteId?.trim();
      if (!inviteId) {
        throw new Error('[ipc] operators.acceptInvite: inviteId is required');
      }
      if (!operatorAccessService) {
        throw new Error('[ipc] operators.acceptInvite: operatorAccessService dep is required');
      }
      return operatorAccessService.acceptInvite(inviteId);
    },
  };
}
