import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script with implicit module resolution; vitest resolves at runtime.
import { checkPackagedCsp } from '../../../scripts/check-packaged-csp.mjs';
import { PRODUCTION_CSP, applyProductionCsp } from '../renderer-csp.js';

const here = dirname(fileURLToPath(import.meta.url));
const devHtml = readFileSync(join(here, 'renderer', 'index.html'), 'utf8');
const configSrc = readFileSync(join(here, '..', 'electron.vite.config.ts'), 'utf8');

function directive(csp: string, name: string): string {
  return (
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? ''
  );
}

describe('PRODUCTION_CSP', () => {
  it('never allows eval, inline script, or a network origin', () => {
    expect(PRODUCTION_CSP).not.toContain('unsafe-eval');
    expect(directive(PRODUCTION_CSP, 'script-src')).toBe("script-src 'self'");
    expect(directive(PRODUCTION_CSP, 'connect-src')).toBe("connect-src 'self'");
    expect(PRODUCTION_CSP).not.toMatch(/localhost|127\.0\.0\.1|ws:|http:/);
  });

  it('closes the plugin, base-tag, form and framing vectors', () => {
    for (const d of [
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(PRODUCTION_CSP).toContain(d);
    }
  });
});

describe('applyProductionCsp', () => {
  it('replaces the development policy in the real index.html', () => {
    expect(devHtml).toContain('unsafe-eval');
    const out = applyProductionCsp(devHtml);
    expect(out).toContain(PRODUCTION_CSP);
    expect(out).not.toContain('unsafe-eval');
    expect(out).not.toContain('localhost');
  });

  it('fails closed when the policy tag is missing or duplicated', () => {
    expect(() => applyProductionCsp('<html><head></head></html>')).toThrow(/exactly one CSP/);
    const twice = devHtml.replace(
      '<title>',
      `${devHtml.match(/<meta\s+http-equiv[^>]*>/)?.[0]}<title>`,
    );
    expect(() => applyProductionCsp(twice)).toThrow(/found 2/);
  });

  it('is wired into every renderer build', () => {
    expect(configSrc).toContain("name: 'production-csp'");
    expect(configSrc).toContain("apply: 'build'");
    expect(configSrc).toContain('applyProductionCsp');
  });

  it('no longer promises an afterPack hook that does not exist', () => {
    expect(devHtml).not.toContain('afterPack');
  });
});

describe('checkPackagedCsp (the built-artifact gate)', () => {
  const built = applyProductionCsp(devHtml).replace(
    '<script type="module" src="/src/main.tsx"></script>',
    '<script type="module" crossorigin src="./assets/index-abc.js"></script>',
  );

  it('accepts a built page carrying the production policy', () => {
    expect(checkPackagedCsp(built)).toEqual([]);
  });

  it('rejects the development policy', () => {
    expect(checkPackagedCsp(devHtml).join('\n')).toMatch(/unsafe-eval/);
  });

  it('rejects an inline script even when the policy is strict', () => {
    const inline = built.replace('</body>', '<script>alert(1)</script></body>');
    expect(checkPackagedCsp(inline).join('\n')).toMatch(/inline <script>/);
  });

  it('rejects a page with no policy at all', () => {
    expect(checkPackagedCsp('<html><head></head><body></body></html>').join('\n')).toMatch(
      /exactly one/,
    );
  });
});
