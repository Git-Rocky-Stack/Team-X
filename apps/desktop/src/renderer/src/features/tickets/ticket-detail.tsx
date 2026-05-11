import type { Employee } from '@team-x/shared-types';
import {
  ArrowLeft,
  Clock,
  FileText,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Textarea } from '@/components/ui/textarea.js';
import { ThreadMemoryCard } from '@/features/memory/thread-memory-card.js';
import {
  useAttachFile,
  useDetachFile,
  useTicketAttachments,
} from '@/hooks/use-ticket-attachments.js';
import {
  useAddTicketComment,
  useAddTicketParticipant,
  useCloseTicket,
  useRemoveTicketParticipant,
  useTicketDetail,
} from '@/hooks/use-tickets.js';
import { useVaultFiles } from '@/hooks/use-vault.js';
import { useAppStore } from '@/store/app-store.js';

const STATUS_COLORS: Record<string, string> = {
  open: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
  'in-progress': 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  blocked: 'border-red-500/20 bg-red-500/10 text-red-200',
  done: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-red-500/20 bg-red-500/10 text-red-300',
  high: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
  medium: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200',
  low: 'border-white/10 bg-black/20 text-muted-foreground',
};

interface TicketDetailPanelProps {
  ticketId: string;
  employees: Employee[];
  onClose?: () => void;
}

