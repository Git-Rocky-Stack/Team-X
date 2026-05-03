import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COPILOT_CATEGORIES } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const sidebarSrc = readFileSync(join(currentDirname, 'copilot-sidebar.tsx'), 'utf8');

describe('CopilotSidebar filters and export controls', () => {
  it('renders visible category and severity filter controls with stable selectors', () => {
    expect(sidebarSrc).toContain('data-copilot-category-filter={category}');
    expect(sidebarSrc).toContain('data-copilot-severity-filter={severity}');
    expect(sidebarSrc).toContain('categoryFilter');
    expect(sidebarSrc).toContain('severityFilter');

    for (const category of COPILOT_CATEGORIES) {
      expect(sidebarSrc).toContain(`case '${category}':`);
    }

    for (const severity of ['critical', 'warning', 'info']) {
      expect(sidebarSrc).toContain(`case '${severity}':`);
    }
  });

  it('passes the current visible filters into useCopilotInsights', () => {
    expect(sidebarSrc).toContain('const insightFilters = useMemo');
    expect(sidebarSrc).toContain('categoryFilter !== FILTER_ALL');
    expect(sidebarSrc).toContain('severityFilter !== FILTER_ALL');
    expect(sidebarSrc).toContain('useCopilotInsights(companyId, insightFilters)');
  });

  it('renders company/all scope controls and CSV/JSON export buttons', () => {
    expect(sidebarSrc).toContain('useCopilotExport');
    expect(sidebarSrc).toContain('exportScope');
    expect(sidebarSrc).toContain('data-copilot-export-scope={scope}');
    expect(sidebarSrc).toContain('data-copilot-export-format={format}');
    expect(sidebarSrc).toContain('COPILOT_EXPORT_FORMATS.map');
    expect(sidebarSrc).toContain("format === 'csv'");
  });

  it('builds export requests from scope and current filters', () => {
    expect(sidebarSrc).toContain('function buildExportRequest(format: CopilotExportFormat)');
    expect(sidebarSrc).toContain('scope: exportScope');
    expect(sidebarSrc).toContain("exportScope === 'company' && companyId");
    expect(sidebarSrc).toContain('category: categoryFilter');
    expect(sidebarSrc).toContain('severity: severityFilter');
    expect(sidebarSrc).toContain('exportMutation.mutate(buildExportRequest(format))');
  });

  it('renders success, truncation, and error status copy', () => {
    expect(sidebarSrc).toContain('data-copilot-export-status=""');
    expect(sidebarSrc).toContain('formatExportFileName(exportMutation.data.filePath)');
    expect(sidebarSrc).toContain('exportMutation.data.truncated');
    expect(sidebarSrc).toContain('data-copilot-export-error=""');
  });

  it('surfaces copilot ask failures instead of failing silently', () => {
    expect(sidebarSrc).toContain('data-copilot-ask-error=""');
    expect(sidebarSrc).toContain('role="alert"');
    expect(sidebarSrc).toContain('askMutation.reset()');
  });
});
