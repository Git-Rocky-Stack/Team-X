# Team-X Desktop App - Build Guide

## 🚧 Build Status: Node Version Compatibility Issue

**Current Issue**: The build requires **Node.js >= 22.12.0**, but your system has **Node.js v20.20.2**.

## Quick Fix Options

### Option 1: Upgrade Node.js (Recommended) ✅

**Step 1**: Download and install Node.js 22.x or later
- Download from: https://nodejs.org/
- Or use nvm (Node Version Manager): `nvm install 22`

**Step 2**: Verify the upgrade
```bash
node --version  # Should show v22.x.x or higher
```

**Step 3**: Rebuild dependencies
```bash
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"
pnpm install
```

**Step 4**: Build the installer
```bash
pnpm run dist:win
```

### Option 2: Use nvm (Node Version Manager)

**If you have nvm installed:**
```bash
# Install Node 22
nvm install 22

# Use Node 22
nvm use 22

# Verify
node --version

# Then build
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"
pnpm install
pnpm run dist:win
```

## Build Commands

Once Node.js version is compatible, use these commands:

### Windows Installer (Recommended for Rocky)
```bash
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"
pnpm run dist:win
```

**Output**: 
- `dist/Team-X Setup 2.0.1.exe` (Windows installer)
- One-click installer for your users

### macOS Installer
```bash
pnpm run dist:mac
```

**Output**:
- `dist/Team-X-2.0.1.dmg` (macOS disk image)
- `dist/Team-X-2.0.1-arm64.dmg` (Apple Silicon)

### Linux Installer
```bash
pnpm run dist:linux
```

**Output**:
- `.AppImage` and `.deb` packages (x64). No `.rpm` is produced.
- The AppImage runtime requires **FUSE 2** on the host (`libfuse2`, or `libfuse2t64` on Ubuntu 24.04; `fuse-libs` on Fedora). If it won't start, install that package or run it with `--appimage-extract-and-run`. The `.deb` needs no FUSE.

### Development Build (Faster, Not Installer)
```bash
pnpm run dev
```

**Output**: Runs the app in development mode with hot reload

## What Gets Built

The installer includes:
- ✅ **Team-X Desktop App v2.0.1** with all new Skills & MCP features
- ✅ **32 Built-in Capabilities** (20 skills + 12 MCP templates)
- ✅ **Skills Marketplace** with 20 pre-loaded skills
- ✅ **MCP Marketplace** with 12 pre-configured templates
- ✅ **Simplified Permissions** with 3 safety presets
- ✅ **Proactive Execution Foundation** (from earlier work)
- ✅ **Auto-update support** for future versions

## Installation Locations

**Windows**:
- Installs to: `C:\Users\<username>\AppData\Local\Programs\team-x-desktop`
- Desktop shortcut created automatically
- Start Menu entry added

**User Data Location**:
- Windows: `C:\Users\<username>\AppData\Roaming\team-x-desktop`
- macOS: `~/Library/Application Support/team-x-desktop`
- Linux: `~/.config/team-x-desktop`

## Build Troubleshooting

### Common Build Issues

**Issue 1: "Cannot find module 'electron-vite'"**
```bash
# Solution: Install dependencies
pnpm install
```

**Issue 2: "Node version incompatible"**
```bash
# Solution: Upgrade Node.js to 22.x or later
node --version  # Must be >= 22.12.0
```

**Issue 3: "Electron rebuild failed"**
```bash
# Solution: Clean install
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

**Issue 4: Build succeeds but app won't start**
```bash
# Check logs in:
# Windows: %APPDATA%\team-x-desktop\logs
# Or run with: npm run dev
```

## Build Configuration

The build process uses:
- **electron-vite**: Builds and bundles the Electron app
- **electron-builder**: Creates platform-specific installers
- **electron-rebuild**: Rebuilds native modules (better-sqlite3, keytar)

## Version Information

- **App Version**: 2.0.1
- **Electron Version**: (defined in package.json)
- **Node.js Requirement**: >= 22.12.0
- **Platform**: Windows 11 (Primary), macOS, Linux (Phase 4)

## Post-Build Verification

After building, verify the installer:

1. **File Size**: Installer should be 150-250 MB
2. **Installation**: Test install on clean Windows machine
3. **New Features**: Verify Skills Marketplace, MCP Marketplace, and Simplified Permissions are visible
4. **Capabilities**: Test that built-in skills and MCPs are available
5. **Permissions**: Verify Standard permission mode is selected by default

## Publishing

To publish installers (not included in `--publish never`):
```bash
# For GitHub Releases or distribution
pnpm run dist:publish
```

## Support

For build issues:
1. Check Node.js version: `node --version`
2. Check pnpm version: `pnpm --version`
3. Check available disk space: `dir`
4. Review build logs in terminal output

## Summary

**Current Blocker**: Node.js v20.20.2 < Required v22.12.0

**Solution**: Upgrade Node.js to 22.x or later, then run build commands.

**Expected Result**: Team-X Desktop v2.0.1 installer with all new Skills & MCP features ready for distribution.

---

*Once Node.js is upgraded, the build process should complete successfully and you'll have a working installer to deploy!*