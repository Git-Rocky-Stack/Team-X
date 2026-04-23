import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const APP_PATH = join(currentDirname, '..', '..', 'App.tsx');
const STORE_PATH = join(currentDirname, '..', '..', 'store', 'app-store.ts');
const SIDENAV_PATH = join(currentDirname, '..', '..', 'app', 'sidenav.tsx');
const TOP_BAR_PATH = join(currentDirname, '..', '..', 'app', 'top-bar.tsx');
const HOOK_PATH = join(currentDirname, '..', '..', 'hooks', 'use-operators.ts');
const VIEW_PATH = join(currentDirname, 'autonomy-view.tsx');

const appSrc = readFileSync(APP_PATH, 'utf8');
const storeSrc = readFileSync(STORE_PATH, 'utf8');
const sidenavSrc = readFileSync(SIDENAV_PATH, 'utf8');
const topBarSrc = readFileSync(TOP_BAR_PATH, 'utf8');
const hookSrc = readFileSync(HOOK_PATH, 'utf8');
const viewSrc = readFileSync(VIEW_PATH, 'utf8');

describe('Autonomy shell wiring', () => {
  it('adds autonomy as a top-level app destination', () => {
    expect(storeSrc).toContain("| 'autonomy'");
    expect(appSrc).toContain("import { AutonomyView } from './features/autonomy/autonomy-view.js';");
    expect(appSrc).toContain("case 'autonomy':");
    expect(appSrc).toContain('<AutonomyView company={activeCompany} companyId={companyId} />');
  });

  it('exposes the new autonomy entry in the navigation shell', () => {
    expect(sidenavSrc).toContain('data-autonomy-nav=""');
    expect(sidenavSrc).toContain("setActiveView('autonomy')");
    expect(sidenavSrc).toContain('Runtimes, routines, budgets, approvals, artifacts, and operator access.');
    expect(topBarSrc).toContain("{ label: 'Autonomy', icon: Workflow, view: 'autonomy' },");
  });

  it('adds a company-scoped operators hook and autonomy shell content', () => {
    expect(hookSrc).toContain("queryKey: ['operators', companyId]");
    expect(hookSrc).toContain('ipc.operators.list(companyId!)');
    expect(viewSrc).toContain("const [activeSubview, setActiveSubview] = useState<AutonomySubview>('access');");
    expect(viewSrc).toContain('AUTONOMY_SUBVIEWS');
    expect(viewSrc).toContain('data-autonomy-view=""');
    expect(viewSrc).toContain('data-autonomy-subview={subview.value}');
    expect(viewSrc).toContain('Operator Control Plane');
    expect(viewSrc).toContain('Team-X stays zero-login by default.');
    expect(viewSrc).toContain('Runtime profiles will let operators bind employees');
  });
});
