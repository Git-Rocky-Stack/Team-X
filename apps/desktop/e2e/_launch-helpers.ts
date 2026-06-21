/**
 * Shared Electron launch helpers for the e2e suite.
 *
 * Not a spec file — the leading underscore + the absence of `.spec.ts`
 * suffix both keep Playwright's test discovery (`testMatch: **\/*.spec.ts`)
 * from trying to execute this module.
 *
 * # `getCiLaunchArgs()`
 *
 * Returns the Chromium command-line switches a test-mode Electron launch
 * needs in the current environment. Two tiers:
 *
 *   - GPU-disable (`--disable-gpu`, `--disable-software-rasterizer`) —
 *     UNCONDITIONAL: every OS, CI or not.
 *   - Linux-CI sandbox/shm (`--no-sandbox`, `--disable-dev-shm-usage`) —
 *     only on GitHub Actions `linux + CI=true`.
 *
 * Call-sites unconditionally spread the result into their
 * `electron.launch({ args })` array.
 *
 * Why the switches go in `args`, not in `app.commandLine.appendSwitch`
 * (or `app.disableHardwareAcceleration()`) inside `main/index.ts`:
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
 *   `appendSwitch` (or `app.disableHardwareAcceleration()`) runs in
 *   user JS, Chromium has already committed to spawning the GPU
 *   process — and on any host without a usable GL device (xvfb on
 *   Linux CI, a headless or GPU-less Windows host, a VM with no GPU),
 *   that spawn fails fatally.
 *
 *   The fix is to put the switches DIRECTLY on the argv passed to
 *   `electron.launch({ args })`. Those args are inherited by Chromium
 *   at process startup, before any JS loads, so the GPU-disable
 *   decision is made at the right time. This timing constraint is
 *   platform-independent, which is why the GPU-disable tier is
 *   unconditional rather than gated to Linux CI — a GPU-less Windows
 *   host crashes the same way xvfb does.
 *
 * # The switches
 *
 *   --disable-gpu  (universal)
 *       Skips the GPU process entirely. Any host whose GPU process
 *       fails to initialize — xvfb, a GPU-less Windows runner/sandbox,
 *       a headless VM — crashes fatally on the spawn otherwise. DOM-
 *       asserting smoke tests never need the GPU, so disabling it
 *       everywhere also makes local and CI runs behave identically.
 *
 *   --disable-software-rasterizer  (universal)
 *       Without this, Chromium falls back to SwiftShader on GPU
 *       failure — but SwiftShader still negotiates a GPU channel that
 *       may not exist. Belt-and-suspenders with --disable-gpu.
 *
 *   --no-sandbox  (Linux CI only)
 *       chrome-sandbox requires setuid root; GitHub Actions runners
 *       run as an unprivileged user and cannot grant setuid. There is
 *       no untrusted content in test mode (NODE_ENV=test), so the
 *       sandbox provides no security value here anyway.
 *
 *   --disable-dev-shm-usage  (Linux CI only)
 *       /dev/shm on GitHub Actions runners is sized too small for
 *       Chromium's shared-memory IPC; this forces fallback to /tmp.
 *
 * # Tiers
 *
 *   GPU-disable: always.
 *   Sandbox/shm: `process.platform === 'linux' && process.env.CI === 'true'`.
 *
 *   GitHub Actions sets `CI=true` automatically; local dev does not.
 *   Production installed builds never have CI=true and never run with
 *   `NODE_ENV=test`, so they are unaffected by either tier.
 */
export function getCiLaunchArgs(): string[] {
  // GPU-disable is unconditional: the bootstrap-timing constraint documented
  // above is platform-independent, so every GPU-less host (xvfb, a headless
  // Windows runner/sandbox, a GPU-less VM) needs these on argv — not just
  // Linux CI.
  const args = ['--disable-gpu', '--disable-software-rasterizer'];

  // Sandbox + /dev/shm constraints are specific to GitHub Actions' Linux
  // runners; macOS/Windows CI and local dev neither need nor want them.
  if (process.platform === 'linux' && process.env.CI === 'true') {
    args.push('--no-sandbox', '--disable-dev-shm-usage');
  }

  return args;
}
