import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../../store/app-store.js';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const CHAT_DRAWER_PATH = join(currentDirname, 'chat-drawer.tsx');
const COMPOSER_PATH = join(currentDirname, 'composer.tsx');
const THREAD_LIST_PATH = join(currentDirname, 'thread-list.tsx');
const USE_CHAT_PATH = join(currentDirname, '..', '..', 'hooks', 'use-chat.ts');

const chatDrawerSrc = readFileSync(CHAT_DRAWER_PATH, 'utf8');
const composerSrc = readFileSync(COMPOSER_PATH, 'utf8');
const threadListSrc = readFileSync(THREAD_LIST_PATH, 'utf8');
const useChatSrc = readFileSync(USE_CHAT_PATH, 'utf8');
const initialStoreState = useAppStore.getState();

afterEach(() => {
  useAppStore.setState(initialStoreState, true);
});

describe('Interruptible direct chat store', () => {
  it('keeps queued follow-up messages in FIFO order per direct-chat employee', () => {
    const store = useAppStore.getState() as {
      pendingDirectChats?: Record<string, { queuedMessages: string[] }>;
      enqueueQueuedDirectChatMessage?: (employeeId: string, content: string) => void;
      dequeueQueuedDirectChatMessage?: (employeeId: string) => string | null;
    };

    expect(typeof store.enqueueQueuedDirectChatMessage).toBe('function');
    expect(typeof store.dequeueQueuedDirectChatMessage).toBe('function');

    store.enqueueQueuedDirectChatMessage?.('emp-1', 'first follow-up');
    store.enqueueQueuedDirectChatMessage?.('emp-1', 'second follow-up');

    expect(useAppStore.getState().pendingDirectChats?.['emp-1']?.queuedMessages).toEqual([
      'first follow-up',
      'second follow-up',
    ]);
    expect(store.dequeueQueuedDirectChatMessage?.('emp-1')).toBe('first follow-up');
    expect(store.dequeueQueuedDirectChatMessage?.('emp-1')).toBe('second follow-up');
    expect(store.dequeueQueuedDirectChatMessage?.('emp-1')).toBeNull();
  });

  it('tracks stop and awaiting-reply flags separately from the queued messages', () => {
    const store = useAppStore.getState() as {
      pendingDirectChats?: Record<
        string,
        { queuedMessages: string[]; isStopping: boolean; awaitingReply: boolean }
      >;
      setDirectChatStopping?: (employeeId: string, isStopping: boolean) => void;
      setDirectChatAwaitingReply?: (employeeId: string, awaitingReply: boolean) => void;
    };

    expect(typeof store.setDirectChatStopping).toBe('function');
    expect(typeof store.setDirectChatAwaitingReply).toBe('function');

    store.setDirectChatStopping?.('emp-1', true);
    store.setDirectChatAwaitingReply?.('emp-1', true);

    expect(useAppStore.getState().pendingDirectChats?.['emp-1']).toMatchObject({
      queuedMessages: [],
      isStopping: true,
      awaitingReply: true,
    });
  });
});

describe('Interruptible direct chat renderer wiring', () => {
  it('keeps the composer editable while a reply is in flight and surfaces queue + stop controls', () => {
    expect(composerSrc).toContain('onQueue');
    expect(composerSrc).toContain('onStop');
    expect(composerSrc).toContain('queuedCount');
    expect(composerSrc).not.toContain('disabled={disabled}');
    expect(composerSrc).not.toContain('placeholder={disabled ?');
  });

  it('wires the DM drawer through queued follow-ups instead of disabling the composer', () => {
    expect(chatDrawerSrc).toContain('useStopChat');
    expect(chatDrawerSrc).toContain('handleQueue');
    expect(chatDrawerSrc).toContain('queuedCount={queuedCount}');
    expect(chatDrawerSrc).toContain('onStop={handleStop}');
    expect(chatDrawerSrc).not.toContain('disabled={isThinking || sendMutation.isPending}');
  });

  it('keeps the direct-message drawer pinned to the resolved user DM thread', () => {
    expect(chatDrawerSrc).toContain('const effectiveThreadId = activeThreadId;');
    expect(chatDrawerSrc).not.toContain('activeThreadId ?? live?.lastThreadId');
  });

  it('adds an optional chat.stop hook that degrades cleanly until preload/main expose it', () => {
    expect(useChatSrc).toContain('export function useStopChat()');
    expect(useChatSrc).toContain("typeof chatApi.stop !== 'function'");
    expect(useChatSrc).toContain('return { stopped: false }');
  });

  it('opens ticket threads in a left-side preview while preserving the thread index', () => {
    expect(chatDrawerSrc).toContain('function TicketThreadPreviewPanel');
    expect(chatDrawerSrc).toContain('data-thread-ticket-preview=""');
    expect(chatDrawerSrc).toContain('const { data: tickets = [] } = useTickets(companyId);');
    expect(chatDrawerSrc).toContain('const threadTicketPreviewId = threadTicketPreviewThreadId');
    expect(chatDrawerSrc).toContain("if (thread.kind === 'ticket')");
    expect(chatDrawerSrc).toContain('setActiveThreadId(threadId);');
    expect(chatDrawerSrc).toContain('setThreadTicketPreviewThreadId(thread.id);');
    expect(chatDrawerSrc).toContain('<TicketThreadPreviewPanel');
    expect(chatDrawerSrc).toContain('onClose={() => setThreadTicketPreviewThreadId(null)}');
  });

  it('labels ticket threads distinctly in the thread index', () => {
    expect(threadListSrc).toContain("type ThreadKind = 'copilot' | 'agent' | 'ticket' | 'regular'");
    expect(threadListSrc).toContain("if (thread.kind === 'ticket') return 'ticket';");
    expect(threadListSrc).toContain('TicketCheck');
    expect(threadListSrc).toContain('Ticket thread');
  });
});
