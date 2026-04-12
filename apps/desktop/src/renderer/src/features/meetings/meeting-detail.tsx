import { ArrowLeft, Clock, FileText, Send, Square, Users2 } from 'lucide-react';
import { useState } from 'react';

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
      <div className="flex h-full items-center justify-center border-l border-border bg-card">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
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
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground lg:hidden"
          aria-label="Back to meetings"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {detail.agenda || 'Meeting'}
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users2 className="h-3 w-3" />
              {detail.attendees.length} attendees
            </span>
            {detail.chair && <span>Chair: {detail.chair.name}</span>}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`}
              />
              {isActive ? 'Active' : 'Ended'}
            </span>
          </div>
        </div>
        {isActive && (
          <button
            type="button"
            onClick={handleEnd}
            disabled={endMeeting.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            <Square className="h-3 w-3" />
            {endMeeting.isPending ? 'Ending...' : 'End Meeting'}
          </button>
        )}
      </div>

      {/* Minutes (shown after meeting ends) */}
      {!isActive && detail.minutesMd && (
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            Minutes
          </div>
          <div className="mt-2 max-h-32 overflow-y-auto text-xs text-foreground/80 whitespace-pre-wrap">
            {detail.minutesMd}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {detail.messages.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground/60 py-8">No messages yet.</p>
        ) : (
          <div className="space-y-3">
            {detail.messages.map((msg) => {
              const isSystem = msg.authorKind === 'system';
              const isUser = msg.authorKind === 'user';
              return (
                <div key={msg.id} className={isSystem ? 'text-center' : ''}>
                  {isSystem ? (
                    <p className="text-[11px] italic text-muted-foreground/60">{msg.content}</p>
                  ) : (
                    <div
                      className={`rounded-lg px-3 py-2 ${
                        isUser
                          ? 'bg-brand/10 border border-brand/20'
                          : 'bg-muted/30 border border-border'
                      }`}
                    >
                      <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                        {isUser ? 'Rocky' : msg.authorId.slice(0, 8)}
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
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
              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-brand"
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
              className="rounded-lg bg-brand p-2 text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <Clock className="h-2.5 w-2.5" />
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      )}
    </div>
  );
}
