import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const hooksSrc = readFileSync(join(currentDirname, 'use-telemetry.ts'), 'utf8');

describe('use-telemetry kind filter contracts', () => {
  it('exposes a renderer-only kind filter helper that omits all-kind requests', () => {
    expect(hooksSrc).toContain(
      'export function telemetryRequestKind(filter: TelemetryKindFilter): TelemetryRunKind | undefined',
    );
    expect(hooksSrc).toMatch(/filter === 'all'\s*\?\s*undefined\s*:\s*filter/);
  });

  it('accepts request objects for all telemetry aggregate hooks', () => {
    expect(hooksSrc).toContain('useCompanyStats(req: TelemetryCompanyStatsRequest | null)');
    expect(hooksSrc).toContain('useDailyUsage(req: TelemetryDailyUsageRequest | null)');
    expect(hooksSrc).toContain('useEmployeeStats(req: TelemetryEmployeeStatsRequest | null)');
    expect(hooksSrc).toContain('useCostBreakdown(req: TelemetryCostBreakdownRequest | null)');
  });

  it('includes telemetry kind in every aggregate query key', () => {
    expect(hooksSrc.match(/req\?\.kind \?\? 'all'/g) ?? []).toHaveLength(4);
    expect(hooksSrc).toMatch(
      /queryKey:\s*\['telemetry',\s*'companyStats',\s*req\?\.companyId,\s*req\?\.kind \?\? 'all'\]/,
    );
    expect(hooksSrc).toMatch(
      /queryKey:\s*\[\s*'telemetry',\s*'dailyUsage',\s*req\?\.companyId,\s*req\?\.fromMs,\s*req\?\.toMs,\s*req\?\.kind \?\? 'all',?\s*\]/,
    );
    expect(hooksSrc).toMatch(
      /queryKey:\s*\['telemetry',\s*'employeeStats',\s*req\?\.companyId,\s*req\?\.kind \?\? 'all'\]/,
    );
    expect(hooksSrc).toMatch(
      /queryKey:\s*\[\s*'telemetry',\s*'costBreakdown',\s*req\?\.companyId,\s*req\?\.fromMs,\s*req\?\.toMs,\s*req\?\.kind \?\? 'all',?\s*\]/,
    );
  });
});
