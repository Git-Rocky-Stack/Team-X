import type { Employee } from '@team-x/shared-types';
import { ArrowLeft, Clock, MessageSquare, Send, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useAddTicketComment, useCloseTicket, useTicketDetail } from '@/hooks/use-tickets.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-400',
  'in-progress': 'bg-yellow-500/10 text-yellow-400',
  blocked: 'bg-red-500/10 text-red-400',
  done: 'bg-green-500/10 text-green-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400',
  high: 'bg-orange-500/10 text-orange-400',
  medium: 'bg-yellow-500/10 text-yellow-400',
  low: 'bg-muted text-muted-foreground',
};

interface TicketDetailPanelProps {
  ticketId: string;
  employees: Employee[];
}

export function TicketDetailPanel({ ticketId, employees }: TicketDetailPanelProps) {
  const setActiveTicketId = useAppStore((s) => s.setActiveTicketId);
  const { data: detail, isLoading } = useTicketDetail(ticketId);
  const addComment = useAddTicketComment();
  const closeTicket = useCloseTicket();
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (isLoading || !detail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading ticket...
      </div>
    );
  }

  function handleSendComment() {
    if (!comment.trim()) return;
    addComment.mutate({ ticketId, content: comment.trim() });
    setComment('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendComment();
    }
  }

  const assignee = detail.assignee;

  return (
    <div className="flex h-full flex-col border-l border-border bg-surface-50">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setActiveTicketId(null)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
          aria-label="Close detail"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-snug text-foreground truncate">
            {detail.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setActiveTicketId(null)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2.5">
        <Badge
          variant="outline"
          className={`text-[10px] border-0 ${STATUS_COLORS[detail.status] ?? ''}`}
        >
          {detail.status}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[10px] border-0 ${PRIORITY_COLORS[detail.priority] ?? ''}`}
        >
          {detail.priority}
        </Badge>
        {assignee && (
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="h-5 w-5 rounded-full bg-brand/20 flex items-center justify-center text-[10px] font-medium text-brand">
              {assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] text-muted-foreground">{assignee.name}</span>
          </div>
        )}
        {!assignee && (
          <span className="text-[11px] text-muted-foreground/60 italic ml-auto">Unassigned</span>
        )}
      </div>

      {/* Description */}
      {detail.description && (
        <div className="border-b border-border/50 px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {detail.description}
          </p>
        </div>
      )}

      {/* Messages thread */}
      <ScrollArea className="flex-1 px-4 py-3">
        {detail.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground/50">No discussion yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {detail.messages.map((msg) => {
              const isUser = msg.authorKind === 'user';
              const isSystem = msg.authorKind === 'system';
              return (
                <div
                  key={msg.id}
                  className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    isSystem
                      ? 'bg-muted/30 text-muted-foreground italic text-center'
                      : isUser
                        ? 'bg-brand/5 text-foreground border border-brand/10'
                        : 'bg-surface-100 text-foreground border border-border/30'
                  }`}
                >
                  {!isSystem && (
                    <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                      {isUser
                        ? 'You'
                        : (employees.find((e) => e.id === msg.authorId)?.name ?? 'Agent')}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Composer + actions */}
      <div className="border-t border-border px-4 py-3">
        {detail.status !== 'done' ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a comment..."
                className="min-h-[60px] resize-none text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => closeTicket.mutate(ticketId)}
                disabled={closeTicket.isPending}
              >
                <Clock className="mr-1.5 h-3 w-3" />
                Close Ticket
              </Button>
              <Button
                size="sm"
                className="text-xs"
                onClick={handleSendComment}
                disabled={!comment.trim() || addComment.isPending}
              >
                <Send className="mr-1.5 h-3 w-3" />
                Send
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-xs text-muted-foreground/60">
            Ticket closed
            {detail.closedAt && <span> on {new Date(detail.closedAt).toLocaleDateString()}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
