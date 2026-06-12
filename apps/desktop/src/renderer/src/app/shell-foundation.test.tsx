import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const TOP_BAR_PATH = join(currentDirname, 'top-bar.tsx');
const LAYOUT_PATH = join(currentDirname, 'layout.tsx');
const SIDENAV_PATH = join(currentDirname, 'sidenav.tsx');

const topBarSrc = readFileSync(TOP_BAR_PATH, 'utf8');
const layoutSrc = readFileSync(LAYOUT_PATH, 'utf8');
const sidenavSrc = readFileSync(SIDENAV_PATH, 'utf8');

describe('mission shell foundation source audit', () => {
  it('mounts the app inside the console chassis', () => {
    expect(layoutSrc).toContain(
      'relative flex h-screen flex-col overflow-hidden bg-background text-foreground',
    );
    expect(layoutSrc).not.toContain('mission-app-shell');
    expect(layoutSrc).not.toContain('mission-grid');
    expect(layoutSrc).toContain(
      'min-w-0 flex-1 overflow-y-auto rounded-card border border-[var(--hairline)] bg-card',
    );
  });

  it('wires the top bar into the new mission control row layout', () => {
    expect(topBarSrc).toContain('data-top-bar-shell=""');
    expect(topBarSrc).toContain('data-top-bar-nav=""');
    expect(topBarSrc).toContain('MissionControlRow');
    expect(topBarSrc).toContain('<WorkspaceSwitcher />');
    expect(topBarSrc).toContain('Operational command shell');
  });

  it('carries the mission chrome into the employee rail', () => {
    expect(sidenavSrc).toContain('mission-chrome-panel flex w-64 shrink-0 flex-col rounded-[30px]');
    expect(sidenavSrc).toContain(
      'mission-control-row flex items-center justify-between rounded-[22px]',
    );
    expect(sidenavSrc).toContain('Employee rail');
  });
});
