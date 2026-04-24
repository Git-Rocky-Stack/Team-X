import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(currentDirname, 'use-dashboard-agent-runs.ts'), 'utf8');

describe('use-dashboard-agent-runs', () => {
  it('exposes retry and partial-history warning state for mission control', () => {
    expect(hookSrc).toContain('hasHistoryWarning: boolean;');
    expect(hookSrc).toContain('errorMessage: string | null;');
    expect(hookSrc).toContain('retry: () => Promise<unknown>;');
    expect(hookSrc).toContain('hasHistoryWarning: recentRunsQuery.isError && runs.length > 0');
    expect(hookSrc).toContain(
      'errorMessage: recentRunsQuery.isError ? agentRunsErrorMessage(recentRunsQuery.error) : null',
    );
    expect(hookSrc).toContain('retry: () => recentRunsQuery.refetch()');
  });
});
