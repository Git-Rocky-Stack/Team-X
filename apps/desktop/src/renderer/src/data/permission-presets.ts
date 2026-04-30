/**
 * Simplified Permission Presets for Team-X
 *
 * Replaces complex permission matrices with safety-first presets
 * that work for 90% of users while keeping advanced options accessible.
 */

export interface PermissionPreset {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  icon: string;
  level: 'safe' | 'standard' | 'advanced';
  capabilities: {
    allowed: string[];
    denied: string[];
  };
  paths: {
    allowed: string[];
    denied: string[];
  };
  warnings: string[];
  recommended: boolean;
  color: string;
}

/**
 * Safety-first permission presets that cover 95% of use cases
 */
export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: 'safe',
    name: 'Safe Mode',
    description: 'Read-only access, no external connections',
    longDescription:
      'The most restrictive preset. Agents can read files but cannot write, modify, or connect to external services. Perfect for testing and development where you want complete control over what agents can do.',
    icon: 'shield',
    level: 'safe',
    capabilities: {
      allowed: ['filesystem.read'],
      denied: ['filesystem.write', 'process.spawn', 'network', 'database.write'],
    },
    paths: {
      allowed: [],
      denied: [],
    },
    warnings: [],
    recommended: false,
    color: 'green',
  },
  {
    id: 'standard',
    name: 'Standard Mode (Recommended)',
    description: 'Read/write files in Documents, no internet access',
    longDescription:
      'The recommended preset for most users. Agents can read and write files in your Documents and Desktop folders, but cannot access system files or connect to the internet. Balances safety with productivity.',
    icon: 'check-circle',
    level: 'standard',
    capabilities: {
      allowed: ['filesystem.read', 'filesystem.write'],
      denied: ['process.spawn', 'network', 'database.write'],
    },
    paths: {
      allowed: ['%%USER_DOCUMENTS%%', '%%USER_DESKTOP%%', '%%USER_DOWNLOADS%%'],
      denied: ['%%SYSTEM_ROOT%%', '%%PROGRAM_FILES%%', '%%WINDOWS%%'],
    },
    warnings: [],
    recommended: true,
    color: 'blue',
  },
  {
    id: 'advanced',
    name: 'Advanced Mode',
    description: 'More access with custom path selection',
    longDescription:
      'For power users who need fine-grained control. Allows most capabilities and lets you choose exactly which paths agents can access. Requires understanding of security implications.',
    icon: 'settings',
    level: 'advanced',
    capabilities: {
      allowed: ['filesystem.read', 'filesystem.write', 'network'],
      denied: ['process.spawn'],
    },
    paths: {
      allowed: [],
      denied: [],
    },
    warnings: [
      'Network access allows agents to connect to external services',
      'File write access allows agents to modify files on your system',
      'Review which paths agents can access carefully',
    ],
    recommended: false,
    color: 'orange',
  },
];

/**
 * Get preset by ID
 */
export function getPresetById(id: string): PermissionPreset | undefined {
  return PERMISSION_PRESETS.find((preset) => preset.id === id);
}

/**
 * Get recommended preset
 */
export function getRecommendedPreset(): PermissionPreset {
  const recommended = PERMISSION_PRESETS.find((preset) => preset.recommended);
  if (!recommended) {
    throw new Error('Permission presets must include one recommended preset');
  }
  return recommended;
}

/**
 * Get preset by level
 */
export function getPresetByLevel(
  level: 'safe' | 'standard' | 'advanced',
): PermissionPreset | undefined {
  return PERMISSION_PRESETS.find((preset) => preset.level === level);
}

/**
 * Expand path placeholders to actual paths
 */
export function expandPathPlaceholders(path: string): string {
  const os = process.platform || 'unknown';

  // User directory placeholders
  let expanded = path.replace(/%%USER_HOME%%/g, process.env.HOME || process.env.USERPROFILE || '');
  expanded = expanded.replace(/%%USER_DOCUMENTS%%/g, () => {
    if (os === 'win32') {
      return `${process.env.USERPROFILE}\\Documents`;
    }
    return `${process.env.HOME}/Documents`;
  });
  expanded = expanded.replace(/%%USER_DESKTOP%%/g, () => {
    if (os === 'win32') {
      return `${process.env.USERPROFILE}\\Desktop`;
    }
    return `${process.env.HOME}/Desktop`;
  });
  expanded = expanded.replace(/%%USER_DOWNLOADS%%/g, () => {
    if (os === 'win32') {
      return `${process.env.USERPROFILE}\\Downloads`;
    }
    return `${process.env.HOME}/Downloads`;
  });

  // System placeholders
  expanded = expanded.replace(/%%SYSTEM_ROOT%%/g, () => {
    if (os === 'win32') {
      return process.env.SystemRoot || 'C:\\Windows';
    }
    return '/system';
  });
  expanded = expanded.replace(/%%PROGRAM_FILES%%/g, () => {
    if (os === 'win32') {
      return process.env.ProgramFiles || 'C:\\Program Files';
    }
    return '/usr/bin';
  });
  expanded = expanded.replace(/%%WINDOWS%%/g, () => {
    if (os === 'win32') {
      return process.env.WINDIR || 'C:\\Windows';
    }
    return '/windows';
  });

  return expanded;
}

/**
 * Get user-friendly path name
 */
export function getUserFriendlyPathName(path: string): string {
  const expanded = expandPathPlaceholders(path);
  const os = process.platform || 'unknown';

  // User directories
  if (expanded.includes('Documents')) return '📁 Documents';
  if (expanded.includes('Desktop')) return '🖥️ Desktop';
  if (expanded.includes('Downloads')) return '📥 Downloads';
  if (
    expanded.includes(process.env.HOME || '') ||
    expanded.includes(process.env.USERPROFILE || '')
  ) {
    return '🏠 User Home';
  }

  // System directories
  if (os === 'win32') {
    if (expanded.includes('Windows') || expanded.includes('System32')) return '⚙️ System Files';
    if (expanded.includes('Program Files')) return '💿 Program Files';
  } else {
    if (expanded.includes('/usr') || expanded.includes('/bin')) return '⚙️ System Files';
    if (expanded.includes('/etc')) return '⚙️ System Config';
  }

  // Default: return the expanded path
  return expanded;
}

/**
 * Get path description for UI
 */
export function getPathDescription(path: string, type: 'allowed' | 'denied'): string {
  const friendlyName = getUserFriendlyPathName(path);
  const prefix = type === 'allowed' ? 'Can access' : 'Cannot access';
  return `${prefix} ${friendlyName}`;
}

/**
 * Validate if a preset is safe for a given use case
 */
export function isPresetSafeForUseCase(
  presetId: string,
  useCase: 'development' | 'production' | 'testing',
): boolean {
  const preset = getPresetById(presetId);
  if (!preset) return false;

  switch (useCase) {
    case 'production':
      return preset.level === 'safe';
    case 'development':
      return preset.level === 'safe' || preset.level === 'standard';
    case 'testing':
      return true; // All presets are safe for testing
    default:
      return false;
  }
}

/**
 * Get preset recommendation based on user experience
 */
export function getRecommendedPresetForUser(
  experience: 'beginner' | 'intermediate' | 'advanced',
): PermissionPreset {
  switch (experience) {
    case 'beginner': {
      const safePreset = getPresetById('safe');
      return safePreset ?? getRecommendedPreset();
    }
    case 'intermediate':
      return getRecommendedPreset();
    case 'advanced': {
      const advancedPreset = getPresetById('advanced');
      return advancedPreset ?? getRecommendedPreset();
    }
    default:
      return getRecommendedPreset();
  }
}
