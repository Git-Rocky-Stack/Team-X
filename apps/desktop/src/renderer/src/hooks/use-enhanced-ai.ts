/**
 * React Query hooks for the Enhanced AI subsystem IPC surface (Phase 5 — M32).
 *
 * Exposes:
 *   - `useEnhancedAiConfig()` — full Enhanced AI configuration snapshot
 *     (LLM provider, model, feature toggles for Phase 2 & 3 capabilities).
 *   - `useSetEnhancedAiConfig()` — partial patch; invalidates config cache
 *     on success.
 *
 * All hooks route through the preload bridge via `@/lib/ipc`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsSetEnhancedAiConfigRequest } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useEnhancedAiConfig() {
  return useQuery({
    queryKey: ['enhanced-ai-config'],
    queryFn: () => ipc.settings.getEnhancedAiConfig(),
  });
}

export function useSetEnhancedAiConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: SettingsSetEnhancedAiConfigRequest) => ipc.settings.setEnhancedAiConfig(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enhanced-ai-config'] });
    },
  });
}
