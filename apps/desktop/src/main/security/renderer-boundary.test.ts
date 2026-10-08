import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  ALLOWED_PERMISSIONS,
  createTrustedRenderer,
  hardenWebContents,
  installIpcSenderGuard,
  installPermissionPolicy,
  isSafeExternalUrl,
} from './renderer-boundary.js';

const INDEX = '/opt/Team-X/resources/app.asar/out/renderer/index.html';
const INDEX_URL = pathToFileURL(INDEX).href;

function frame(url: string, top = true) {
  const f: { url: string; top: unknown } = { url, top: null };
  f.top = top ? f : { url: INDEX_URL };
  return f;
}

describe('createTrustedRenderer', () => {
  const packaged = createTrustedRenderer({ indexHtmlPath: INDEX });

  it('trusts the packaged index.html, with or without a hash or query', () => {
    expect(packaged.isTrustedUrl(INDEX_URL)).toBe(true);
    expect(packaged.isTrustedUrl(`${INDEX_URL}#/settings`)).toBe(true);
    expect(packaged.isTrustedUrl(`${INDEX_URL}?x=1`)).toBe(true);
  });

  it('refuses any other file, scheme, or origin', () => {
    expect(packaged.isTrustedUrl(pathToFileURL('/tmp/evil.html').href)).toBe(false);
    expect(packaged.isTrustedUrl('https://example.com/')).toBe(false);
    expect(packaged.isTrustedUrl('http://localhost:5173/')).toBe(false);
    expect(packaged.isTrustedUrl('about:blank')).toBe(false);
    expect(packaged.isTrustedUrl('not a url')).toBe(false);
  });

  it('trusts only the dev server origin in development', () => {
    const dev = createTrustedRenderer({
      indexHtmlPath: INDEX,
      devServerUrl: 'http://localhost:5173/',
    });
    expect(dev.isTrustedUrl('http://localhost:5173/')).toBe(true);
    expect(dev.isTrustedUrl('http://localhost:5173/src/main.tsx')).toBe(true);
    expect(dev.isTrustedUrl('http://localhost:5174/')).toBe(false);
    expect(dev.isTrustedUrl('http://127.0.0.1:5173/')).toBe(false);
    // The packaged file is not trusted while a dev server is configured.
    expect(dev.isTrustedUrl(INDEX_URL)).toBe(false);
  });

  it('trusts a top-level frame on the app URL and nothing else', () => {
    expect(packaged.isTrustedFrame(frame(INDEX_URL))).toBe(true);
    expect(packaged.isTrustedFrame(frame(INDEX_URL, false))).toBe(false);
    expect(packaged.isTrustedFrame(frame('https://example.com/'))).toBe(false);
    expect(packaged.isTrustedFrame(null)).toBe(false);
    expect(packaged.isTrustedFrame(undefined)).toBe(false);
  });
});

describe('installIpcSenderGuard', () => {
  function fakeIpc() {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const emitter = new EventEmitter();
    const ipc = {
      handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      },
      handleOnce: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, fn);
      },
      on: (channel: string, fn: (...a: unknown[]) => void) => {
        emitter.on(channel, fn);
        return ipc;
      },
      once: (channel: string, fn: (...a: unknown[]) => void) => {
        emitter.once(channel, fn);
        return ipc;
      },
    };
    return { ipc, handlers, emitter };
  }

  const trusted = createTrustedRenderer({ indexHtmlPath: INDEX });

  it('runs handlers for the trusted renderer frame', async () => {
    const { ipc, handlers } = fakeIpc();
    installIpcSenderGuard(ipc, trusted, vi.fn());
    ipc.handle('companies.list', (_e, arg) => `ok:${String(arg)}`);
    await expect(
      handlers.get('companies.list')?.({ senderFrame: frame(INDEX_URL) }, 7),
    ).resolves.toBe('ok:7');
  });

  it('rejects an invoke from an untrusted or missing frame without running the handler', async () => {
    const { ipc, handlers } = fakeIpc();
    const warn = vi.fn();
    installIpcSenderGuard(ipc, trusted, warn);
    const handler = vi.fn();
    ipc.handle('backup.restore', handler);

    await expect(
      handlers.get('backup.restore')?.({ senderFrame: frame('https://evil.test/') }),
    ).rejects.toThrow(/untrusted sender/);
    await expect(handlers.get('backup.restore')?.({ senderFrame: null })).rejects.toThrow(
      /untrusted sender/,
    );
    await expect(
      handlers.get('backup.restore')?.({ senderFrame: frame(INDEX_URL, false) }),
    ).rejects.toThrow(/untrusted sender/);
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backup.restore'));
  });

  it('guards handleOnce, on and once the same way', async () => {
    const { ipc, handlers, emitter } = fakeIpc();
    installIpcSenderGuard(ipc, trusted, vi.fn());
    const once = vi.fn();
    ipc.handleOnce('a.once', once);
    await expect(handlers.get('a.once')?.({ senderFrame: null })).rejects.toThrow();
    expect(once).not.toHaveBeenCalled();

    const listener = vi.fn();
    ipc.on('a.event', listener);
    emitter.emit('a.event', { senderFrame: frame('https://evil.test/') }, 1);
    expect(listener).not.toHaveBeenCalled();
    emitter.emit('a.event', { senderFrame: frame(INDEX_URL) }, 2);
    expect(listener).toHaveBeenCalledTimes(1);

    const onceListener = vi.fn();
    ipc.once('a.onceEvent', onceListener);
    emitter.emit('a.onceEvent', { senderFrame: frame(INDEX_URL) });
    expect(onceListener).toHaveBeenCalledTimes(1);
  });

  it('refuses to install twice, so handlers are never double-wrapped', () => {
    const { ipc } = fakeIpc();
    installIpcSenderGuard(ipc, trusted, vi.fn());
    expect(() => installIpcSenderGuard(ipc, trusted, vi.fn())).toThrow(/already installed/);
  });
});

