import type { Employee } from '@team-x/shared-types';
import { useState } from 'react';

import { Faceplate, RecessedWell } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(0_0%_0%/0.55)]">
      <Faceplate className="w-full max-w-md" bodyClassName="p-6">
        <h2 className="text-h3 text-foreground">Call Meeting</h2>
        <p className="mt-1 text-caption text-muted-foreground">
          Select attendees, a chair, and set the agenda.
        </p>

        {/* Agenda */}
        <div className="mt-4">
          <label htmlFor="meeting-agenda" className="block text-label text-muted-foreground">
            Agenda
          </label>
          <textarea
            id="meeting-agenda"
            className="well-input mt-1 w-full px-3 py-2"
            rows={3}
            placeholder="What should be discussed?"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
          />
        </div>

        {/* Chair selection */}
        <div className="mt-3">
          <label htmlFor="meeting-chair" className="block text-label text-muted-foreground">
            Chair
          </label>
          <select
            id="meeting-chair"
            className="well-input mt-1 w-full px-3 py-2"
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
          <legend className="block text-label text-muted-foreground">Attendees</legend>
          <RecessedWell className="mt-1 max-h-40 space-y-1 overflow-y-auto p-2">
            {employees.map((emp) => (
              <label
                key={emp.id}
                className="flex items-center gap-2 rounded px-2 py-1 text-body hover:bg-[hsl(0_0%_100%/0.06)]"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(emp.id)}
                  onChange={() => toggleAttendee(emp.id)}
                  className="h-3.5 w-3.5 rounded border-border accent-brand"
                />
                <span className="text-[var(--display-fg)]">{emp.name}</span>
                <span className="text-caption text-silver-mute">({emp.title})</span>
              </label>
            ))}
          </RecessedWell>
        </fieldset>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCall}
            disabled={selectedIds.size === 0 || callMeeting.isPending}
          >
            {callMeeting.isPending ? 'Starting...' : 'Start Meeting'}
          </Button>
        </div>
      </Faceplate>
    </div>
  );
}
