/**
 * Renderer tests in this workspace run under Vitest's Node environment.
 * Keep this as a source-string contract; Playwright owns DOM interaction.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const telemetryViewSrc = readFileSync(join(currentDirname, 'telemetry-view.tsx'), 'utf8');
const companyTelemetrySrc = readFileSync(join(currentDirname, 'company-telemetry.tsx'), 'utf8');
const employeeTelemetrySrc = readFileSync(join(currentDirname, 'employee-telemetry.tsx'), 'utf8');
const costBreakdownSrc = readFileSync(join(currentDirname, 'cost-breakdown.tsx'), 'utf8');

describe('TelemetryView kind filter chips', () => {
  it('defines the four renderer telemetry kind filters and labels', () => {
    expect(telemetryViewSrc).toContain('Record<TelemetryKindFilter, string>');
    expect(telemetryViewSrc).toMatch(/all:\s*'All'/);
    expect(telemetryViewSrc).toMatch(/work:\s*'Work'/);
    expect(telemetryViewSrc).toMatch(/agentic:\s*'Agentic'/);
    expect(telemetryViewSrc).toMatch(/copilot:\s*'Copilot'/);
  });

  it('exports a chip component with All as the active default and click wiring', () => {
    expect(telemetryViewSrc).toContain('export function TelemetryKindFilterChips');
    expect(telemetryViewSrc).toMatch(/active\s*=\s*'all'/);
    expect(telemetryViewSrc).toContain('data-telemetry-kind-filter={filter}');
    expect(telemetryViewSrc).toContain('aria-pressed={filter === active}');
    expect(telemetryViewSrc).toContain('onClick={() => onChange(filter)}');
  });

  it('keeps filter state in TelemetryView and passes it to all subviews', () => {
    expect(telemetryViewSrc).toContain("useState<TelemetryKindFilter>('all')");
    expect(telemetryViewSrc).toContain(
      '<TelemetryKindFilterChips active={kindFilter} onChange={setKindFilter} />',
    );
    expect(telemetryViewSrc).toContain(
      '<CompanyTelemetry companyId={companyId} kindFilter={kindFilter} />',
    );
    expect(telemetryViewSrc).toContain(
      '<EmployeeTelemetry companyId={companyId} kindFilter={kindFilter} />',
    );
    expect(telemetryViewSrc).toContain(
      '<CostBreakdown companyId={companyId} kindFilter={kindFilter} />',
    );
  });
});

describe('Telemetry mission-language carry-forward', () => {
  it('wraps TelemetryView in the mission shell and control rows', () => {
    expect(telemetryViewSrc).toContain('<MissionPageShell data-telemetry-view="">');
    expect(telemetryViewSrc).toContain('<MissionHero');
    expect(telemetryViewSrc).toContain('data-telemetry-controls=""');
    expect(telemetryViewSrc).toContain('data-telemetry-subtabs=""');
    expect(telemetryViewSrc).toContain('data-telemetry-kind-filter-row=""');
  });

  it('pins the top-level no-company state and segmented control selectors', () => {
    expect(telemetryViewSrc).toContain('data-telemetry-view-state="no-company"');
    expect(telemetryViewSrc).toContain('data-telemetry-subtab={tab.view}');
    expect(telemetryViewSrc).toContain('data-telemetry-kind-filter={filter}');
  });

  it('adds localized loading, error, and empty states to each telemetry surface', () => {
    for (const selector of [
      'data-telemetry-company-state="loading"',
      'data-telemetry-company-state="error"',
      'data-telemetry-company-state="empty"',
      'data-telemetry-employees-state="loading"',
      'data-telemetry-employees-state="error"',
      'data-telemetry-employees-state="empty"',
      'data-telemetry-cost-state="loading"',
      'data-telemetry-cost-state="error"',
      'data-telemetry-cost-state="empty"',
    ]) {
      const haystack = `${companyTelemetrySrc}\n${employeeTelemetrySrc}\n${costBreakdownSrc}`;
      expect(haystack).toContain(selector);
    }
  });

  it('wraps charts and tables in mission section cards rather than flat surfaces', () => {
    expect(companyTelemetrySrc).toContain('<MissionSectionCard');
    expect(employeeTelemetrySrc).toContain('<MissionSectionCard');
    expect(costBreakdownSrc).toContain('<MissionSectionCard');
    expect(costBreakdownSrc).toContain('<MissionControlRow');
  });
});
