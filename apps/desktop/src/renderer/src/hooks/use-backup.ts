import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useBackupList() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: () => ipc.backup.list(),
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (destination?: string) => ipc.backup.create(destination ? { destination } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (backupPath: string) => ipc.backup.restore({ backupPath }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupPath: string) => ipc.backup.delete({ backupPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });
}
