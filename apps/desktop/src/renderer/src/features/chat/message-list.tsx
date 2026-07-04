import type { ChatMessage, Employee } from '@team-x/shared-types';
import { Bot } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { SubviewState, Tag } from '@/components/console/index.js';
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
        className="my-1 overflow-x-auto whitespace-pre-wrap rounded-inset bg-[var(--void)] px-3 py-2 text-code-sm leading-relaxed text-[var(--display-fg)]"
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
      <div className={cn('min-w-0', isUser ? 'max-w-[88%]' : 'max-w-[96%]')}>
        {showSenderName && senderName && (
          <div className="mb-1 flex items-center gap-1.5 px-1">
            <span className="text-eyebrow-sm text-silver-mute">{senderName}</span>
            {message.isAgentInitiated && (
              <Tag className="gap-0.5">
                <Bot className="h-2.5 w-2.5" />
                AI
              </Tag>
            )}
          </div>
        )}
        <div
          className={cn(
            'well px-4 py-3 text-body leading-7 text-[var(--display-fg)] break-words',
            isUser && 'border-[var(--armed-edge)]',
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
      <div className="well max-w-[96%] px-4 py-3 text-body leading-7 text-[var(--display-fg)] break-words">
        {text.length > 0 ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-eyebrow-sm text-silver-mute">
              <span className="h-2 w-2 rounded-sm bg-[var(--armed-lit)]" />
              Live stream
            </div>
            <div className="whitespace-pre-wrap rounded-inset bg-[var(--void)] px-3 py-2 text-code-sm leading-relaxed text-[var(--display-fg)]">
              {renderContent(text)}
              <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-[var(--armed-lit)] align-text-bottom" />
            </div>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-caption text-silver-mute">
            <span className="inline-block h-1.5 w-1.5 animate-pulse-slow rounded-sm bg-[var(--armed-lit)]" />
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
    <div className="flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
      <div className="flex flex-col gap-4">
        {visibleMessages.length === 0 && !isStreaming && (
          <SubviewState
            lampLabel="STBY"
            lampTone="off"
            title={
              isAgentThread
                ? 'No messages in this conversation yet.'
                : `Start a conversation with ${employeeName}.`
            }
            description="New messages will appear here in the live transcript as soon as the thread updates."
          />
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
