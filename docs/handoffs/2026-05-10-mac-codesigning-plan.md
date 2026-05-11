# Mac Code-Signing & Notarization Plan — Phase 4 Launch Readiness

**Date:** 2026-05-10
**Owner:** Rocky Elsalaymeh
**Status:** Pre-launch — requires Apple Developer Program enrollment
**Blocks:** First Mac dmg release where users should NOT see Gatekeeper warnings

---

## Why this matters

Without code-signing and notarization, every Mac user who downloads `Team-X-3.x.x-arm64.dmg` or `Team-X-3.x.x-x64.dmg` will see one of two security dialogs on first launch:

> **"Team-X.app" cannot be opened because the developer cannot be verified.**
> macOS cannot verify that this app is free from malware.

…or, on macOS Sonoma / Sequoia with stricter Gatekeeper defaults:

> **"Team-X.app" is damaged and can't be opened. You should move it to the Trash.**

(The "damaged" message is misleading — the app is fine; macOS is just refusing to run an unsigned binary downloaded from the internet.)

Workarounds users can do today:
- **Option A**: Right-click the app → Open → confirm in the dialog. Works once per install.
- **Option B**: `xattr -d com.apple.quarantine /Applications/Team-X.app` from Terminal. Removes the quarantine bit.

Neither is acceptable for a public launch — most users will assume the app is malware and never install it. Signing + notarization makes the warnings disappear entirely.

---

## What's already in place

| Item | State |
|---|---|
| `electron-builder.yml` `mac` block | ✅ dmg, x64 + arm64, hardened runtime enabled |
| `build/entitlements.mac.plist` | ✅ allow-jit, allow-unsigned-executable-memory, network.client, files.user-selected.read-write |
| `release.yml` matrix | ✅ runs `macos-latest`, runs `pnpm -F @team-x/desktop dist:mac` |
| `hardenedRuntime: true` | ✅ required for notarization |
| `gatekeeperAssess: false` | ✅ correct (skips Gatekeeper at build, not at user-install) |

**What's missing:** the signing identity (cert + private key) and the notarization credentials (Apple ID, app-specific password, team ID).

---

## The plan — 4 phases

### Phase 1 — Apple Developer Program enrollment (1–2 days)

- **Sign up:** https://developer.apple.com/programs/enroll/
- **Cost:** $99 USD/year
- **Required:** Apple ID, valid government ID, payment method
- **What you get:** ability to issue Developer ID Application certs (for signing dmg/apps distributed outside the App Store), access to notarization service, App-Specific Passwords for CI

Use the **Individual** account type unless you plan to use a company name on the cert subject — Individual costs the same and is faster to approve.

### Phase 2 — Create the Developer ID Application certificate

In **Apple Developer portal** → Certificates, Identifiers & Profiles → Certificates → `+`:

1. Select **Developer ID Application** (NOT "Mac App Distribution" — that's for Mac App Store only).
2. Generate a Certificate Signing Request (CSR) from **Keychain Access** on your Mac:
   - Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority…
   - Save as `.certSigningRequest`.
3. Upload the CSR, download the resulting `.cer` file.
4. Double-click the `.cer` to install it into your login keychain.
5. In Keychain Access, find the cert, right-click → **Export…** → save as `Team-X-Developer-ID.p12` with a strong password.

That `.p12` file + password is what electron-builder needs.

### Phase 3 — Configure GitHub Secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**. Add **five** secrets:

| Secret | What goes in it | How to get it |
|---|---|---|
| `CSC_LINK` | Base64-encoded contents of `Team-X-Developer-ID.p12` | `base64 -i Team-X-Developer-ID.p12 \| pbcopy` on Mac, paste into the GitHub secret value field |
| `CSC_KEY_PASSWORD` | The .p12 export password from Phase 2 step 5 | You set it |
| `APPLE_ID` | Apple ID email for the developer account | The email you used to enroll |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (NOT your Apple ID password) | https://appleid.apple.com → Sign-In and Security → App-Specific Passwords → Generate Password. Label it "team-x-notarization" |
| `APPLE_TEAM_ID` | Your 10-character team ID (e.g. `ABC1D2E3F4`) | Apple Developer portal → top-right account dropdown shows it, OR `xcrun altool --list-providers -u <apple-id> -p <app-specific-password>` |

### Phase 4 — Update `release.yml` to inject the secrets

Edit `.github/workflows/release.yml`, find the `Build + Package (mac)` step, and add `env:`:

```yaml
- name: Build + Package (${{ matrix.platform }})
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    # Mac signing + notarization (only effective on macos-latest legs).
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: pnpm -F @team-x/desktop dist:${{ matrix.platform }}
```

electron-builder auto-detects these env vars and:
1. Decodes `CSC_LINK` into a temp keychain.
2. Signs the `.app` bundle and the `.dmg` with your Developer ID cert.
3. Uploads the signed `.dmg` to Apple's notarization service.
4. Polls for the result (~1–5 minutes typical).
5. Staples the notarization ticket into the `.dmg` so Gatekeeper can verify offline.

No further code changes required on our side — `electron-builder.yml` already has `hardenedRuntime: true` and entitlements wired up.

---

## Verification checklist (after first signed release)

1. Download the `Team-X-3.x.x-arm64.dmg` artifact from the GitHub release.
2. On a clean Mac: drag the app to `/Applications`, double-click.
3. **Expected**: app opens with no dialog at all, or a single "first launch" confirmation.
4. **Failure modes**:
   - "developer cannot be verified" → signing failed silently (check action logs for `signing failed` or `notarytool` errors).
   - "damaged and can't be opened" → notarization stapled but Gatekeeper rejected — usually a missing entitlement; check `entitlements.mac.plist`.
   - `spctl -a -vvv -t install /Applications/Team-X.app` should print `source=Notarized Developer ID` — that's the success signal.

---

## Total time estimate

- **Phase 1 (enrollment)**: 1 form, $99, then 24–48 hours waiting for Apple to verify your identity. The bottleneck.
- **Phase 2 (cert)**: 15 minutes.
- **Phase 3 (secrets)**: 15 minutes once you have the cert + app-specific password.
- **Phase 4 (workflow edit)**: 5 minutes + push.

Net: enrollment-pending blocks ~24-48 hours, then 35 minutes of actual work.

---

## Annual renewal

- **Developer Program**: $99/year, auto-renews unless cancelled.
- **Developer ID Application cert**: valid for 5 years from issuance.
- **App-Specific Password**: doesn't expire automatically but rotate if you suspect it's leaked.

Set a calendar reminder 60 days before each annual renewal — Apple's UI for renewal is opaque and a lapsed cert breaks all existing installations' update flow.

---

## Out-of-scope for this plan

- **Windows Authenticode signing**: separate process, separate cert (DigiCert / Sectigo, typically $200–500/year). Users currently see SmartScreen warnings on the NSIS installer. Tackle separately if/when Windows downloads become significant.
- **Linux signing**: not a thing for AppImage / .deb in the desktop world. Linux users are accustomed to verifying SHA256 sums (which we already publish via `release.yml`'s `SHA256SUMS.txt` step).
- **Mac App Store distribution**: requires a different cert (Mac App Distribution), in-app-purchase plumbing if monetized, and Apple's review queue. Out of scope for Phase 4 — we're shipping a direct-download dmg.
