import { ArrowLeft, Clock, FileText, Send, Square, Users2 } from 'lucide-react';
import { useState } from 'react';

import { LampTile, RecessedWell, SubviewState } from '@/components/console/index.js';
import { Button } from '@/components/ui/button.js';
import { useEndMeeting, useInterjectMeeting, useMeetingDetail } from '@/hooks/use-meetings.js';
import { useAppStore } from '@/store/app-store.js';

interface MeetingDetailPanelProps {
  meetingId: string;
}

export function MeetingDetailPanel({ meetingId }: MeetingDetailPanelProps) {
  const { data: detail, isLoading } = useMeetingDetail(meetingId);
  const endMeeting = useEndMeeting();
  const interject = useInterjectMeeting();
  const setActiveMeetingId = useAppStore((s) => s.setActiveMeetingId);
  const [message, setMessage] = useState('');

  if (isLoading || !detail) {
    return (
      <div className="flex h-full items-center justify-center border-l border-[var(--hairline)] bg-card">
        <SubviewState lampLabel="STBY" lampTone="hold" title="Loading meeting..." />
      </div>
    );
  }

  const isActive = detail.status === 'active';

  const handleInterject = async () => {
    if (!message.trim()) return;
    await interject.mutateAsync({ meetingId, content: message.trim() });
    setMessage('');
  };

  const handleEnd = async () => {
    await endMeeting.mutateAsync(meetingId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInterject();
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setActiveMeetingId(null)}
          className="cap p-1 lg:hidden"
          aria-label="Back to meetings"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-h3 text-foreground">{detail.agenda || 'Meeting'}</h3>
          <div className="flex items-center gap-3 text-caption text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users2 className="h-3 w-3" />
              {detail.attendees.length} attendees
            </span>
            {detail.chair && <span>Chair: {detail.chair.name}</span>}
            <LampTile
              small
              interactive={false}
              label={isActive ? 'Active' : 'Ended'}
              tone={isActive ? 'armed' : 'off'}
            />
          </div>
        </div>
        {isActive && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEnd}
            disabled={endMeeting.isPending}
          >
            <Square className="h-3 w-3" />
            {endMeeting.isPending ? 'Ending...' : 'End Meeting'}
          </Button>
        )}
      </div>

      {/* Minutes (shown after meeting ends) */}
      {!isActive && detail.minutesMd && (
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            Minutes
          </div>
          <RecessedWell className="mt-2 max-h-32 overflow-y-auto px-3 py-2 text-caption text-[var(--display-fg)] whitespace-pre-wrap">
            {detail.minutesMd}
          </RecessedWell>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {detail.messages.length === 0 ? (
          <p className="text-center text-caption text-muted-foreground/60 py-8">No messages yet.</p>
        ) : (
          <div className="space-y-3">
            {detail.messages.map((msg) => {
              const isSystem = msg.authorKind === 'system';
              const isUser = msg.authorKind === 'user';
              return (
                <div key={msg.id} className={isSystem ? 'text-center' : ''}>
                  {isSystem ? (
                    <p className="text-caption italic text-muted-foreground/60">{msg.content}</p>
                  ) : (
                    <div className={`well px-3 py-2 ${isUser ? 'border-[var(--armed-edge)]' : ''}`}>
                      <p className="text-eyebrow-sm text-silver-mute mb-0.5">
                        {isUser ? 'Rocky' : msg.authorId.slice(0, 8)}
                      </p>
                      <p className="text-body text-[var(--display-fg)] whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer (active meetings only) */}
      {isActive && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              className="well-input flex-1 resize-none px-3 py-2"
              rows={2}
              placeholder="Interject in the meeting..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={handleInterject}
              disabled={!message.trim() || interject.isPending}
              className="cap-armed p-2"
              aria-label="Send interjection"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1 text-caption text-muted-foreground/50">
            <Clock className="h-2.5 w-2.5" />
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      )}
    </div>
  );
}
