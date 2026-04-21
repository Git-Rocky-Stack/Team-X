import { useEffect, useRef } from 'react';

import type { ChatMessage, Employee } from '@team-x/shared-types';

import { Bot } from 'lucide-react';

import { cn } from '@/lib/utils.js';

/** Naive code-fence detector: lines wrapped in triple backticks. */
function renderContent(content: string) {
  const parts: { type: 'text' | 'code'; value: string }[] = [];
  const lines = content.split('\n');
  let inCode = false;
  let buffer: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        // Close code block
        parts.push({ type: 'code', value: buffer.join('\n') });
        buffer = [];
        inCode = false;
      } else {
        // Flush text buffer, start code block
        if (buffer.length > 0) {
          parts.push({ type: 'text', value: buffer.join('\n') });
          buffer = [];
        }
        inCode = true;
      }
    } else {
      buffer.push(line);
    }
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    parts.push({ type: inCode ? 'code' : 'text', value: buffer.join('\n') });
  }

  return parts.map((part, i) =>
    part.type === 'code' ? (
      <pre
        // biome-ignore lint/suspicious/noArrayIndexKey: stable content list
        key={i}
        className="my-1 overflow-x-auto rounded-md bg-background/80 px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {part.value}
      </pre>
    ) : (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: stable content list
        key={i}
        className="whitespace-pre-wrap"
      >
        {part.value}
      </span>
    ),
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  showSenderName?: boolean;
  senderName?: string;
}

function MessageBubble({ message, showSenderName, senderName }: MessageBubbleProps) {
  const isUser = message.authorKind === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%]">
        {showSenderName && senderName && (
          <div className="mb-0.5 flex items-center gap-1.5 px-1">
            <span className="text-[11px] font-medium text-muted-foreground">{senderName}</span>
            {message.isAgentInitiated && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1 py-px text-[9px] font-medium text-amber-500">
                <Bot className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser ? 'bg-brand/15 text-foreground' : 'bg-surface-100 text-foreground',
          )}
        >
          {renderContent(message.content)}
        </div>
      </div>
    </div>
  );
}

interface StreamingBubbleProps {
  text: string;
  employeeName: string;
}

function StreamingBubble({ text, employeeName }: StreamingBubbleProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl bg-surface-100 px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
        {text.length > 0 ? (
          <>
            {renderContent(text)}
            <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-brand align-text-bottom" />
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            {employeeName} is thinking...
          </span>
        )}
      </div>
    </div>
  );
}

interface MessageListProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  employeeName: string;
  /** When true, display sender name labels on each message. */
  isAgentThread?: boolean;
  /** Employee roster for resolving sender names in agent threads. */
  employees?: Employee[];
}

export function MessageList({
  messages,
  streamingText,
  isStreaming,
  employeeName,
  isAgentThread,
  employees,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const visibleMessages = messages.filter(
    (msg) => msg.authorKind === 'user' || msg.content.trim().length > 0,
  );

  // Auto-scroll to bottom when new messages arrive or streaming text updates.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only deps
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, streamingText]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
      <div className="flex flex-col gap-3">
        {visibleMessages.length === 0 && !isStreaming && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {isAgentThread
              ? 'No messages in this conversation yet.'
              : `Start a conversation with ${employeeName}.`}
          </p>
        )}

        {visibleMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            showSenderName={isAgentThread}
            senderName={
              isAgentThread
                ? (employees?.find((e) => e.id === msg.authorId)?.name ?? msg.authorId.slice(0, 8))
                : undefined
            }
          />
        ))}

        {isStreaming && <StreamingBubble text={streamingText} employeeName={employeeName} />}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
