import type { Employee, Meeting } from '@team-x/shared-types';
import { Calendar, Clock, Plus, Users2 } from 'lucide-react';
import { useState } from 'react';

import { CallMeetingDialog } from './call-meeting-dialog.js';
import { MeetingDetailPanel } from './meeting-detail.js';

import { useMeetingEventSync, useMeetings } from '@/hooks/use-meetings.js';
import { useAppStore } from '@/store/app-store.js';

interface MeetingsViewProps {
  companyId: string | null;
  employees: Employee[];
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const setActiveMeetingId = useAppStore((s) => s.setActiveMeetingId);
  const activeMeetingId = useAppStore((s) => s.activeMeetingId);
  const selected = activeMeetingId === meeting.id;
  const liveStatus = meeting.status === 'active';

  const dateStr = new Date(meeting.startedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timeStr = new Date(meeting.startedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <button
      type="button"
      onClick={() => setActiveMeetingId(meeting.id)}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
        selected
          ? 'border-brand/40 bg-brand/5 shadow-sm'
          : 'border-border hover:border-border/80 hover:bg-muted/20'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-body-strong text-foreground">
            {meeting.agenda || 'Untitled Meeting'}
          </h4>
          <div className="mt-1 flex items-center gap-3 text-caption text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users2 className="h-3 w-3" />
              {meeting.attendees.length}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dateStr}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeStr}
            </span>
          </div>
        </div>
        <span
          className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            liveStatus ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              liveStatus ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
            }`}
          />
          {liveStatus ? 'Live' : 'Ended'}
        </span>
      </div>
    </button>
  );
}

export function MeetingsView({ companyId, employees }: MeetingsViewProps) {
  const { data: meetings = [], isLoading, isError, refetch } = useMeetings(companyId);
  useMeetingEventSync(companyId);
  const activeMeetingId = useAppStore((s) => s.activeMeetingId);
  const setActiveMeetingId = useAppStore((s) => s.setActiveMeetingId);
  const [callOpen, setCallOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p className="text-caption text-muted-foreground">Loading meetings...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-body-strong text-muted-foreground">Failed to load meetings</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md bg-brand px-4 py-1.5 text-button-sm text-white transition-colors hover:bg-brand/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeMeetings = meetings.filter((m) => m.status === 'active');
  const pastMeetings = meetings.filter((m) => m.status !== 'active');

  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className={`flex-1 overflow-hidden ${activeMeetingId ? 'hidden lg:block' : ''}`}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h1 className="text-h1 text-foreground">Meetings</h1>
              <p className="text-caption text-muted-foreground">
                {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCallOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-button-sm text-white transition-colors hover:bg-brand/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Call Meeting
            </button>
          </div>

          {/* Meeting list */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users2 className="h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-body-strong text-muted-foreground">No meetings yet</p>
                <p className="mt-1 text-caption text-muted-foreground/60">
                  Call a meeting to bring your team together.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeMeetings.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-eyebrow-sm text-muted-foreground/60">Active</p>
                    <div className="space-y-1.5">
                      {activeMeetings.map((m) => (
                        <MeetingRow key={m.id} meeting={m} />
                      ))}
                    </div>
                  </div>
                )}
                {pastMeetings.length > 0 && (
                  <div className={activeMeetings.length > 0 ? 'mt-4' : ''}>
                    <p className="mb-1.5 text-eyebrow-sm text-muted-foreground/60">Past</p>
                    <div className="space-y-1.5">
                      {pastMeetings.map((m) => (
                        <MeetingRow key={m.id} meeting={m} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {activeMeetingId && (
        <div className="w-full lg:w-[440px] shrink-0">
          <MeetingDetailPanel meetingId={activeMeetingId} />
        </div>
      )}

      {/* Call meeting dialog */}
      {companyId && (
        <CallMeetingDialog
          companyId={companyId}
          employees={employees}
          open={callOpen}
          onClose={() => setCallOpen(false)}
          onCreated={(id) => setActiveMeetingId(id)}
        />
      )}
    </div>
  );
}
