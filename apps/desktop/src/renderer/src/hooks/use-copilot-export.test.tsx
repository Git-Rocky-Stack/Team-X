import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const hooksSrc = readFileSync(join(currentDirname, 'use-copilot.ts'), 'utf8');

function getExportHookBody(): string {
  const match = hooksSrc.match(/export function useCopilotExport\(\) \{([\s\S]*?)\n\}/);
  return match?.[1] ?? '';
}

describe('useCopilotExport', () => {
  it('exports a typed React Query mutation hook for copilot.export', () => {
    expect(hooksSrc).toContain('export function useCopilotExport()');
    expect(hooksSrc).toContain('CopilotExportRequest');
    expect(hooksSrc).toContain('CopilotExportResponse');
    expect(hooksSrc).toMatch(/useMutation<CopilotExportResponse,\s*Error,\s*CopilotExportRequest>/);
    expect(hooksSrc).toMatch(/mutationFn:\s*\(req\)\s*=>\s*ipc\.copilot\.export\(req\)/);
  });

  it('does not invalidate insight queries because export is read-only', () => {
    const exportHookBody = getExportHookBody();

    expect(exportHookBody).not.toContain('invalidateQueries');
    expect(exportHookBody).not.toContain('useQueryClient');
    expect(exportHookBody).not.toContain('onSuccess');
  });
});
