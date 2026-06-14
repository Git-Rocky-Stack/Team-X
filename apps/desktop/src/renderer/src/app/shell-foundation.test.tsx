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

  it('sweeps the top bar into the edge-to-edge command bar', () => {
    expect(topBarSrc).toContain('data-top-bar-shell=""');
    expect(topBarSrc).toContain('data-top-bar-nav=""');
    expect(topBarSrc).toContain('nav-tile stencil');
    expect(topBarSrc).toContain('nav-tile-active');
    expect(topBarSrc).toContain('text-placard');
    expect(topBarSrc).toContain('<WorkspaceSwitcher />');
    expect(topBarSrc).toContain('Operational command shell');
    // Console composition only — the legacy mission chrome must not return.
    expect(topBarSrc).not.toContain('MissionControlRow');
    expect(topBarSrc).not.toContain('mission-');
    expect(topBarSrc).not.toContain('bg-black');
    expect(topBarSrc).not.toContain('border-white/10');
  });

  it('sweeps the employee rail into the console chassis', () => {
    expect(sidenavSrc).toContain(
      'flex w-64 shrink-0 flex-col rounded-card border border-[var(--hairline)] bg-card',
    );
    expect(sidenavSrc).toContain(
      'flex items-center justify-between rounded-control border border-[var(--hairline)] bg-[var(--carbon-850)]',
    );
    expect(sidenavSrc).toContain('lamp lamp-sm lamp-hold');
    expect(sidenavSrc).toContain('nav-tile stencil');
    expect(sidenavSrc).toContain('Employee rail');
    // Console composition only — the legacy mission chrome must not return.
    expect(sidenavSrc).not.toContain('mission-');
    expect(sidenavSrc).not.toContain('bg-black');
    expect(sidenavSrc).not.toContain('border-white/10');
    expect(sidenavSrc).not.toContain('border-brand');
  });
});
