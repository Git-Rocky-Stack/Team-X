import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const MESSAGE_LIST_PATH = join(currentDirname, 'message-list.tsx');
const messageListSrc = readFileSync(MESSAGE_LIST_PATH, 'utf8');

describe('MessageList blank-message fallback', () => {
  it('renders a visible note for persisted blank assistant output', () => {
    expect(messageListSrc).toContain('No assistant output was returned for this turn.');
  });

  it('limits the blank-output note to non-user messages', () => {
    expect(messageListSrc).toContain("message.authorKind !== 'user'");
    expect(messageListSrc).toMatch(/message\.content\.trim\(\)\.length === 0/);
  });
});
