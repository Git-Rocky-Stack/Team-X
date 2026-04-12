import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipc } from '@/lib/ipc.js';

export function useMeetings(companyId: string | null) {
  return useQuery({
    queryKey: ['meetings', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.meetings.list(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useMeetingDetail(meetingId: string | null) {
  return useQuery({
    queryKey: ['meeting-detail', meetingId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.meetings.get(meetingId!),
    enabled: meetingId !== null && meetingId.length > 0,
    refetchInterval: 2000,
  });
}

export function useCallMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: Parameters<typeof ipc.meetings.call>[0]) => ipc.meetings.call(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
}

export function useEndMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: string) => ipc.meetings.end(meetingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] });
      qc.invalidateQueries({ queryKey: ['meeting-detail'] });
    },
  });
}

export function useInterjectMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { meetingId: string; content: string }) => ipc.meetings.interject(req),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['meeting-detail', variables.meetingId] });
    },
  });
}
