import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useInstalledExtensions(companyId: string | null) {
  return useQuery({
    queryKey: ['extensions', companyId],
    queryFn: () => ipc.extensions.list(companyId!),
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

export function useCreateAuthorityGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.authority.create,
    onSuccess: (_result, req) => {
      qc.invalidateQueries({ queryKey: ['authority', req.companyId] });
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
      qc.invalidateQueries({ queryKey: ['effective-authority', companyId] });
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

export function useAddMcpServer(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ipc.mcp.addServer,
    onSuccess: () => {
      if (!companyId) return;
      qc.invalidateQueries({ queryKey: ['mcp', companyId] });
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
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
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
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
      qc.invalidateQueries({ queryKey: ['extensions', companyId] });
    },
  });
}

export function useTestMcpConnection() {
  return useMutation({
    mutationFn: ipc.mcp.testConnection,
  });
}
