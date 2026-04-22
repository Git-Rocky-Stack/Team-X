import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(currentDirname, 'use-dashboard-layout-preferences.ts'), 'utf8');

describe('use-dashboard-layout-preferences', () => {
  it('persists dashboard layout through companies.update with optimistic companies cache updates', () => {
    expect(hookSrc).toContain('export function patchCompanyDashboardLayoutCache(');
    expect(hookSrc).toContain('export function useDashboardLayoutPreferences(');
    expect(hookSrc).toContain('ipc.companies.update');
    expect(hookSrc).toContain("queryClient.setQueryData<Company[]>(['companies']");
    expect(hookSrc).toContain("invalidateQueries({ queryKey: ['companies'] })");
    expect(hookSrc).toContain('withDashboardLayoutInCompanySettings(company.settings, nextLayout)');
  });
});
