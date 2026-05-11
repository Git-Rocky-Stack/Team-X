/**
 * Shared Electron launch helpers for the e2e suite.
 *
 * Not a spec file — the leading underscore + the absence of `.spec.ts`
 * suffix both keep Playwright's test discovery (`testMatch: **\/*.spec.ts`)
 * from trying to execute this module.
 *
 * # `getCiLaunchArgs()`
 *
 * Returns the Chromium command-line switches required for Electron to
 * boot under xvfb on GitHub Actions ubuntu-latest. Empty array on any
 * other environment (local dev on any OS, macOS CI, Windows CI), so
 * call-sites can unconditionally spread the result into their
 * `electron.launch({ args })` array and let the runtime decide whether
 * the switches actually apply.
 *
 * Why this helper exists — and why the switches go in `args`, not in
 * `app.commandLine.appendSwitch` inside `main/index.ts`:
 *
 *   On a previous attempt (`fix(main): headless CI Linux launch
 *   hardening`, reverted), the switches were set via
 *   `app.commandLine.appendSwitch` at module top-level of
 *   `main/index.ts`, before `app.whenReady()`. That should have been
 *   the canonical, documented timing. It was not enough. The CI log
 *   showed the GPU process was being spawned and crashing on init
 *   BEFORE the main script even got a chance to run its console.log:
 *
 *     [main!] ERROR:viz_main_impl.cc(166)] Exiting GPU process due
 *       to errors during initialization
 *
 *   Chromium parses its command-line argv during process bootstrap,
 *   well before the JavaScript main script is loaded. The GPU process
 *   spawn decision is made at that bootstrap phase. By the time
 *   `appendSwitch` runs in user JS, Chromium has already committed to
 *   spawning the GPU process — and on xvfb (no real GL device), that
 *   spawn fails fatally.
 *
 *   The fix is to put the switches DIRECTLY on the argv passed to
 *   `electron.launch({ args })`. Those args are inherited by Chromium
 *   at process startup, before any JS loads, so the GPU-disable
 *   decision is made at the right time.
 *
 * # The four switches
 *
 *   --no-sandbox
 *       chrome-sandbox requires setuid root; GitHub Actions runners
 *       run as an unprivileged user and cannot grant setuid. There is
 *       no untrusted content in test mode (NODE_ENV=test), so the
 *       sandbox is providing no security value here anyway.
 *
 *   --disable-gpu
 *       Skips the GPU process entirely. xvfb has no real graphics
 *       device, so GPU init fails fatally.
 *
 *   --disable-software-rasterizer
 *       Without this, Chromium falls back to SwiftShader on GPU
 *       failure — but SwiftShader still negotiates a GPU channel
 *       that doesn't exist under xvfb. Belt-and-suspenders with
 *       --disable-gpu.
 *
 *   --disable-dev-shm-usage
 *       /dev/shm on GitHub Actions runners is sized too small for
 *       Chromium's shared-memory IPC; this forces fallback to /tmp.
 *
 * # Gate
 *
 *   `process.platform === 'linux' && process.env.CI === 'true'`
 *
 *   GitHub Actions sets `CI=true` automatically; local dev environments
 *   do not. macOS + Windows CI legs do not need these switches (they
 *   have real GPU drivers or virtual ones that work). Production
 *   installed builds never have CI=true. So the only environment
 *   getting these switches is the one that actually needs them.
 */
export function getCiLaunchArgs(): string[] {
  const isLinuxCi = process.platform === 'linux' && process.env.CI === 'true';
  return isLinuxCi
    ? [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dev-shm-usage',
      ]
    : [];
}
