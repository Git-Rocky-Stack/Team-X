import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const MESSAGE_LIST_PATH = join(currentDirname, 'message-list.tsx');
const messageListSrc = readFileSync(MESSAGE_LIST_PATH, 'utf8');

describe('MessageList blank assistant rows', () => {
  it('filters persisted blank assistant messages instead of rendering a failure note', () => {
    expect(messageListSrc).not.toContain('No assistant output was returned for this turn.');
    expect(messageListSrc).toMatch(/const visibleMessages = messages\.filter/);
  });

  it('keeps user messages and non-empty assistant messages visible', () => {
    expect(messageListSrc).toMatch(/msg\.authorKind === 'user'/);
    expect(messageListSrc).toMatch(/msg\.content\.trim\(\)\.length > 0/);
    expect(messageListSrc).toMatch(/visibleMessages\.map/);
  });
});
