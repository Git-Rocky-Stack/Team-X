# Release Signing and Verification

Team-X releases are built by `.github/workflows/release.yml`. This page covers the credentials the workflow needs to sign installers, what it verifies before a release can publish, and how to dry-run the whole pipeline before you push a tag.

It answers finding P0-4 of the [2026-10-07 engineering audit](../CODEBASE_AUDIT_2026-10-07.md): installers were unsigned, and macOS signing was switched off in config.

## What a release run does

For each platform (Windows, macOS, Linux):

1. Lint, typecheck and test.
2. **Configure code signing.** Exports only the credentials that exist. An empty secret is never passed to electron-builder.
3. Build and package.
4. **Verify packaged renderer CSP.** The renderer inside the installer must carry the strict production policy.
5. **Verify code signatures.**
   - **Windows:** every installer and app executable must have a `Valid` Authenticode signature.
   - **macOS:** every `Team-X.app` must pass `codesign --verify --deep --strict`, carry a stapled notarization ticket, and be accepted by Gatekeeper (`spctl`).
6. **Install, launch, uninstall.**
   - **Windows:** runs the real x64 NSIS installer silently, launches the installed app and requires it to stay up for 25 seconds. It also checks the installed executable and uninstaller signatures, then uninstalls and confirms the files are gone.
   - **macOS:** mounts the DMG, copies the app out, launches it, then removes it.
   - **Linux:** boots the AppImage on a host with FUSE 2 removed.

Then, once for the release:

7. A consolidated `SHA256SUMS.txt`.
8. **Build provenance.** A Sigstore-backed attestation for every installer. Anyone can verify it with `gh attestation verify <file> --repo Git-Rocky-Stack/Team-X`.
9. An **SPDX SBOM** (`Team-X-<tag>-sbom.spdx.json`) attached to the release.
10. A **draft** GitHub Release. A maintainer publishes it by hand.

## Credentials

Add credentials under **Settings → Secrets and variables → Actions**. The workflow detects which ones are present.

### macOS: Developer ID and notarization (all five required)

| Secret | Value |
| --- | --- |
| `CSC_LINK` | Base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | The `.p12` export password |
| `APPLE_ID` | Apple ID email of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | The 10-character team ID |

If the certificate is present but any of the notarization secrets are missing, the run fails rather than shipping a signed but un-notarized app. Gatekeeper rejects un-notarized apps, so they cannot auto-update either. Enrolment steps are in [the macOS code-signing plan](../handoffs/2026-05-10-mac-codesigning-plan.md).

### Windows: pick one

**Azure Trusted Signing** is recommended. Since 2023, new OV and EV certificates are issued on hardware tokens and cannot be exported as a `.pfx`, which makes Trusted Signing the practical choice for CI.

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `AZURE_TENANT_ID` | Entra tenant of the signing app registration |
| Secret | `AZURE_CLIENT_ID` | App registration (client) ID |
| Secret | `AZURE_CLIENT_SECRET` | Client secret |
| Variable | `AZURE_SIGNING_ENDPOINT` | e.g. `https://eus.codesigning.azure.net/` |
| Variable | `AZURE_SIGNING_ACCOUNT` | Trusted Signing account name |
| Variable | `AZURE_SIGNING_PROFILE` | Certificate profile name |
| Variable | `AZURE_SIGNING_PUBLISHER` | Publisher name exactly as on the certificate |

**An exportable `.pfx`** works if you already have one:

| Secret | Value |
| --- | --- |
| `WIN_CSC_LINK` | Base64 of the `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | Its password |

If `AZURE_SIGNING_ENDPOINT` is set, Azure Trusted Signing is used.

### Linux

AppImage and `.deb` have no platform signature. Users verify them with `SHA256SUMS.txt` and the provenance attestation.

## Shipping unsigned on purpose

With no credentials, the signature gate fails the release. To ship unsigned anyway, set the repository variable `TEAMX_ALLOW_UNSIGNED_RELEASE` to `true`.

The run then passes with a warning, and the release notes open with a bold **Unsigned build** notice. The notice names each unsigned platform and explains how to verify the download. Delete the variable once signing is set up.

## Dry run before tagging

Run the workflow from **Actions → Release → Run workflow** on any branch. It does everything except create the release:

- builds every platform
- checks the CSP
- runs the signature gate
- installs, launches and uninstalls on Windows and macOS
- boots the AppImage

Run this before you push a `v*` tag. A tag triggers the same build and then publishes a draft release.
