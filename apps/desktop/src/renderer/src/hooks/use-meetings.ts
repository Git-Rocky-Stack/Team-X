import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

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

/**
 * Subscribe to the main-process dashboard bus and invalidate the
 * React Query meetings cache when any meeting-lifecycle event lands
 * for the current company.
 *
 * Subscribed events (all emitted from `orchestrator/meeting-service.ts`):
 * - `meeting.started` — `meetings.call` IPC pauses orchestrator + creates thread
 * - `meeting.turn` — meeting service advances next-speaker
 * - `meeting.interjection` — Rocky sends a mid-meeting message
 * - `meeting.ended` — meetings.end IPC generates minutes + resumes orchestrator
 *
 * Why this exists: meetings produce bus events from the service layer
 * (not the IPC handler), and the detail panel's `refetchInterval: 2000`
 * masks some staleness in practice, but any cross-company meeting
 * start/turn/end must invalidate immediately per invariant #11. Also
 * hardens against the copilot analyzer consuming stale meeting state.
 *
 * Added 2026-04-18 per `docs/qa/2026-04-18-ground-zero-audit.md` §3.1.
 */
export function useMeetingEventSync(companyId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const unsubscribe = ipc.events.onDashboard((event) => {
      if (event.companyId !== companyId) return;
      if (
        event.type !== 'meeting.started' &&
        event.type !== 'meeting.turn' &&
        event.type !== 'meeting.interjection' &&
        event.type !== 'meeting.ended'
      ) {
        return;
      }
      qc.invalidateQueries({ queryKey: ['meetings', companyId] });
      qc.invalidateQueries({ queryKey: ['meeting-detail'] });
    });
    return unsubscribe;
  }, [companyId, qc]);
}
