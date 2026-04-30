export type RendererPlatform = 'win32' | 'darwin' | 'linux' | 'unknown';

export type RendererKnownPath = 'documents' | 'desktop' | 'downloads';

const KNOWN_PATH_SEGMENTS: Record<RendererKnownPath, string> = {
  documents: 'Documents',
  desktop: 'Desktop',
  downloads: 'Downloads',
};

/**
 * Renderer-safe platform detection. Packaged Electron renderers intentionally
 * do not expose Node globals such as `process`, so settings UI can only use
 * browser-visible platform hints unless the preload bridge provides more.
 */
export function getRendererPlatform(): RendererPlatform {
  const navigatorLike =
    typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator;
  const platformMarker =
    `${navigatorLike?.platform ?? ''} ${navigatorLike?.userAgent ?? ''}`.toLowerCase();

  if (platformMarker.includes('win')) return 'win32';
  if (platformMarker.includes('mac')) return 'darwin';
  if (platformMarker.includes('linux') || platformMarker.includes('x11')) return 'linux';
  return 'unknown';
}

export function getRendererHomeDirectory(platform: RendererPlatform = getRendererPlatform()) {
  return platform === 'win32' ? '%USERPROFILE%' : '~';
}

export function getRendererKnownPath(
  path: RendererKnownPath,
  platform: RendererPlatform = getRendererPlatform(),
) {
  const home = getRendererHomeDirectory(platform);
  const separator = platform === 'win32' ? '\\' : '/';
  return `${home}${separator}${KNOWN_PATH_SEGMENTS[path]}`;
}

export function getRendererSystemRoot(platform: RendererPlatform = getRendererPlatform()) {
  return platform === 'win32' ? 'C:\\Windows' : '/system';
}

export function getRendererProgramFiles(platform: RendererPlatform = getRendererPlatform()) {
  return platform === 'win32' ? 'C:\\Program Files' : '/usr/bin';
}