describe('isSafeExternalUrl', () => {
  it('allows only https and mailto', () => {
    expect(isSafeExternalUrl('https://github.com/Git-Rocky-Stack/Team-X')).toBe(true);
    expect(isSafeExternalUrl('mailto:info@strategia-x.com')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('smb://host/share')).toBe(false);
    expect(isSafeExternalUrl('ms-msdt:/id')).toBe(false);
    expect(isSafeExternalUrl('https://user:pass@example.com/')).toBe(false);
    expect(isSafeExternalUrl('nonsense')).toBe(false);
  });
});

describe('hardenWebContents', () => {
  function fakeContents(type = 'window') {
    const emitter = new EventEmitter();
    let openHandler: ((d: { url: string }) => { action: string }) | null = null;
    return {
      emitter,
      contents: {
        getType: () => type,
        on: (event: string, fn: (...a: unknown[]) => void) => {
          emitter.on(event, fn);
        },
        setWindowOpenHandler: (fn: (d: { url: string }) => { action: string }) => {
          openHandler = fn;
        },
      },
      open: (url: string) => openHandler?.({ url }),
    };
  }

  const trusted = createTrustedRenderer({ indexHtmlPath: INDEX });

  function navEvent() {
    return { preventDefault: vi.fn() };
  }

  it('lets the app reload itself but blocks navigating anywhere else', () => {
    const { contents, emitter } = fakeContents();
    const openExternal = vi.fn();
    hardenWebContents(contents, trusted, openExternal);

    const self = navEvent();
    emitter.emit('will-navigate', self, `${INDEX_URL}#/x`);
    expect(self.preventDefault).not.toHaveBeenCalled();

    const away = navEvent();
    emitter.emit('will-navigate', away, 'https://example.com/');
    expect(away.preventDefault).toHaveBeenCalled();
    // A blocked https link opens in the user's browser instead.
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');

    const file = navEvent();
    emitter.emit('will-navigate', file, 'file:///etc/passwd');
    expect(file.preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it('blocks redirects off the app the same way', () => {
    const { contents, emitter } = fakeContents();
    hardenWebContents(contents, trusted, vi.fn());
    const e = navEvent();
    emitter.emit('will-redirect', e, 'https://example.com/');
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('denies every new window and hands safe links to the browser', () => {
    const { contents, open } = fakeContents();
    const openExternal = vi.fn();
    hardenWebContents(contents, trusted, openExternal);
    expect(open('https://github.com/')).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://github.com/');
    expect(open('javascript:alert(1)')).toEqual({ action: 'deny' });
    expect(open(INDEX_URL)).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it('refuses to attach a <webview>', () => {
    const { contents, emitter } = fakeContents();
    hardenWebContents(contents, trusted, vi.fn());
    const e = navEvent();
    emitter.emit('will-attach-webview', e, {}, {});
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('leaves DevTools alone', () => {
    const { contents, emitter } = fakeContents('remote');
    // getType() is consulted; a devtools host is not the app.
    contents.getType = () => 'devtools';
    hardenWebContents(contents, trusted, vi.fn());
    expect(emitter.listenerCount('will-navigate')).toBe(0);
  });
});

describe('installPermissionPolicy', () => {
  function fakeSession() {
    let request: ((wc: unknown, p: string, cb: (ok: boolean) => void, d: unknown) => void) | null =
      null;
    let check: ((wc: unknown, p: string, origin: string, d: unknown) => boolean) | null = null;
    return {
      session: {
        setPermissionRequestHandler: (fn: typeof request) => {
          request = fn;
        },
        setPermissionCheckHandler: (fn: typeof check) => {
          check = fn;
        },
      },
      request: (p: string, url: string) => {
        let granted: boolean | undefined;
        request?.(
          null,
          p,
          (ok) => {
            granted = ok;
          },
          { requestingUrl: url },
        );
        return granted;
      },
      check: (p: string, url: string) => check?.(null, p, url, { requestingUrl: url }),
    };
  }

  const trusted = createTrustedRenderer({ indexHtmlPath: INDEX });

  it('grants only the copy-button clipboard write, and only to the app', () => {
    expect(ALLOWED_PERMISSIONS).toEqual(['clipboard-sanitized-write']);
    const s = fakeSession();
    installPermissionPolicy(s.session, trusted);
    expect(s.request('clipboard-sanitized-write', INDEX_URL)).toBe(true);
    expect(s.check('clipboard-sanitized-write', INDEX_URL)).toBe(true);
    expect(s.request('clipboard-sanitized-write', 'https://evil.test/')).toBe(false);
  });

  it('denies camera, microphone, geolocation, notifications and the rest', () => {
    const s = fakeSession();
    installPermissionPolicy(s.session, trusted);
    for (const p of ['media', 'geolocation', 'notifications', 'openExternal', 'hid', 'usb']) {
      expect(s.request(p, INDEX_URL), p).toBe(false);
      expect(s.check(p, INDEX_URL), p).toBe(false);
    }
  });
});
