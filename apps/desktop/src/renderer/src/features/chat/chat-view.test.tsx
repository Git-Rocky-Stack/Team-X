/**
 * Source-string audit for Phase 5.6 M-D step (d): Chat tab enable.
 *
 * The Chat tab is a discovery surface over the existing drawer/thread
 * infrastructure. These tests pin the wiring cheaply under the Node
 * Vitest environment; Playwright owns the full interaction pass.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const CHAT_VIEW_PATH = join(currentDirname, 'chat-view.tsx');
const CHAT_DRAWER_PATH = join(currentDirname, 'chat-drawer.tsx');
const APP_PATH = join(currentDirname, '..', '..', 'App.tsx');
const TOP_BAR_PATH = join(currentDirname, '..', '..', 'app', 'top-bar.tsx');

const chatViewExists = existsSync(CHAT_VIEW_PATH);
const chatViewSrc = chatViewExists ? readFileSync(CHAT_VIEW_PATH, 'utf8') : '';
const chatDrawerSrc = readFileSync(CHAT_DRAWER_PATH, 'utf8');
const appSrc = readFileSync(APP_PATH, 'utf8');
const topBarSrc = readFileSync(TOP_BAR_PATH, 'utf8');

describe('ChatView (features/chat/chat-view.tsx)', () => {
  it('exists as the Chat tab landing view and uses the existing thread query', () => {
    expect(chatViewExists).toBe(true);
    expect(chatViewSrc).toContain('export function ChatView(');
    expect(chatViewSrc).toContain('companyId: string | null');
    expect(chatViewSrc).toContain('employees: Employee[]');
    expect(chatViewSrc).toContain('useThreadList(companyId)');
  });

  it('reuses ThreadList instead of creating a parallel thread renderer', () => {
    expect(chatViewSrc).toContain("from './thread-list.js'");
    expect(chatViewSrc).toContain('<ThreadList');
    expect(chatViewSrc).toContain('threads={threads}');
    expect(chatViewSrc).toContain('employees={employees}');
    expect(chatViewSrc).toContain('onSelectThread={handleSelectThread}');
  });

  it('opens the existing ChatDrawer through app-store thread state on row select', () => {
    expect(chatViewSrc).toContain('useAppStore');
    expect(chatViewSrc).toContain('const openThread = useAppStore((s) => s.openThread)');
    expect(chatViewSrc).toContain('isAgentThread');
    expect(chatViewSrc).toContain('isCopilotThread');
    expect(chatViewSrc).toMatch(/openThread\(\{[\s\S]*threadId/);
    expect(chatViewSrc).toContain('isCopilotThread: true');
  });

  it('adds compact thread-memory inspection to the drawer surfaces', () => {
    expect(chatDrawerSrc).toContain(
      "import { ThreadMemoryCard } from '@/features/memory/thread-memory-card.js';",
    );
    expect(chatDrawerSrc).toContain('<ThreadMemoryCard');
    expect(chatDrawerSrc).toContain('title="Copilot memory"');
    expect(chatDrawerSrc).toContain('title="Autonomous memory"');
    expect(chatDrawerSrc).toContain('title="Conversation memory"');
    expect(chatDrawerSrc).toContain('compact');
  });

  it('keeps the communication drawer wide enough for operational reading', () => {
    expect(chatDrawerSrc).toContain('sm:w-[720px]');
    expect(chatDrawerSrc).toContain('xl:w-[820px]');
    expect(chatDrawerSrc).toContain('2xl:w-[900px]');
  });

  it('covers loading, error, and no-company states with stable selectors', () => {
    expect(chatViewSrc).toContain('data-chat-view=""');
    expect(chatViewSrc).toContain('data-chat-view-state="no-company"');
    expect(chatViewSrc).toContain('data-chat-view-state="loading"');
    expect(chatViewSrc).toContain('data-chat-view-state="error"');
    expect(chatViewSrc).toContain('data-chat-view-retry=""');
  });
});

describe('Chat tab step-(d) integration', () => {
  it('keeps the top-bar Chat tab enabled after Org ships in step (e)', () => {
    expect(topBarSrc).toContain("{ label: 'Org', icon: GitBranch, view: 'org' }");
    expect(topBarSrc).toContain("{ label: 'Chat', icon: MessageSquare, view: 'chat' }");
    expect(topBarSrc).not.toContain(
      "{ label: 'Org', icon: GitBranch, view: 'org', disabled: true }",
    );
    expect(topBarSrc).not.toContain(
      "{ label: 'Chat', icon: MessageSquare, view: 'chat', disabled: true }",
    );
  });

  it('routes the chat view to ChatView instead of the ComingSoon placeholder', () => {
    expect(appSrc).toContain("import { ChatView } from './features/chat/chat-view.js'");
    expect(appSrc).toMatch(
      /case 'chat':\s*return <ChatView companyId=\{companyId\} employees=\{employees\} \/>/,
    );
    expect(appSrc).not.toMatch(/case 'chat':\s*return <ComingSoon label="Chat" \/>/);
    expect(appSrc).toContain('<ChatDrawer employees={employees} />');
  });
});
