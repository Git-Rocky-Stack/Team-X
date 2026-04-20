import { describe, expect, it } from 'vitest';
import {
  TELEMETRY_KIND_FILTERS,
  TELEMETRY_RUN_KINDS,
  type TelemetryCompanyStatsRequest,
  type TelemetryCostBreakdownRequest,
  type TelemetryDailyUsageRequest,
  type TelemetryEmployeeStatsRequest,
} from './ipc.js';

describe('telemetry kind filter contracts', () => {
  it('pins persisted run kinds separately from the renderer all filter', () => {
    expect(TELEMETRY_RUN_KINDS).toEqual(['work', 'agentic', 'copilot']);
    expect(TELEMETRY_KIND_FILTERS).toEqual(['all', 'work', 'agentic', 'copilot']);
  });

  it('allows aggregate requests to carry an optional persisted run kind', () => {
    const company: TelemetryCompanyStatsRequest = {
      companyId: 'company-1',
      kind: 'work',
    };
    const daily: TelemetryDailyUsageRequest = {
      companyId: 'company-1',
      fromMs: 0,
      toMs: 1,
      kind: 'agentic',
    };
    const cost: TelemetryCostBreakdownRequest = {
      companyId: 'company-1',
      kind: 'copilot',
    };
    const employee: TelemetryEmployeeStatsRequest = {
      companyId: 'company-1',
      kind: 'agentic',
    };

    expect(company.kind).toBe('work');
    expect(daily.kind).toBe('agentic');
    expect(cost.kind).toBe('copilot');
    expect(employee.kind).toBe('agentic');
  });
});
