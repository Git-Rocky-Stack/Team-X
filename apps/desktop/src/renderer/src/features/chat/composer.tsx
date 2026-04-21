import { useRef, useState } from 'react';

import { Send, Square } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { Textarea } from '@/components/ui/textarea.js';

interface ComposerProps {
  onSend: (content: string) => void;
  onQueue: (content: string) => void;
  onStop: () => void;
  queuedCount: number;
  isBusy: boolean;
  queueMode?: boolean;
  stopPending?: boolean;
}

export function Composer({
  onSend,
  onQueue,
  onStop,
  queuedCount,
  isBusy,
  queueMode = false,
  stopPending = false,
}: ComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (queueMode) {
      onQueue(trimmed);
    } else {
      onSend(trimmed);
    }
    setText('');
    // Re-focus the textarea after sending so the user can keep typing.
    ref.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-h-4 text-[11px] text-muted-foreground">
          {queuedCount > 0
            ? `${queuedCount} queued follow-up${queuedCount === 1 ? '' : 's'}`
            : isBusy
              ? 'Reply in progress'
              : ''}
        </span>
        {isBusy && (
          <Button size="sm" variant="outline" onClick={onStop} disabled={stopPending}>
            <Square className="h-3.5 w-3.5 fill-current" />
            {stopPending ? 'Stopping...' : 'Stop'}
          </Button>
        )}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            queueMode
              ? 'Message... (Ctrl+Enter to queue)'
              : 'Message... (Ctrl+Enter to send)'
          }
          className="min-h-[2.5rem] max-h-32 resize-none bg-surface-50 text-sm scrollbar-thin"
          rows={1}
        />
        <Button
          size="sm"
          onClick={send}
          disabled={text.trim().length === 0}
          className="h-9 w-9 shrink-0 bg-brand p-0 text-white hover:bg-brand/90"
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">{queueMode ? 'Queue message' : 'Send message'}</span>
        </Button>
      </div>
    </div>
  );
}
