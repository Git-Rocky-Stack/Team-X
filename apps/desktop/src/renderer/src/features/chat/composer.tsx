import { useRef, useState } from 'react';

import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import { Textarea } from '@/components/ui/textarea.js';

interface ComposerProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const trimmed = text.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
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
    <div className="flex items-end gap-2 border-t border-border px-4 py-3">
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Waiting for reply...' : 'Message... (Ctrl+Enter to send)'}
        disabled={disabled}
        className="min-h-[2.5rem] max-h-32 resize-none bg-surface-50 text-sm scrollbar-thin"
        rows={1}
      />
      <Button
        size="sm"
        onClick={send}
        disabled={disabled || text.trim().length === 0}
        className="h-9 w-9 shrink-0 bg-brand p-0 text-white hover:bg-brand/90"
      >
        <Send className="h-4 w-4" />
        <span className="sr-only">Send message</span>
      </Button>
    </div>
  );
}