export function TicketDetailPanel({ ticketId, employees, onClose }: TicketDetailPanelProps) {
  const setActiveTicketId = useAppStore((s) => s.setActiveTicketId);
  const closeDetail = onClose ?? (() => setActiveTicketId(null));
  const { data: detail, isLoading } = useTicketDetail(ticketId);
  const addComment = useAddTicketComment();
  const closeTicket = useCloseTicket();
  const addParticipant = useAddTicketParticipant();
  const removeParticipant = useRemoveTicketParticipant();
  const { data: attachments = [] } = useTicketAttachments(ticketId);
  const { data: vaultFiles = [] } = useVaultFiles(detail?.companyId ?? null);
  const attachFile = useAttachFile();
  const detachFile = useDetachFile();
  const [comment, setComment] = useState('');
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (isLoading || !detail) {
    return (
      <div
        className="flex h-full items-center justify-center px-6 text-center text-body text-muted-foreground"
        data-ticket-detail-state="loading"
      >
        Loading ticket detail...
      </div>
    );
  }

  function handleSendComment() {
    if (!comment.trim()) return;
    addComment.mutate({ ticketId, content: comment.trim() });
    setComment('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendComment();
    }
  }

  const assignee = detail.assignee;
  const participants = detail.participants;
  const participantIds = new Set(participants.map((participant) => participant.id));
  const addableEmployees = employees.filter(
    (employee) => employee.companyId === detail.companyId && !participantIds.has(employee.id),
  );

  function handleAddParticipant() {
    if (!selectedParticipantId) return;
    addParticipant.mutate(
      { ticketId, employeeId: selectedParticipantId },
      { onSuccess: () => setSelectedParticipantId('') },
    );
  }

  return (
    <div className="flex h-full flex-col bg-transparent" data-ticket-detail="">
      <div className="flex items-start gap-3 border-b border-white/10 px-5 py-4">
        <button
          type="button"
          onClick={closeDetail}
          className="rounded-[14px] border border-white/10 bg-black/20 p-2 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground xl:hidden"
          aria-label="Close detail"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-eyebrow-sm text-muted-foreground">Detail rail</span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-eyebrow-sm font-mono text-muted-foreground">
              {detail.id.slice(0, 8)}
            </span>
          </div>
          <h2 className="mt-2 truncate text-h3 text-foreground">{detail.title}</h2>
        </div>

        <button
          type="button"
          onClick={closeDetail}
          className="rounded-[14px] border border-white/10 bg-black/20 p-2 text-muted-foreground transition-colors hover:bg-surface-100 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
        <Badge
          variant="outline"
          className={`border text-[10px] ${STATUS_COLORS[detail.status] ?? ''}`}
        >
          {detail.status}
        </Badge>
        <Badge
          variant="outline"
          className={`border text-[10px] ${PRIORITY_COLORS[detail.priority] ?? ''}`}
        >
          {detail.priority}
        </Badge>
        {assignee ? (
          <div className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-[10px] border border-white/10 bg-brand/10 text-[10px] font-semibold text-brand">
              {assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-caption text-muted-foreground">{assignee.name}</span>
          </div>
        ) : (
          <span className="ml-auto text-caption italic text-muted-foreground/70">Unassigned</span>
        )}
      </div>

      {detail.description ? (
        <div className="border-b border-white/10 px-5 py-4">
          <p className="whitespace-pre-wrap text-body text-muted-foreground">
            {detail.description}
          </p>
        </div>
      ) : null}

      {detail.threadId ? (
        <div className="border-b border-white/10 px-5 py-4">
          <ThreadMemoryCard
            companyId={detail.companyId}
            threadId={detail.threadId}
            title="Ticket memory"
            description="Inspect the latest digest and resumable checkpoint trail behind this ticket thread."
            compact
          />
        </div>
      ) : null}

      <div className="border-b border-white/10 px-5 py-4" data-ticket-participants="">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-eyebrow-sm text-muted-foreground">
              Participants ({participants.length})
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={selectedParticipantId}
            onChange={(event) => setSelectedParticipantId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-[12px] border border-white/10 bg-black/15 px-2.5 text-menu-item text-foreground outline-none transition-colors focus:border-brand/60"
            aria-label="Add ticket participant"
            disabled={addableEmployees.length === 0 || addParticipant.isPending}
          >
            <option value="">
              {addableEmployees.length === 0 ? 'All employees are on this ticket' : 'Add employee'}
            </option>
            {addableEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} - {employee.title}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 border-white/10 bg-black/10 px-2.5 text-foreground hover:bg-black/20"
            onClick={handleAddParticipant}
            disabled={!selectedParticipantId || addParticipant.isPending}
            aria-label="Add selected employee to ticket"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {participants.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {participants.map((participant) => {
              const isAssignee = participant.id === detail.assigneeId;
              return (
                <div
                  key={participant.id}
                  className="flex max-w-full items-center gap-2 rounded-[14px] border border-white/10 bg-black/15 px-2.5 py-1.5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-brand/10 text-[10px] font-semibold text-brand">
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-caption text-foreground">{participant.name}</div>
                    <div className="truncate text-caption text-muted-foreground">
                      {isAssignee ? 'Owner' : participant.title}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      removeParticipant.mutate({ ticketId, employeeId: participant.id })
                    }
                    className="ml-auto rounded p-1 text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-300/50"
                    aria-label={`Remove ${participant.name} from ticket`}
                    disabled={removeParticipant.isPending}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-caption italic text-muted-foreground/70">
            No employee participants yet.
          </p>
        )}
      </div>

      <div className="border-b border-white/10 px-5 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-eyebrow-sm text-muted-foreground">
            Attachments ({attachments.length})
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-white/10 bg-black/10 px-2.5 text-button-sm text-foreground hover:bg-black/20"
            onClick={() => setShowAttachPicker(!showAttachPicker)}
          >
            <Paperclip className="mr-1 h-3 w-3" />
            Attach
          </Button>
        </div>

        {showAttachPicker && vaultFiles.length > 0 ? (
          <div className="mb-3 max-h-24 overflow-y-auto rounded-[16px] border border-white/10 bg-black/15 p-1.5">
            {vaultFiles
              .filter(
                (vaultFile) =>
                  !attachments.some((attachment) => attachment.fileId === vaultFile.id),
              )
              .map((vaultFile) => (
                <button
                  type="button"
                  key={vaultFile.id}
                  className="flex w-full items-center gap-2 rounded-[12px] px-2 py-1.5 text-caption transition-colors hover:bg-surface-100"
                  onClick={() => {
                    attachFile.mutate({ ticketId, fileId: vaultFile.id });
                    setShowAttachPicker(false);
                  }}
                >
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{vaultFile.originalName}</span>
                </button>
              ))}
            {vaultFiles.filter(
              (vaultFile) => !attachments.some((attachment) => attachment.fileId === vaultFile.id),
            ).length === 0 ? (
              <p className="px-2 py-1 text-caption italic text-muted-foreground/70">
                All vault files are already attached.
              </p>
            ) : null}
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1.5 rounded-[14px] border border-white/10 bg-black/15 px-2.5 py-1.5"
              >
                <FileText className="h-3 w-3 text-muted-foreground/70" />
                <span className="max-w-[140px] truncate text-caption">
                  {attachment.fileName ?? 'File'}
                </span>
                <button
                  type="button"
                  onClick={() => detachFile.mutate({ ticketId, fileId: attachment.fileId })}
                  className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-red-300"
                  aria-label="Remove attachment"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ScrollArea className="flex-1 px-5 py-4">
        {detail.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-black/10 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-body text-muted-foreground">No discussion yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {detail.messages.map((message) => {
              const isUser = message.authorKind === 'user';
              const isSystem = message.authorKind === 'system';
              const authorName =
                employees.find((employee) => employee.id === message.authorId)?.name ?? 'Agent';

              return (
                <div
                  key={message.id}
                  className={`rounded-[18px] border px-3.5 py-3 text-caption ${
                    isSystem
                      ? 'border-white/10 bg-black/10 text-center italic text-muted-foreground'
                      : isUser
                        ? 'border-brand/15 bg-brand/10 text-foreground'
                        : 'border-white/10 bg-black/15 text-foreground'
                  }`}
                >
                  {isSystem ? null : (
                    <div className="mb-1 text-eyebrow-sm text-muted-foreground">
                      {isUser ? 'You' : authorName}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-white/10 px-5 py-4">
        {detail.status !== 'done' ? (
          <div className="flex flex-col gap-3">
            <Textarea
              ref={textareaRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              className="min-h-[72px] resize-none border-white/10 bg-black/15 text-body"
            />
            <div className="flex items-center justify-between gap-3">
              <Button
                size="sm"
                variant="outline"
                className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
                onClick={() => closeTicket.mutate(ticketId)}
                disabled={closeTicket.isPending}
              >
                <Clock className="mr-1.5 h-3 w-3" />
                Close Ticket
              </Button>
              <Button
                size="sm"
                className="bg-brand text-white hover:bg-brand/90"
                onClick={handleSendComment}
                disabled={!comment.trim() || addComment.isPending}
              >
                <Send className="mr-1.5 h-3 w-3" />
                Send
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-caption text-muted-foreground/70">
            Ticket closed
            {detail.closedAt ? (
              <span> on {new Date(detail.closedAt).toLocaleDateString()}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
