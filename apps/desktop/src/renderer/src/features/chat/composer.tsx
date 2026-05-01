import { Send, Square } from 'lucide-react';
import { useRef, useState } from 'react';


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
    <div className="border-t border-white/10 bg-black/20 px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="min-h-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {queuedCount > 0
            ? `${queuedCount} queued follow-up${queuedCount === 1 ? '' : 's'}`
            : isBusy
              ? 'Reply in progress'
              : ''}
        </span>
        {isBusy && (
          <Button
            size="sm"
            variant="outline"
            onClick={onStop}
            disabled={stopPending}
            className="border-white/10 bg-black/10 text-foreground hover:bg-black/20"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            {stopPending ? 'Stopping...' : 'Stop'}
          </Button>
        )}
      </div>
      <div className="mission-chrome-panel rounded-[22px] border border-white/10 p-3">
        <div className="flex items-end gap-3">
          <Textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              queueMode ? 'Message... (Ctrl+Enter to queue)' : 'Message... (Ctrl+Enter to send)'
            }
            className="min-h-16 max-h-48 resize-none border-white/10 bg-black/20 text-sm scrollbar-thin"
            rows={1}
          />
          <Button
            size="sm"
            onClick={send}
            disabled={text.trim().length === 0}
            className="h-11 w-11 shrink-0 rounded-[16px] bg-brand p-0 text-white hover:bg-brand/90"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">{queueMode ? 'Queue message' : 'Send message'}</span>
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {queueMode
              ? 'Queue mode active while the current reply completes.'
              : 'Send with Ctrl/Cmd+Enter.'}
          </p>
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-mono text-muted-foreground">
            {queueMode ? 'Queue' : 'Live'}
          </span>
        </div>
      </div>
    </div>
  );
}
