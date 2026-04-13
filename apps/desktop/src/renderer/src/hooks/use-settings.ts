/**
 * React Query hooks for the Settings tab (Phase 3 — M19).
 *
 * Six hooks matching the six settings IPC channels:
 * - useRuntimeSettings / useSetRuntime
 * - usePrivacySettings / useSetPrivacy
 * - useConcurrencySettings / useSetConcurrency
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  SettingsSetConcurrencyRequest,
  SettingsSetPrivacyRequest,
  SettingsSetRuntimeRequest,
} from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useRuntimeSettings() {
  return useQuery({
    queryKey: ['settings', 'runtime'],
    queryFn: () => ipc.settings.getRuntime(),
  });
}

export function useSetRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsSetRuntimeRequest) => ipc.settings.setRuntime(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'runtime'] });
    },
  });
}

export function usePrivacySettings() {
  return useQuery({
    queryKey: ['settings', 'privacy'],
    queryFn: () => ipc.settings.getPrivacy(),
  });
}

export function useSetPrivacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsSetPrivacyRequest) => ipc.settings.setPrivacy(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'privacy'] });
      qc.invalidateQueries({ queryKey: ['settings', 'runtime'] });
    },
  });
}

export function useConcurrencySettings() {
  return useQuery({
    queryKey: ['settings', 'concurrency'],
    queryFn: () => ipc.settings.getConcurrency(),
  });
}

export function useSetConcurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsSetConcurrencyRequest) => ipc.settings.setConcurrency(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'concurrency'] });
      qc.invalidateQueries({ queryKey: ['settings', 'runtime'] });
    },
  });
}
