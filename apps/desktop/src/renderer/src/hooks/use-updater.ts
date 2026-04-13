import { useMutation } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useCheckForUpdate() {
  return useMutation({
    mutationFn: () => ipc.updater.check(),
  });
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => ipc.updater.install(),
  });
}
