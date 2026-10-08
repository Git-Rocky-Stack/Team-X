import { join } from 'node:path';

export function ensureWindowsProcessEnvironment(): void {
  if (process.platform !== 'win32') return;
  const userProfile = process.env.USERPROFILE ?? 'C:\\Users\\User';
  const defaults: Record<string, string> = {
    SystemRoot: 'C:\\WINDOWS',
    windir: 'C:\\WINDOWS',
    ComSpec: 'C:\\WINDOWS\\System32\\cmd.exe',
    APPDATA: join(userProfile, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(userProfile, 'AppData', 'Local'),
    ProgramFiles: 'C:\\Program Files',
    ProgramW6432: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key] || process.env[key]?.trim().length === 0) {
      process.env[key] = value;
    }
  }
}
