import { describe, expect, it } from 'vitest';

import {
  COPILOT_EXPORT_FORMATS,
  COPILOT_EXPORT_SCOPES,
  type CopilotExportRequest,
  type CopilotExportResponse,
} from './index.js';

describe('copilot export contracts', () => {
  it('pins export formats and scopes', () => {
    expect(COPILOT_EXPORT_FORMATS).toEqual(['csv', 'json']);
    expect(COPILOT_EXPORT_SCOPES).toEqual(['company', 'all']);
  });

  it('allows export requests to carry scope plus visible sidebar filters', () => {
    const req: CopilotExportRequest = {
      format: 'json',
      scope: 'company',
      companyId: 'company-1',
      category: 'cost',
      severity: 'warning',
    };
    const res: CopilotExportResponse = {
      filePath: 'C:/tmp/team-x-exports/copilot-insights-export.json',
      rowCount: 1,
      truncated: false,
      format: req.format,
      scope: req.scope,
    };

    expect(req.scope).toBe('company');
    expect(res.rowCount).toBe(1);
  });
});
