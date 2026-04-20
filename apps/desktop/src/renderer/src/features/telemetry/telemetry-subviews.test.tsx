import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));

function readSubview(name: string): string {
  return readFileSync(join(currentDirname, name), 'utf8');
}

const companySrc = readSubview('company-telemetry.tsx');
const employeeSrc = readSubview('employee-telemetry.tsx');
const costSrc = readSubview('cost-breakdown.tsx');

describe('telemetry subview kind filter requests', () => {
  it('wires CompanyTelemetry kind into company stats and daily usage requests', () => {
    expect(companySrc).toContain('kindFilter: TelemetryKindFilter');
    expect(companySrc).toContain('telemetryRequestKind(kindFilter)');
    expect(companySrc).toMatch(/useCompanyStats\(\{\s*companyId,\s*kind,?\s*\}\)/);
    expect(companySrc).toMatch(
      /useDailyUsage\(\{\s*companyId,\s*fromMs:\s*thirtyDaysAgo,\s*toMs:\s*now,\s*kind,?\s*\}\)/,
    );
  });

  it('wires EmployeeTelemetry kind into employee stats requests', () => {
    expect(employeeSrc).toContain('kindFilter: TelemetryKindFilter');
    expect(employeeSrc).toContain('telemetryRequestKind(kindFilter)');
    expect(employeeSrc).toMatch(/useEmployeeStats\(\{\s*companyId,\s*kind,?\s*\}\)/);
  });

  it('wires CostBreakdown kind while preserving date range request filters', () => {
    expect(costSrc).toContain('kindFilter: TelemetryKindFilter');
    expect(costSrc).toContain('telemetryRequestKind(kindFilter)');
    expect(costSrc).toContain("if (range === 'all') return { companyId, kind };");
    expect(costSrc).toContain(
      'return { companyId, fromMs: now - days * DAY_MS, toMs: now, kind };',
    );
    expect(costSrc).toContain('}, [companyId, kind, range, now]);');
  });
});
