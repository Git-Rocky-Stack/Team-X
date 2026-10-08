/**
 * Release-pipeline pins (audit 2026-10-07 P0-4).
 *
 * The release workflow only runs on a tag, so a regression in it would
 * surface at the worst possible moment. These pins keep the guarantees in
 * place: signing cannot be switched off in config, an unsigned build cannot
 * ship by accident, installers are install-smoked, and every release carries
 * provenance and an SBOM.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
const builder = readFileSync(join(here, '..', 'electron-builder.yml'), 'utf8');

/** The `run:` body of a named step. */
function step(name: string): string {
  const at = workflow.indexOf(`- name: ${name}`);
  expect(at, `step "${name}" is missing`).toBeGreaterThan(-1);
  const next = workflow.indexOf('\n      - name:', at + 1);
  return workflow.slice(at, next === -1 ? undefined : next);
}

describe('electron-builder.yml', () => {
  it('no longer disables macOS signing', () => {
    expect(builder).not.toMatch(/^\s*identity:\s*null/m);
    expect(builder).toMatch(/hardenedRuntime: true/);
  });
});

describe('release.yml — signing', () => {
  it('exports only credentials that exist, so an empty secret cannot break the build', () => {
    const s = step('Configure code signing');
    expect(s).toContain('export_if_set');
    expect(s).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false');
    // Every signing secret flows through this step, not straight into the build.
    for (const secret of ['CSC_LINK', 'WIN_CSC_LINK', 'AZURE_CLIENT_SECRET', 'APPLE_ID']) {
      expect(s).toContain(`secrets.${secret}`);
    }
    expect(step('Build + Package (${{ matrix.platform }})')).not.toContain('secrets.CSC_LINK');
  });

  it('fails an unsigned Windows or macOS build unless the override is set on purpose', () => {
    for (const name of ['Verify code signatures (Windows)', 'Verify code signatures (macOS)']) {
      const s = step(name);
      expect(s).toContain('vars.TEAMX_ALLOW_UNSIGNED_RELEASE');
      expect(s).toMatch(/throw "Windows artifacts are unsigned|macOS artifacts are unsigned/);
      // A configured-but-broken signature never falls through to the override.
      expect(s).toMatch(/Signing was configured/);
    }
    expect(step('Verify code signatures (Windows)')).toContain('Get-AuthenticodeSignature');
    const mac = step('Verify code signatures (macOS)');
    expect(mac).toContain('codesign --verify --deep --strict');
    expect(mac).toContain('spctl --assess');
    expect(mac).toContain('stapler validate');
  });

  it('tells release readers when a platform shipped unsigned', () => {
    expect(step('Pick release notes')).toContain('Unsigned build.');
  });
});

describe('release.yml — install smoke', () => {
  it('installs, launches and uninstalls the real Windows and macOS installers', () => {
    const win = step('Install, launch, uninstall (Windows)');
    expect(win).toContain("-ArgumentList '/S'");
    expect(win).toContain('Uninstall');
    expect(win).toContain('HasExited');
    const mac = step('Install, launch, uninstall (macOS)');
    expect(mac).toContain('hdiutil attach');
    expect(mac).toContain('kill -0');
  });

  it('still boots the AppImage with FUSE 2 absent', () => {
    expect(step('Smoke-test AppImage (Linux)')).toContain('libfuse\\.so\\.2');
  });

  it('checks the packaged renderer CSP', () => {
    expect(step('Verify packaged renderer CSP')).toContain('check-packaged-csp.mjs');
  });
});

describe('release.yml — provenance', () => {
  it('attests every installer and attaches an SBOM', () => {
    expect(step('Attest build provenance')).toContain('actions/attest-build-provenance@');
    expect(step('Generate SBOM (SPDX)')).toContain('spdx-json');
    expect(workflow).toContain('artifacts/Team-X-*-sbom.spdx.json');
    expect(workflow).toMatch(/id-token: write/);
    expect(workflow).toMatch(/attestations: write/);
  });

  it('publishes only from a version tag, so a dispatch is a dry run', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("if: startsWith(github.ref, 'refs/tags/v')");
  });
});
