/**
 * Content-Security-Policy for the renderer (audit 2026-10-07 P0-3).
 *
 * `src/renderer/index.html` carries the development policy: Vite's dev server
 * needs `'unsafe-eval'`, inline module preambles, and a localhost
 * HTTP/WebSocket connection for HMR. Every `electron-vite build` (packaged
 * releases and the E2E suite alike) replaces it with PRODUCTION_CSP through
 * the `production-csp` plugin in electron.vite.config.ts.
 * scripts/check-packaged-csp.mjs then verifies the built file.
 *
 * `style-src` keeps `'unsafe-inline'`: Radix's scroll lock injects a <style>
 * element at runtime, and a hash cannot cover generated content. Scripts get
 * no such allowance. The renderer talks to the main process only over IPC,
 * so `connect-src` is limited to the app itself.
 */

export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CSP_META = /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>/gi;

/** Swap the development CSP for PRODUCTION_CSP. Fails closed if there is not exactly one. */
export function applyProductionCsp(html: string): string {
  const found = html.match(CSP_META) ?? [];
  if (found.length !== 1) {
    throw new Error(
      `renderer index.html must carry exactly one CSP <meta>; found ${found.length}. Refusing to build without a policy.`,
    );
  }
  return html.replace(
    CSP_META,
    `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
  );
}
