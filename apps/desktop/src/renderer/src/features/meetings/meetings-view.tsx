import type { Employee, Meeting } from '@team-x/shared-types';
import { Calendar, Clock, Plus, Users2 } from 'lucide-react';
import { useState } from 'react';

import { CallMeetingDialog } from './call-meeting-dialog.js';
import { MeetingDetailPanel } from './meeting-detail.js';

import { Faceplate, LampTile, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
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
      className={`well w-full px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 ${
        selected
          ? 'border-[var(--armed-edge)] bg-[var(--armed-soft)]'
          : 'border-[var(--hairline)] hover:border-[var(--hairline-strong)]'
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
        <LampTile
          small
          interactive={false}
          label={liveStatus ? 'Live' : 'Ended'}
          tone={liveStatus ? 'armed' : 'off'}
          className="mt-0.5 shrink-0"
        />
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
      <div className="flex h-full flex-col justify-center px-6">
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading meetings..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col justify-center px-6">
        <SubviewState
          lampLabel="NO-GO"
          lampTone="nogo"
          title="Failed to load meetings"
          action={
            <Button size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
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
          <div className="p-4 pb-0">
            <Faceplate
              kicker="Meetings"
              serial="ALL HANDS"
              bodyClassName="flex items-center justify-between px-5 py-4"
            >
              <div>
                <h1 className="text-h1 text-foreground">Meetings</h1>
                <p className="text-caption text-silver-mute">
                  {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button size="sm" onClick={() => setCallOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Call Meeting
              </Button>
            </Faceplate>
          </div>

          {/* Meeting list */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {meetings.length === 0 ? (
              <SubviewState
                lampLabel="STBY"
                lampTone="off"
                title="No meetings yet"
                description="Call a meeting to bring your team together."
              />
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
