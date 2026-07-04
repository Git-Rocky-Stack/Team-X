import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');

// Raw Tailwind palette colors the recompose must replace with console tones.
const RAW_PALETTE =
  /-(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|fuchsia|zinc|slate|stone|gray|neutral)-\d{2,3}\b/;

function expectNoLegacy(src: string, file: string) {
  expect(src, `${file}: mission-shell import`).not.toContain('mission-shell');
  expect(src, `${file}: Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
  expect(src, `${file}: mission-select`).not.toContain('mission-select');
  expect(src, `${file}: mission-chrome-panel`).not.toContain('mission-chrome-panel');
  expect(src, `${file}: mission-grid`).not.toContain('mission-grid');
  expect(src, `${file}: mission-state-block`).not.toContain('mission-state-block');
  expect(src, `${file}: bg-black`).not.toMatch(/\bbg-black\b/);
  expect(src, `${file}: border-white/N`).not.toMatch(/border-white\/\d/);
  expect(src, `${file}: font-mono`).not.toContain('font-mono');
  expect(src, `${file}: rounded-[Npx]`).not.toMatch(/rounded-\[\d+px\]/);
  expect(src, `${file}: rounded-full`).not.toMatch(/\brounded-full\b/);
  expect(src, `${file}: raw palette color`).not.toMatch(RAW_PALETTE);
}

describe('work & comms cluster sweep (Phase 5b/6)', () => {
  // org-chart-tree carries zero legacy markers (pure memoized tree
  // builder) — its guard has been live since the scaffold.
  it('org-chart-tree has no legacy composition', () => {
    expectNoLegacy(read('orgchart/org-chart-tree.tsx'), 'org-chart-tree.tsx');
  });
});

describe('whole 5b/6 work-comms cluster is legacy-free', () => {
  const FILES = [
    'orgchart/org-chart-view.tsx',
    'orgchart/org-chart-node.tsx',
    'orgchart/org-chart-tree.tsx',
    'orgchart/employee-profile-dialog.tsx',
    'orgchart/promote-dialog.tsx',
    'orgchart/fire-dialog.tsx',
    'meetings/meetings-view.tsx',
    'meetings/meeting-detail.tsx',
    'meetings/call-meeting-dialog.tsx',
    'hire/hire-dialog.tsx',
    'chat/system-agent-badge.tsx',
    'chat/composer.tsx',
    'chat/message-list.tsx',
    'chat/thread-list.tsx',
    'chat/chat-view.tsx',
    'chat/chat-drawer.tsx',
    'memory/thread-memory-card.tsx',
    'copilot/copilot-insight-card.tsx',
    'copilot/copilot-dashboard-widget.tsx',
    'copilot/copilot-sidebar.tsx',
    'user-guide/user-guide-view.tsx',
  ];
  for (const file of FILES) {
    it(`${file} has no legacy composition`, () => {
      expectNoLegacy(read(file), file);
    });
  }
});

describe('org-chart-node', () => {
  it('console rank ramp + well-input select + selectors preserved, no legacy', () => {
    const src = read('orgchart/org-chart-node.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--led-nogo)');
    expect(src).toContain('data-org-chart-node={employee.id}');
    expect(src).toContain('data-org-chart-manager-select=""');
    for (const key of [
      'officer:',
      "'senior-management'",
      'management:',
      'supervisor:',
      'lead:',
      'ic:',
    ]) {
      expect(src, `levelPalette key ${key}`).toContain(key);
    }
    expectNoLegacy(src, 'org-chart-node.tsx');
  });
});

describe('org-chart-view', () => {
  it('SubviewState states + console header + selectors preserved, no legacy', () => {
    const src = read('orgchart/org-chart-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<SubviewState');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain('data-org-chart-view=""');
    for (const s of ['no-company', 'loading', 'error', 'empty']) {
      expect(src, `missing state ${s}`).toContain(`data-org-chart-state="${s}"`);
    }
    expect(src).toContain('data-org-chart-retry=""');
    expect(src).toContain('data-org-chart-toast=""');
    expect(src).toContain('<output');
    expectNoLegacy(src, 'org-chart-view.tsx');
  });
});

describe('employee-profile-dialog', () => {
  it('well-input fields + selectors preserved, no legacy', () => {
    const src = read('orgchart/employee-profile-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-employee-profile-dialog=""');
    for (const id of [
      'name',
      'title',
      'role',
      'manager',
      'provider',
      'model',
      'runtime',
      'avatar',
      'save',
    ]) {
      expect(src, `missing data-employee-profile-${id}`).toContain(
        `data-employee-profile-${id}=""`,
      );
    }
    expectNoLegacy(src, 'employee-profile-dialog.tsx');
  });
});

describe('promote-dialog', () => {
  it('well-input select + selectors preserved, no legacy', () => {
    const src = read('orgchart/promote-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-promote-dialog=""');
    expect(src).toContain('promote-role');
    expect(src).toContain('data-promote-role-select=""');
    expectNoLegacy(src, 'promote-dialog.tsx');
  });
});

describe('fire-dialog', () => {
  it('well-input + confirm selectors preserved, no legacy', () => {
    const src = read('orgchart/fire-dialog.tsx');
    expect(src).toContain('well-input');
    expect(src).toContain('data-fire-dialog=""');
    expect(src).toContain('data-fire-confirm-name=""');
    expect(src).toContain('Type the employee name to confirm');
    expectNoLegacy(src, 'fire-dialog.tsx');
  });
});

describe('meetings-view', () => {
  it('lamp status + SubviewState + console header, no legacy', () => {
    const src = read('meetings/meetings-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('<SubviewState');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain("tone={liveStatus ? 'armed' : 'off'}");
    expectNoLegacy(src, 'meetings-view.tsx');
  });
});

describe('meeting-detail', () => {
  it('lamp + display wells + well-input composer + aria preserved, no legacy', () => {
    const src = read('meetings/meeting-detail.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--display-fg)');
    expect(src).toContain('aria-label="Back to meetings"');
    expect(src).toContain('aria-label="Send interjection"');
    expectNoLegacy(src, 'meeting-detail.tsx');
  });
});

describe('call-meeting-dialog', () => {
  it('console scrim + Faceplate + well-input fields, ids preserved, no legacy', () => {
    const src = read('meetings/call-meeting-dialog.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('bg-[hsl(0_0%_0%/0.55)]');
    expect(src).toContain('well-input');
    expect(src).toContain('meeting-agenda');
    expect(src).toContain('meeting-chair');
    expect(src).toContain('<fieldset');
    expectNoLegacy(src, 'call-meeting-dialog.tsx');
  });
});

describe('hire-dialog', () => {
  it('armed chooser selection + Tag + well-input + pinned select preserved, no legacy', () => {
    const src = read('hire/hire-dialog.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<Tag');
    expect(src).toContain('well-input');
    expect(src).toContain('var(--armed-edge)');
    expect(src).toContain('data-hire-manager-select=""');
    expect(src).toContain('hire-name');
    expectNoLegacy(src, 'hire-dialog.tsx');
  });
});

describe('system-agent-badge', () => {
  it('console pill shape + aria preserved, no legacy', () => {
    const src = read('chat/system-agent-badge.tsx');
    expect(src).toContain('rounded-pill');
    expect(src).toContain('aria-label="Copilot conversation"');
    expectNoLegacy(src, 'system-agent-badge.tsx');
  });
});

describe('composer', () => {
  it('well panel + mode lamp + queue contract preserved, no legacy', () => {
    const src = read('chat/composer.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<LampTile');
    expect(src).toContain('cap-armed');
    expect(src).toContain('onQueue');
    expect(src).toContain('onStop');
    expect(src).toContain('queuedCount');
    expect(src).not.toContain('disabled={disabled}');
    expectNoLegacy(src, 'composer.tsx');
  });
});

describe('message-list', () => {
  it('display wells + stream recipe + steady live LED, no legacy', () => {
    const src = read('chat/message-list.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<SubviewState');
    expect(src).toContain('var(--display-fg)');
    expect(src).toContain('var(--void)');
    expect(src).toContain('text-code-sm');
    expect(src).toContain('Live stream');
    expectNoLegacy(src, 'message-list.tsx');
  });
});

describe('thread-memory-card', () => {
  it('wells + lamps via LAMP_TONE bridge + MetricTiles + selectors preserved, no legacy', () => {
    const src = read('memory/thread-memory-card.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<MetricTile');
    expect(src).toContain('LAMP_TONE');
    expect(src).toContain('data-thread-memory-card=""');
    expect(src).toContain('data-thread-memory-open=""');
    expect(src).toContain('data-thread-memory-facts=""');
    expectNoLegacy(src, 'thread-memory-card.tsx');
  });
});

describe('thread-list', () => {
  it('well rows + Tag chips + pinned kinds preserved, no legacy', () => {
    const src = read('chat/thread-list.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<Tag');
    expect(src).toContain("type ThreadKind = 'copilot' | 'agent' | 'ticket' | 'regular'");
    expect(src).toContain('TicketCheck');
    expect(src).toContain('Ticket thread');
    expect(src).toContain('Agent conversation');
    expect(src).toContain('aria-label="Copilot Conversations"');
    expectNoLegacy(src, 'thread-list.tsx');
  });
});

describe('chat-view', () => {
  it('console replaces all 8 Mission*, selectors + wiring preserved, no legacy', () => {
    const src = read('chat/chat-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toMatch(/<Faceplate|<StripeHeader/);
    expect(src).toContain('data-chat-view=""');
    for (const s of ['no-company', 'loading', 'error', 'empty']) {
      expect(src, `missing state ${s}`).toContain(`data-chat-view-state="${s}"`);
    }
    expect(src).toContain('data-chat-view-retry=""');
    expect(src).toContain('useThreadList(companyId)');
    expect(src).toContain('onSelectThread={handleSelectThread}');
    expectNoLegacy(src, 'chat-view.tsx');
  });
});

describe('copilot-insight-card', () => {
  it('LED severity + lamp/Tag badges + selectors preserved, no legacy', () => {
    const src = read('copilot/copilot-insight-card.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<LampTile');
    expect(src).toContain('<Tag');
    expect(src).toContain('var(--led-nogo)');
    expect(src).toContain('data-copilot-insight-id={insight.id}');
    expect(src).toContain('data-copilot-severity={insight.severity}');
    expect(src).toContain('Dismiss insight:');
    expectNoLegacy(src, 'copilot-insight-card.tsx');
  });
});

describe('copilot-dashboard-widget', () => {
  it('faceplate section + SubviewState states + selectors preserved, no legacy', () => {
    const src = read('copilot/copilot-dashboard-widget.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('faceplate');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('data-copilot-widget=""');
    expect(src).toContain('data-copilot-widget-count={total}');
    expect(src).toContain('data-copilot-widget-empty=""');
    expect(src).toContain('data-copilot-widget-list=""');
    expect(src).toContain('data-copilot-widget-view-all=""');
    expectNoLegacy(src, 'copilot-dashboard-widget.tsx');
  });
});

describe('copilot-sidebar', () => {
  it('console sheet + nav-tile filters + every pinned selector preserved, no legacy', () => {
    const src = read('copilot/copilot-sidebar.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('nav-tile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('cap-armed');
    for (const sel of [
      'data-copilot-sidebar-root=""',
      'data-copilot-active-count={activeCount}',
      'data-copilot-export-controls=""',
      'data-copilot-category-filter={category}',
      'data-copilot-severity-filter={severity}',
      'data-copilot-export-scope={scope}',
      'data-copilot-export-format={format}',
      'data-copilot-export-status=""',
      'data-copilot-export-error=""',
      'data-copilot-empty=""',
      'data-copilot-feed=""',
      'data-copilot-ask-input=""',
      'data-copilot-ask-submit=""',
      'data-copilot-ask-error=""',
    ]) {
      expect(src, `missing ${sel}`).toContain(sel);
    }
    expect(src).toContain('role="alert"');
    expect(src).toContain('aria-pressed');
    expect(src).toContain('function buildExportRequest(format: CopilotExportFormat)');
    expectNoLegacy(src, 'copilot-sidebar.tsx');
  });
});

describe('user-guide-view', () => {
  it('console replaces all 10 Mission*, VU on the checklist ratio, selectors preserved, no legacy', () => {
    const src = read('user-guide/user-guide-view.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('summary.total > 0 ? summary.completed / summary.total : 0');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<SubviewState');
    expect(src).toContain('nav-tile');
    expect(src).toContain('data-user-guide-role={role}');
    expect(src).toContain('data-user-guide-search=""');
    expect(src).toContain('data-user-guide-section-nav={section.id}');
    expect(src).toContain('data-user-guide-content={selectedSection.id}');
    expect(src).toContain('data-user-guide-task={task.id}');
    expect(src).toContain('data-user-guide-action={action.id}');
    expectNoLegacy(src, 'user-guide-view.tsx');
  });
});

describe('chat-drawer', () => {
  it('console sheet + stripe headers + every pinned contract preserved, no legacy', () => {
    const src = read('chat/chat-drawer.tsx');
    expect(src).toContain("from '@/components/console");
    expect(src).toContain('<StripeHeader');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<RecessedWell');
    expect(src).toContain('const effectiveThreadId = activeThreadId;');
    expect(src).toContain('function TicketThreadPreviewPanel');
    expect(src).toContain('data-thread-ticket-preview=""');
    expect(src).toContain('sm:w-[720px]');
    expect(src).toContain('xl:w-[820px]');
    expect(src).toContain('2xl:w-[900px]');
    for (const t of ['Copilot memory', 'Autonomous memory', 'Conversation memory']) {
      expect(src, `missing memory title ${t}`).toContain(t);
    }
    expect(src).toContain('aria-label="Back to threads"');
    expect(src).toContain('aria-label="View all threads"');
    expectNoLegacy(src, 'chat-drawer.tsx');
  });
});
