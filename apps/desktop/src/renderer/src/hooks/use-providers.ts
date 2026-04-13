/**
 * React Query hooks for the Providers settings (Phase 3 — M18).
 *
 * Five hooks matching the five providers IPC channels:
 * - useProviders — list all configured providers
 * - useAddProvider — register a new provider
 * - useUpdateProvider — update config / toggle / set API key
 * - useRemoveProvider — delete a provider
 * - useTestProviderConnection — test API key + connectivity
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AddProviderRequest, UpdateProviderRequest } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => ipc.providers.list(),
  });
}

export function useAddProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AddProviderRequest) => ipc.providers.add(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateProviderRequest) => ipc.providers.update(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useRemoveProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) => ipc.providers.remove(providerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });
}

export function useTestProviderConnection() {
  return useMutation({
    mutationFn: (providerId: string) => ipc.providers.testConnection(providerId),
  });
}
