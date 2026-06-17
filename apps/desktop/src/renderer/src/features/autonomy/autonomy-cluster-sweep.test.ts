import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, file), 'utf8');

const viewSrc = read('autonomy-view.tsx');

describe('autonomy cluster aesthetic sweep (Phase 4a)', () => {
  it('autonomy-view: console shell + nav-tile + MetricTile, no Mission* / legacy', () => {
    expect(viewSrc).toContain("from '@/components/console/index.js'");
    expect(viewSrc).toContain('<MetricTile');
    expect(viewSrc).toContain('nav-tile');
    expect(viewSrc).toContain("aria-current={subview.value === activeSubview ? 'page' : undefined}");
    expect(viewSrc).toContain('<SubviewState');
    // selectors preserved
    expect(viewSrc).toContain('data-autonomy-view');
    expect(viewSrc).toContain('data-autonomy-subview={subview.value}');
    expect(viewSrc).toContain('data-cloud-link-card');
    expect(viewSrc).toContain('data-operator-invites');
    expect(viewSrc).toContain('data-operator-invite-compose');
    expect(viewSrc).toContain('data-operator-invite={invite.id}');
    // legacy-absent
    expect(viewSrc).not.toContain('mission-shell.js');
    expect(viewSrc).not.toContain('MissionPageShell');
    expect(viewSrc).not.toContain('MissionSegmentedButton');
    expect(viewSrc).not.toMatch(/\bbg-black\b/);
    expect(viewSrc).not.toContain('border-white/10');
    expect(viewSrc).not.toContain('text-red-200');
    expect(viewSrc).not.toContain('text-emerald-300');
  });

  it('doctor panel: console hardware, lamp status, VU, selectors preserved, no legacy', () => {
    const src = read('autonomy-doctor-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('data-autonomy-doctor-panel');
    expect(src).toContain('data-autonomy-doctor-check={check.id}');
    expect(src).toContain('data-autonomy-doctor-finding={finding.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toContain('border-white/10');
  });

  it('benchmark panel: console hardware, lamp status, VU, selectors preserved, no legacy', () => {
    const src = read('autonomy-benchmark-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('data-autonomy-benchmark-panel');
    expect(src).toContain('data-autonomy-benchmark-result={result.scenarioId}');
    expect(src).toContain('data-autonomy-benchmark-runtime={kind}');
    expect(src).toContain('data-autonomy-benchmark-scenario={scenarioId}');
    expect(src).toContain('data-autonomy-benchmark-summary');
    expect(src).toContain('data-autonomy-benchmark-results');
    expect(src).toContain('data-autonomy-benchmark-runtime-group={runtimeKind}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toContain('border-white/10');
  });

  it('agent-improvement panel: console hardware + aria-label preserved, no legacy', () => {
    const src = read('agent-improvement-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('<LampTile');
    expect(src).toContain('aria-label={`Open ${ticket.title}`}');
    expect(src).toContain('data-agent-improvement-panel');
    expect(src).toContain('data-agent-improvement-ticket={ticket.id}');
    expect(src).toContain('data-agent-improvement-recommendation={recommendation.id}');
    expect(src).toContain('data-agent-improvement-run-result');
    expect(src).toContain('data-agent-improvement-run={run.eventId}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toContain('border-white/10');
    expect(src).not.toContain('rounded-[16px]');
  });

  it('approvals panel: console hardware + cap-select filters + selectors, no legacy', () => {
    const src = read('approvals-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('cap-select');
    expect(src).toContain('data-approvals-panel');
    expect(src).toContain('data-approval-kind-filter={value}');
    expect(src).toContain('data-approval-status-filter={value}');
    expect(src).toContain('data-approval-card={item.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toContain('border-white/10');
    expect(src).not.toContain('rounded-full');
  });

  it('artifacts panel: console hardware + cap-select filters + selectors, no legacy', () => {
    const src = read('artifacts-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('cap-select');
    expect(src).toContain('data-artifacts-panel');
    expect(src).toContain('data-artifact-card={artifact.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toContain('border-white/10');
    expect(src).not.toContain('border-white/8');
    expect(src).not.toContain('rounded-full');
  });

  it('memory panel: console hardware + cap-select budget + VU + selectors, no legacy', () => {
    const src = read('memory-panel.tsx');
    expect(src).toContain("from '@/components/console/index.js'");
    expect(src).toContain('<MetricTile');
    expect(src).toContain('cap-select');
    expect(src).toContain('<VuMeter');
    expect(src).toContain('data-memory-panel');
    expect(src).toContain('data-memory-thread-select');
    expect(src).toContain('data-memory-dropped-block={drop.blockId}');
    expect(src).toContain('data-memory-checkpoint={checkpoint.id}');
    expect(src).not.toContain('mission-shell.js');
    expect(src).not.toMatch(/\bbg-black\b/);
    expect(src).not.toContain('border-white/10');
    expect(src).not.toContain('border-white/8');
    expect(src).not.toContain('rounded-[16px]');
    expect(src).not.toContain('rounded-[18px]');
  });

  it('the whole 4a cluster is free of Mission* and legacy composition', () => {
    const files = [
      'autonomy-view.tsx',
      'autonomy-doctor-panel.tsx',
      'autonomy-benchmark-panel.tsx',
      'agent-improvement-panel.tsx',
      'approvals-panel.tsx',
      'artifacts-panel.tsx',
      'memory-panel.tsx',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, `${file} imports mission-shell`).not.toContain('mission-shell.js');
      expect(src, `${file} uses a Mission* primitive`).not.toMatch(/\bMission[A-Z]\w+/);
      expect(src, `${file} has bg-black`).not.toMatch(/\bbg-black\b/);
      expect(src, `${file} has border-white/N`).not.toMatch(/border-white\/\d/);
      expect(src, `${file} has font-mono`).not.toContain('font-mono');
      expect(src, `${file} has raw status color`).not.toMatch(/text-(?:red|emerald|amber)-\d{2,3}/);
    }
  });
});
