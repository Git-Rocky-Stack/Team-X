import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { type ElectronUserDataApp, configureStableUserDataPath } from './app-user-data.js';

class FakeElectronApp implements ElectronUserDataApp {
  private readonly paths: Record<'appData' | 'userData', string>;

  readonly setPathCalls: Array<{ name: 'userData'; path: string }> = [];
  readonly setNameCalls: string[] = [];

  constructor(appDataPath: string, initialUserDataPath = join(appDataPath, '@team-x', 'desktop')) {
    this.paths = {
      appData: appDataPath,
      userData: initialUserDataPath,
    };
  }

  getPath(name: 'appData' | 'userData'): string {
    return this.paths[name];
  }

  setPath(name: 'userData', path: string): void {
    this.paths[name] = path;
    this.setPathCalls.push({ name, path });
  }

  setName(name: string): void {
    this.setNameCalls.push(name);
  }
}

const tempRoots: string[] = [];
const silentLogger = {
  log: () => {},
  warn: () => {},
};

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'teamx-user-data-'));
  tempRoots.push(root);
  return root;
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('configureStableUserDataPath', () => {
  it('pins normal app runs to a stable Team-X profile and migrates legacy data once', () => {
    const appData = makeTempRoot();
    const legacy = join(appData, '@team-x', 'desktop');
    const stable = join(appData, 'Team-X');
    writeText(join(legacy, 'team-x', 'team-x.sqlite'), 'legacy-db');
    writeText(join(legacy, 'backups', 'backup-1', 'manifest.json'), '{"ok":true}');
    writeText(join(legacy, 'Local Storage', 'leveldb', '000003.log'), 'renderer-pref');

    const app = new FakeElectronApp(appData);
    const result = configureStableUserDataPath(app, {
      argv: ['electron'],
      env: {},
      logger: silentLogger,
    });

    expect(result).toEqual({
      mode: 'stable',
      userDataPath: stable,
      migratedFrom: legacy,
    });
    expect(app.setNameCalls).toEqual(['Team-X']);
    expect(app.setPathCalls).toEqual([{ name: 'userData', path: stable }]);
    expect(readFileSync(join(stable, 'team-x', 'team-x.sqlite'), 'utf8')).toBe('legacy-db');
    expect(existsSync(join(stable, 'backups', 'backup-1', 'manifest.json'))).toBe(true);
    expect(readFileSync(join(stable, 'Local Storage', 'leveldb', '000003.log'), 'utf8')).toBe(
      'renderer-pref',
    );
    expect(readFileSync(join(legacy, 'team-x', 'team-x.sqlite'), 'utf8')).toBe('legacy-db');
  });

  it('does not overwrite an existing stable database', () => {
    const appData = makeTempRoot();
    const legacy = join(appData, '@team-x', 'desktop');
    const stable = join(appData, 'Team-X');
    writeText(join(legacy, 'team-x', 'team-x.sqlite'), 'legacy-db');
    writeText(join(stable, 'team-x', 'team-x.sqlite'), 'stable-db');

    const app = new FakeElectronApp(appData);
    const result = configureStableUserDataPath(app, {
      argv: ['electron'],
      env: {},
      logger: silentLogger,
    });

    expect(result.migratedFrom).toBeNull();
    expect(readFileSync(join(stable, 'team-x', 'team-x.sqlite'), 'utf8')).toBe('stable-db');
  });

  it('preserves explicit E2E user-data-dir isolation', () => {
    const appData = makeTempRoot();
    const isolated = join(appData, 'isolated-test-profile');
    const app = new FakeElectronApp(appData, isolated);

    const result = configureStableUserDataPath(app, {
      argv: ['electron', `--user-data-dir=${isolated}`],
      env: {},
      logger: silentLogger,
    });

    expect(result).toEqual({
      mode: 'isolated-cli',
      userDataPath: isolated,
      migratedFrom: null,
    });
    expect(app.setNameCalls).toEqual([]);
    expect(app.setPathCalls).toEqual([]);
  });

  it('honors an explicit testing profile from TEAM_X_USER_DATA_DIR', () => {
    const appData = makeTempRoot();
    const explicit = join(appData, 'manual-testing-profile');
    const app = new FakeElectronApp(appData);

    const result = configureStableUserDataPath(app, {
      argv: ['electron'],
      env: { TEAM_X_USER_DATA_DIR: explicit },
      logger: silentLogger,
    });

    expect(result).toEqual({
      mode: 'explicit-env',
      userDataPath: explicit,
      migratedFrom: null,
    });
    expect(app.setNameCalls).toEqual(['Team-X']);
    expect(app.setPathCalls).toEqual([{ name: 'userData', path: explicit }]);
    expect(existsSync(explicit)).toBe(true);
  });
});
