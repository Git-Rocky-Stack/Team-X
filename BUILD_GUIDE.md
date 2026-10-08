# Team-X — Build Guide

How to build the Team-X desktop app from source and produce platform installers.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 22.13.0+ | Repo pins **22.22.2** via `.nvmrc` (`nvm use` / `fnm use`) |
| **pnpm** | 9.0.0+ | Repo pins 9.15.9 via `packageManager` (use `corepack enable`) |
| **Git** | any recent | |
| **OS** | Windows 11, macOS 13+, or Ubuntu 22.04+ | Native module compilation (better-sqlite3, keytar) |

```bash
node --version   # must be >= 22.13.0
pnpm --version   # must be >= 9
```

## Setup

```bash
git clone https://github.com/Git-Rocky-Stack/Team-X.git
cd Team-X
pnpm install     # runs electron-rebuild for native modules + fetches llama.cpp binaries (soft)
```

## Development build (hot reload, no installer)

```bash
pnpm dev
```

## Production installers

```bash
pnpm dist          # current platform
pnpm dist:win      # Windows NSIS installer (x64 + arm64)
pnpm dist:mac      # macOS DMG (x64 Intel + arm64 Apple Silicon)
pnpm dist:linux    # Linux AppImage + .deb (x64)
```

Output lands in `release/<version>/` as `Team-X-<version>-Setup-x64.exe` /
`-Setup-arm64.exe`, `Team-X-<version>-x64.dmg` / `-arm64.dmg`, and
`Team-X-<version>-x86_64.AppImage` / `Team-X-<version>-amd64.deb`.

> **Linux AppImage note:** the AppImage embeds AppImage's static type2-runtime
> (`toolsets.appimage: "1.0.2"` in `apps/desktop/electron-builder.yml`), so it
> needs no FUSE 2 library on the host; it mounts through the `fusermount3` that
> stock Ubuntu / Fedora desktops ship (#16). `--appimage-extract-and-run` still
> works as a fallback where FUSE is unavailable (some containers). The `.deb`
> needs no FUSE and resolves its own dependencies. No `.rpm` is produced.

## Verification before distributing

```bash
pnpm typecheck                      # all workspaces
pnpm lint                           # Biome + ESLint
pnpm test                           # full unit suite
pnpm -F @team-x/desktop test:e2e    # builds, then runs the Playwright E2E suite
```

## Installation locations

**Windows**
- Installs to `C:\Users\<username>\AppData\Local\Programs\team-x-desktop`
- Desktop shortcut and Start Menu entry created automatically

**User data**
- Windows: `C:\Users\<username>\AppData\Roaming\team-x-desktop`
- macOS: `~/Library/Application Support/team-x-desktop`
- Linux: `~/.config/team-x-desktop`

## Build pipeline

- **electron-vite** — builds and bundles main / preload / renderer
- **electron-builder** — creates platform-specific installers
- **electron-rebuild** — rebuilds native modules (better-sqlite3, keytar) on install
- **`scripts/fetch-llama-binaries.mjs`** — fetches SHA-verified llama.cpp binaries
  (pinned release in root `package.json` → `llamaCppRelease`); soft-fails during
  `pnpm install`, fetches all targets during `prepack`

## Troubleshooting

**"Cannot find module 'electron-vite'"** — run `pnpm install`.

**"Node version incompatible"** — upgrade to Node 22.13+ (`nvm install 22` /
`fnm install 22`), then reinstall dependencies.

**Electron rebuild failed** — clean install:
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Build succeeds but the app won't start** — check logs under the user-data
`logs/` directory for your platform (see Installation locations), or run
`pnpm dev` for live output.

**Typecheck fails on a fresh clone** — some workspace packages need their
`dist/` built first; `pnpm install` + `pnpm build` resolves the reference chain.

## Releases

Official releases ship from CI: pushing a `v*` tag runs `release.yml`, which
builds all platform installers, generates `SHA256SUMS.txt` and electron-updater
manifests, and publishes a draft GitHub Release. Local publishing
(`pnpm dist:publish`) exists but the CI path is canonical.

---

*Last updated: 2026-07-03*
