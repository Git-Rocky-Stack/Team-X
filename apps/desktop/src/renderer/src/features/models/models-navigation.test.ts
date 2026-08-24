/**
 * Models tab wiring — a source pin over the three files that make the view
 * reachable.
 *
 * A panel that renders perfectly and is routed from nowhere is the exact
 * failure this repo just spent an audit removing: shipped, tested, and
 * unreachable. Rendering `App.tsx` for real would drag the entire application
 * shell (workspace switcher, orchestrator hooks, the whole store) into a unit
 * test, so reachability is pinned structurally instead — the same technique
 * the renderer cluster sweeps use.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const rendererSrc = join(here, '..', '..');

const appSrc = readFileSync(join(rendererSrc, 'App.tsx'), 'utf8');
const topBarSrc = readFileSync(join(rendererSrc, 'app', 'top-bar.tsx'), 'utf8');
const storeSrc = readFileSync(join(rendererSrc, 'store', 'app-store.ts'), 'utf8');

describe('Models view is reachable', () => {
  it('is a member of the ActiveView union', () => {
    expect(storeSrc).toMatch(/export type ActiveView =[\s\S]*?\|\s*'models'/);
  });

  it('has a top-bar tab that routes to it', () => {
    expect(topBarSrc).toMatch(/view:\s*'models'/);
  });

  it('is rendered by the App view switch', () => {
    expect(appSrc).toContain("case 'models':");
    expect(appSrc).toContain('<ModelsView');
  });

  it('is reachable from the command palette’s /show command', () => {
    // Adding a member to ActiveView means auditing every list that enumerates
    // the union. `SHOW_VIEW_LITERALS` drives `/show <view>`; omitting the new
    // value makes the view unreachable by keyboard.
    const paletteSrc = readFileSync(
      join(rendererSrc, 'features', 'command', 'command-palette.tsx'),
      'utf8',
    );
    expect(paletteSrc).toMatch(/SHOW_VIEW_LITERALS[\s\S]*?'models'/);
  });

  it('is imported by App.tsx', () => {
    expect(appSrc).toMatch(/import \{ ModelsView \} from '\.\/features\/models\/models-view\.js'/);
  });
});

describe('Models panel selection is persisted in the store', () => {
  it('declares the panel union', () => {
    expect(storeSrc).toMatch(/export type ModelsPanel =/);
    for (const panel of ['library', 'discover', 'endpoints', 'runtime']) {
      expect(storeSrc).toContain(`'${panel}'`);
    }
  });

  it('exposes the panel state and its setter', () => {
    expect(storeSrc).toMatch(/modelsPanel: ModelsPanel/);
    expect(storeSrc).toMatch(/setModelsPanel: \(panel: ModelsPanel\) => void/);
  });
});

describe('Every models panel is wired into the shell', () => {
  const viewSrc = readFileSync(join(here, 'models-view.tsx'), 'utf8');

  it.each([
    ['LibraryPanel', './library-panel.js'],
    ['DiscoverPanel', './discover-panel.js'],
    ['EndpointsPanel', './endpoints-panel.js'],
    ['RuntimePanel', './runtime-panel.js'],
  ])('%s is imported and rendered', (component, path) => {
    expect(viewSrc).toContain(`from '${path}'`);
    expect(viewSrc).toContain(`<${component} />`);
  });

  it('ModelDetail reaches the tree through the library panel', () => {
    const librarySrc = readFileSync(join(here, 'library-panel.tsx'), 'utf8');
    expect(librarySrc).toContain("from './model-detail.js'");
    expect(librarySrc).toContain('<ModelDetail');
  });
});
