/**
 * The renderer trust boundary (audit 2026-10-07 P0-3).
 *
 * The window already runs with contextIsolation, sandbox, webSecurity and no
 * Node integration. This module closes what those flags leave open:
 *
 *   - Every IPC handler, present and future, refuses any sender that is not
 *     the app's own top-level renderer frame. The guard is installed on the
 *     `ipcMain` object itself, before anything registers, so no call site
 *     can forget it.
 *   - The window cannot navigate away from the app, open new windows, or
 *     attach a <webview>. https/mailto links go to the user's browser
 *     instead.
 *   - Permission requests (camera, microphone, geolocation, notifications,
 *     USB, ...) are denied. The only grant is the sanitized clipboard write
 *     that the Commands "copy" button uses, and only to the app itself.
 *
 * Electron types are kept structural so the policy is unit-testable without
 * an Electron runtime.
 */

import { pathToFileURL } from 'node:url';

export interface TrustedRenderer {
  /** True for the app's own page: the packaged index.html, or the dev server origin. */
  isTrustedUrl(url: string): boolean;
  /** True only for a top-level frame showing the app's own page. */
  isTrustedFrame(frame: FrameLike | null | undefined): boolean;
}

export interface FrameLike {
  readonly url: string;
  readonly top: unknown;
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Pin the one page this app is allowed to run. In a packaged build that is a
 * single file; under `electron-vite dev` it is the dev server's origin.
 */
export function createTrustedRenderer(options: {
  indexHtmlPath: string;
  devServerUrl?: string;
}): TrustedRenderer {
  const devOrigin = options.devServerUrl ? parse(options.devServerUrl)?.origin : undefined;
  const indexUrl = pathToFileURL(options.indexHtmlPath);

  const isTrustedUrl = (url: string): boolean => {
    const u = parse(url);
    if (!u) return false;
    if (devOrigin) return u.origin === devOrigin;
    return u.protocol === 'file:' && u.host === indexUrl.host && u.pathname === indexUrl.pathname;
  };

  return {
    isTrustedUrl,
    isTrustedFrame(frame) {
      if (!frame) return false;
      if (frame.top !== frame) return false;
      return isTrustedUrl(frame.url);
    },
  };
}

// ---------------------------------------------------------------------------
// IPC sender guard
// ---------------------------------------------------------------------------

interface SenderEvent {
  senderFrame?: FrameLike | null;
}
type Listener = (event: SenderEvent, ...args: unknown[]) => unknown;

export interface GuardableIpc {
  handle(channel: string, listener: Listener): void;
  handleOnce(channel: string, listener: Listener): void;
  on(channel: string, listener: Listener): unknown;
  once(channel: string, listener: Listener): unknown;
}

const GUARDED = Symbol.for('team-x.ipc-sender-guard');

/**
 * Wrap `handle`, `handleOnce`, `on` and `once` on the given ipcMain so every
 * listener registered afterwards first checks `event.senderFrame`. Must run
 * before any handler is registered; installing twice throws.
 */
export function installIpcSenderGuard(
  ipc: GuardableIpc,
  trusted: TrustedRenderer,
  warn: (message: string) => void,
): void {
  const target = ipc as GuardableIpc & { [GUARDED]?: true };
  if (target[GUARDED]) throw new Error('IPC sender guard already installed');
  target[GUARDED] = true;

  const reject = (channel: string, event: SenderEvent): string => {
    const url = event.senderFrame?.url ?? '(no frame)';
    const message = `IPC '${channel}' refused: untrusted sender ${url}`;
    warn(message);
    return message;
  };

  const guardInvoke =
    (channel: string, listener: Listener): Listener =>
    async (event, ...args) => {
      if (!trusted.isTrustedFrame(event.senderFrame)) throw new Error(reject(channel, event));
      return listener(event, ...args);
    };
  const guardEvent =
    (channel: string, listener: Listener): Listener =>
    (event, ...args) => {
      if (!trusted.isTrustedFrame(event.senderFrame)) {
        reject(channel, event);
        return undefined;
      }
      return listener(event, ...args);
    };

  const handle = ipc.handle.bind(ipc);
  const handleOnce = ipc.handleOnce.bind(ipc);
  const on = ipc.on.bind(ipc);
  const once = ipc.once.bind(ipc);
  target.handle = (channel, listener) => handle(channel, guardInvoke(channel, listener));
  target.handleOnce = (channel, listener) => handleOnce(channel, guardInvoke(channel, listener));
  target.on = (channel, listener) => on(channel, guardEvent(channel, listener));
  target.once = (channel, listener) => once(channel, guardEvent(channel, listener));
}

// ---------------------------------------------------------------------------
// Navigation, new windows, webviews
// ---------------------------------------------------------------------------

/**
 * The only schemes handed to the OS. `http:` is excluded so a link cannot
 * downgrade, and URLs carrying credentials are refused outright.
 */
export function isSafeExternalUrl(url: string): boolean {
  const u = parse(url);
  if (!u) return false;
  if (u.username || u.password) return false;
  return u.protocol === 'https:' || u.protocol === 'mailto:';
}

interface PreventableEvent {
  preventDefault(): void;
}

export interface HardenableContents {
  getType(): string;
  on(event: string, listener: (event: PreventableEvent, ...args: never[]) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
}

export function hardenWebContents(
  contents: HardenableContents,
  trusted: TrustedRenderer,
  openExternal: (url: string) => unknown,
): void {
  // DevTools hosts its own pages; it is not the app and never reaches IPC.
  if (contents.getType() === 'devtools') return;

  const leave = (event: PreventableEvent, url: string): void => {
    if (trusted.isTrustedUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void openExternal(url);
  };
  contents.on('will-navigate', (event, url: string) => leave(event, url));
  contents.on('will-redirect', (event, url: string) => {
    if (!trusted.isTrustedUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Every permission the app may hold. Anything else is denied. */
export const ALLOWED_PERMISSIONS: readonly string[] = ['clipboard-sanitized-write'];

export interface PermissionSession {
  setPermissionRequestHandler(
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: { requestingUrl?: string },
    ) => void,
  ): void;
  setPermissionCheckHandler(
    handler: (
      webContents: unknown,
      permission: string,
      requestingOrigin: string,
      details: { requestingUrl?: string },
    ) => boolean,
  ): void;
}

export function installPermissionPolicy(
  session: PermissionSession,
  trusted: TrustedRenderer,
): void {
  const allowed = (permission: string, url: string | undefined): boolean =>
    ALLOWED_PERMISSIONS.includes(permission) && url !== undefined && trusted.isTrustedUrl(url);

  session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowed(permission, details.requestingUrl));
  });
  session.setPermissionCheckHandler((_wc, permission, _origin, details) =>
    allowed(permission, details.requestingUrl),
  );
}
