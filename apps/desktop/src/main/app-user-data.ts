import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const APP_NAME = 'Team-X';
const EXPLICIT_USER_DATA_ENV = 'TEAM_X_USER_DATA_DIR';
const LEGACY_PROFILE_SEGMENTS = ['@team-x', 'desktop'] as const;
const SETTINGS_DB_RELATIVE_PATH = join('team-x', 'team-x.sqlite');
const DURABLE_PROFILE_ENTRIES = [
  'team-x',
  'companies',
  'backups',
  'extensions',
  'Local Storage',
] as const;

type ElectronPathName = 'appData' | 'userData';

export interface ElectronUserDataApp {
  getPath(name: ElectronPathName): string;
  setPath(name: 'userData', path: string): void;
  setName?(name: string): void;
}

export interface StableUserDataOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  logger?: Pick<Console, 'log' | 'warn'>;
}

export type StableUserDataMode = 'stable' | 'explicit-env' | 'isolated-cli';

export interface StableUserDataResult {
  mode: StableUserDataMode;
  userDataPath: string;
  migratedFrom: string | null;
}

function hasUserDataCliArg(argv: readonly string[]): boolean {
  return argv.some((arg) => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='));
}

function normalizeExplicitPath(pathValue: string | undefined): string | null {
  const trimmed = pathValue?.trim();
  if (!trimmed) return null;
  return resolve(trimmed);
}

function copyMissingPath(source: string, target: string): void {
  const sourceStat = statSync(source);
  if (sourceStat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      copyMissingPath(join(source, entry), join(target, entry));
    }
    return;
  }

  if (!sourceStat.isFile() || existsSync(target)) return;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function copyDurableLegacyProfileEntries(sourceRoot: string, targetRoot: string): void {
  for (const entry of DURABLE_PROFILE_ENTRIES) {
    const source = join(sourceRoot, entry);
    if (existsSync(source)) {
      copyMissingPath(source, join(targetRoot, entry));
    }
  }
}

function shouldMigrateLegacyProfile(legacyPath: string, stablePath: string): boolean {
  return (
    existsSync(join(legacyPath, SETTINGS_DB_RELATIVE_PATH)) &&
    !existsSync(join(stablePath, SETTINGS_DB_RELATIVE_PATH))
  );
}

export function configureStableUserDataPath(
  electronApp: ElectronUserDataApp,
  options: StableUserDataOptions = {},
): StableUserDataResult {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const logger = options.logger;

  if (hasUserDataCliArg(argv)) {
    return {
      mode: 'isolated-cli',
      userDataPath: electronApp.getPath('userData'),
      migratedFrom: null,
    };
  }

  const explicitUserDataPath = normalizeExplicitPath(env[EXPLICIT_USER_DATA_ENV]);
  if (explicitUserDataPath) {
    mkdirSync(explicitUserDataPath, { recursive: true });
    electronApp.setName?.(APP_NAME);
    electronApp.setPath('userData', explicitUserDataPath);
    logger?.log(`[userData] using ${EXPLICIT_USER_DATA_ENV}: ${explicitUserDataPath}`);
    return {
      mode: 'explicit-env',
      userDataPath: explicitUserDataPath,
      migratedFrom: null,
    };
  }

  const appDataPath = electronApp.getPath('appData');
  const stableUserDataPath = join(appDataPath, APP_NAME);
  const legacyUserDataPath = join(appDataPath, ...LEGACY_PROFILE_SEGMENTS);
  mkdirSync(stableUserDataPath, { recursive: true });

  let migratedFrom: string | null = null;
  if (shouldMigrateLegacyProfile(legacyUserDataPath, stableUserDataPath)) {
    try {
      copyDurableLegacyProfileEntries(legacyUserDataPath, stableUserDataPath);
      migratedFrom = legacyUserDataPath;
      logger?.log(`[userData] migrated durable profile data from ${legacyUserDataPath}`);
    } catch (error) {
      logger?.warn(
        '[userData] legacy profile migration failed; continuing with stable profile',
        error,
      );
    }
  }

  electronApp.setName?.(APP_NAME);
  electronApp.setPath('userData', stableUserDataPath);
  return {
    mode: 'stable',
    userDataPath: stableUserDataPath,
    migratedFrom,
  };
}
