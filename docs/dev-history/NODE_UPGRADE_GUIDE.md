# Node.js Upgrade Guide for Team-X Build

## Current Status
- **Current Version**: Node.js v20.20.2 LTS
- **Required Version**: Node.js >= 22.12.0
- **Installation Path**: `C:\Users\User\AppData\Local\Programs\nodejs-lts-v20.20.2\`

## Solution Options

### Option 1: Automatic Download & Install (Recommended) ⚡

I'll download Node.js 22.x LTS and guide you through the installation:

**Step 1: Download Node.js 22.x LTS**
- Download URL: https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi
- File size: ~34 MB
- This is the official LTS (Long Term Support) version

**Step 2: Run the Installer**
1. Double-click `node-v22.12.0-x64.msi` once downloaded
2. Choose "Add to PATH" (recommended)
3. Click "Install" 
4. The installer will automatically upgrade your current Node.js

**Step 3: Verify Installation**
```bash
# Restart your terminal and check:
node --version
# Should show: v22.12.0 or higher
```

**Step 4: Build Team-X**
```bash
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"
pnpm install
pnpm run dist:win
```

### Option 2: Using Chocolatey (If Installed)

If you have Chocolatey package manager:
```bash
# Install Node.js 22 LTS
choco upgrade nodejs-lts

# Verify
node --version

# Then build
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"
pnpm install
pnpm run dist:win
```

### Option 3: Using nvm-windows (For Developers)

If you prefer nvm for Node version management:

**Install nvm-windows:**
```bash
# Download nvm-setup.exe from:
# https://github.com/coreybutler/nvm-windows/releases
# Run the installer
```

**Then install Node 22:**
```bash
# Restart terminal, then:
nvm install 22.12.0
nvm use 22.12.0

# Verify
node --version

# Build Team-X
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"
pnpm install
pnpm run dist:win
```

### Option 4: Manual Download (If Above Options Fail)

**Direct Download Links:**
- Node.js 22.x LTS: https://nodejs.org/en/download
- Windows 64-bit: https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi

**Installation Steps:**
1. Download the MSI installer
2. Run the installer
3. Select "Upgrade existing Node.js" when prompted
4. Complete installation
5. Restart terminal
6. Verify with `node --version`

## Post-Upgrade Verification

After upgrading Node.js, verify everything works:

```bash
# 1. Check Node version
node --version
# Expected: v22.12.0 or higher

# 2. Check npm version
npm --version

# 3. Navigate to Team-X
cd "C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X"

# 4. Rebuild dependencies
pnpm install

# 5. Build installer
pnpm run dist:win

# 6. Verify output
ls dist/
# Should see: "Team-X Setup 2.0.1.exe" or similar
```

## What You Get After Upgrade

**Team-X Desktop Installer** with all new features:
- ✅ **32 Built-in Capabilities** (20 skills + 12 MCPs)
- ✅ **Skills Marketplace** with card-based UI
- ✅ **MCP Marketplace** with 12 templates
- ✅ **Simplified Permissions** with 3 safety presets
- ✅ **Proactive Execution** (agents wake up automatically)
- ✅ **One-click Windows installer** for distribution

**Installer File**: `apps/desktop/dist/Team-X Setup 2.0.1.exe`

## Troubleshooting

**Issue: "pnpm not found"**
- Solution: Make sure you're using the terminal after Node.js upgrade
- Restart your terminal/command prompt

**Issue: "Build fails with permission errors"**
- Solution: Run as Administrator: Right-click Command Prompt → "Run as administrator"

**Issue: "electron-rebuild fails"**
- Solution: This is normal on first build with new Node version, just be patient

**Issue: "Installer runs but app won't start"**
- Solution: Check Windows Defender or antivirus isn't blocking the app

## Current Recommendation

**Use Option 1** - Download and install Node.js 22.x LTS MSI:
- Fastest and most reliable
- Official installation method
- Automatically handles upgrade
- Stable and well-tested

Let me know when you've upgraded Node.js and I'll complete the build for you! 🚀