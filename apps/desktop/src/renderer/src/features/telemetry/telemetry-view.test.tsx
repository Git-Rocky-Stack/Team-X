/**
 * Renderer tests in this workspace run under Vitest's Node environment.
 * Keep this as a source-string contract; Playwright owns DOM interaction.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(currentDirname, 'telemetry-view.tsx'), 'utf8');

describe('TelemetryView kind filter chips', () => {
  it('defines the four renderer telemetry kind filters and labels', () => {
    expect(src).toContain('Record<TelemetryKindFilter, string>');
    expect(src).toMatch(/all:\s*'All'/);
    expect(src).toMatch(/work:\s*'Work'/);
    expect(src).toMatch(/agentic:\s*'Agentic'/);
    expect(src).toMatch(/copilot:\s*'Copilot'/);
  });

  it('exports a chip component with All as the active default and Copilot click wiring', () => {
    expect(src).toContain('export function TelemetryKindFilterChips');
    expect(src).toMatch(/active\s*=\s*'all'/);
    expect(src).toContain('data-telemetry-kind-filter={filter}');
    expect(src).toContain('aria-pressed={filter === active}');
    expect(src).toContain('onClick={() => onChange(filter)}');
  });

  it('keeps filter state in TelemetryView and passes it to all subviews', () => {
    expect(src).toContain("useState<TelemetryKindFilter>('all')");
    expect(src).toContain(
      '<TelemetryKindFilterChips active={kindFilter} onChange={setKindFilter} />',
    );
    expect(src).toContain('<CompanyTelemetry companyId={cid} kindFilter={kindFilter} />');
    expect(src).toContain('<EmployeeTelemetry companyId={cid} kindFilter={kindFilter} />');
    expect(src).toContain('<CostBreakdown companyId={cid} kindFilter={kindFilter} />');
  });
});
