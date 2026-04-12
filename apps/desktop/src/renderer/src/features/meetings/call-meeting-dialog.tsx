import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { useCallMeeting } from '@/hooks/use-meetings.js';

interface CallMeetingDialogProps {
  companyId: string;
  employees: Employee[];
  open: boolean;
  onClose: () => void;
  onCreated: (meetingId: string) => void;
}

export function CallMeetingDialog({
  companyId,
  employees,
  open,
  onClose,
  onCreated,
}: CallMeetingDialogProps) {
  const [agenda, setAgenda] = useState('');
  const [chairId, setChairId] = useState(employees[0]?.id ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const callMeeting = useCallMeeting();

  if (!open) return null;

  const toggleAttendee = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCall = async () => {
    if (!chairId || selectedIds.size === 0) return;
    const attendeeIds = [...selectedIds];
    if (!attendeeIds.includes(chairId)) attendeeIds.unshift(chairId);

    const result = await callMeeting.mutateAsync({
      companyId,
      chairId,
      attendeeIds,
      agenda,
    });
    onCreated(result.meetingId);
    setAgenda('');
    setSelectedIds(new Set());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-foreground">Call Meeting</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Select attendees, a chair, and set the agenda.
        </p>

        {/* Agenda */}
        <div className="mt-4">
          <label
            htmlFor="meeting-agenda"
            className="block text-xs font-medium text-muted-foreground"
          >
            Agenda
          </label>
          <textarea
            id="meeting-agenda"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-brand"
            rows={3}
            placeholder="What should be discussed?"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
          />
        </div>

        {/* Chair selection */}
        <div className="mt-3">
          <label
            htmlFor="meeting-chair"
            className="block text-xs font-medium text-muted-foreground"
          >
            Chair
          </label>
          <select
            id="meeting-chair"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
            value={chairId}
            onChange={(e) => setChairId(e.target.value)}
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.title})
              </option>
            ))}
          </select>
        </div>

        {/* Attendee checkboxes */}
        <fieldset className="mt-3 border-none p-0 m-0">
          <legend className="block text-xs font-medium text-muted-foreground">Attendees</legend>
          <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {employees.map((emp) => (
              <label
                key={emp.id}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(emp.id)}
                  onChange={() => toggleAttendee(emp.id)}
                  className="h-3.5 w-3.5 rounded border-border accent-brand"
                />
                <span className="text-foreground">{emp.name}</span>
                <span className="text-xs text-muted-foreground">({emp.title})</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCall}
            disabled={selectedIds.size === 0 || callMeeting.isPending}
            className="rounded-lg bg-brand px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {callMeeting.isPending ? 'Starting...' : 'Start Meeting'}
          </button>
        </div>
      </div>
    </div>
  );
}
