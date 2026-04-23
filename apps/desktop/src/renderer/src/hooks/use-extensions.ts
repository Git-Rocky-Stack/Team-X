import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useInstalledExtensions(companyId: string | null) {
  return useQuery({
    queryKey: ['extensions', companyId],
    queryFn: () => ipc.extensions.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useSkillAssignments(companyId: string | null) {
  return useQuery({
    queryKey: ['skill-assignments', companyId],
    queryFn: () => ipc.extensions.listSkillAssignments(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useAuthorityGrants(companyId: string | null, employeeId?: string | null) {
  return useQuery({
    queryKey: ['authority', companyId, employeeId ?? null],
    queryFn: () => ipc.authority.list({ companyId: companyId!, employeeId }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useAuthorityRequests(
  companyId: string | null,
  status: 'pending' | 'approved' | 'denied' = 'pending',
) {
  return useQuery({
    queryKey: ['authority-requests', companyId, status],
    queryFn: () => ipc.authority.listRequests({ companyId: companyId!, status }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCreateAuthorityGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.authority.create,
    onSuccess: (_result, req) => {
      qc.invalidateQueries({ queryKey: ['authority', req.companyId] });
      qc.invalidateQueries({ queryKey: ['authority-requests', req.companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      qc.invalidateQueries({ queryKey: ['employees', req.companyId] });
      qc.invalidateQueries({ queryKey: ['effective-authority', req.companyId] });
    },
  });
}

export function useDeleteAuthorityGrant(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => ipc.authority.delete(grantId),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['authority', companyId] });
      qc.invalidateQueries({ queryKey: ['authority-requests', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      qc.invalidateQueries({ queryKey: ['effective-authority', companyId] });
    },
  });
}

export function useReviewAuthorityRequest(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      companyId: requestCompanyId,
      requestId,
      decision,
      reason,
    }: {
      companyId: string;
      requestId: string;
      decision: 'approved' | 'denied';
      reason?: string;
    }) =>
      ipc.approvals.review({
        companyId: requestCompanyId,
        itemId: requestId,
        kind: 'authority-request',
        decision,
        rationale: reason,
      }),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['authority', companyId] });
      qc.invalidateQueries({ queryKey: ['approvals', companyId] });
      qc.invalidateQueries({ queryKey: ['authority-requests', companyId] });
      qc.invalidateQueries({ queryKey: ['effective-authority', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useEffectiveAuthority(companyId: string | null, employeeId: string | null) {
  return useQuery({
    queryKey: ['effective-authority', companyId, employeeId],
    queryFn: () => ipc.authority.getEffective({ companyId: companyId!, employeeId: employeeId! }),
    enabled: companyId !== null && companyId.length > 0 && employeeId !== null && employeeId.length > 0,
  });
}

export function useMcpServers(companyId: string | null) {
  return useQuery({
    queryKey: ['mcp', companyId],
    queryFn: () => ipc.mcp.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useInstallLocalSkill(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.extensions.installLocalSkill,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['skill-assignments', companyId] });
      qc.invalidateQueries({ queryKey: ['authority-requests', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useInstallGithubSkill(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.extensions.installGithubSkill,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['skill-assignments', companyId] });
      qc.invalidateQueries({ queryKey: ['authority-requests', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useUpsertSkillAssignment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.extensions.upsertSkillAssignment,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['skill-assignments', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useDeleteSkillAssignment(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => ipc.extensions.deleteSkillAssignment(assignmentId),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['skill-assignments', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useMcpTemplates(companyId: string | null) {
  return useQuery({
    queryKey: ['mcp-templates', companyId],
    queryFn: () => ipc.mcp.listTemplates(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useAddMcpServer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.mcp.addServer,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['mcp', companyId] });
      qc.invalidateQueries({ queryKey: ['mcp-templates', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useInstallMcpTemplate(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.mcp.installTemplate,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['mcp', companyId] });
      qc.invalidateQueries({ queryKey: ['mcp-templates', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useToggleMcpServer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ serverId, enabled }: { serverId: string; enabled: boolean }) =>
      ipc.mcp.toggle(serverId, enabled),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['mcp', companyId] });
      qc.invalidateQueries({ queryKey: ['mcp-templates', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useRemoveMcpServer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => ipc.mcp.removeServer(serverId),
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['mcp', companyId] });
      qc.invalidateQueries({ queryKey: ['mcp-templates', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useTestMcpConnection() {
  return useMutation({
    mutationFn: ipc.mcp.testConnection,
  });
}
