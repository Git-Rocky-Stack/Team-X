import { describe, expect, it } from 'vitest';
import { parseRoleMarkdown } from './parse.js';

const SAMPLE = `---
id: chief-executive-officer
name: Chief Executive Officer
level: officer
reports_to: [board]
manages: [coo, cto]
preferred_model_tier: high
preferred_providers: [anthropic, ollama]
fallback_providers: [groq]
preferred_context_window: 200000
tools_allowed: [browse, context7]
tools_denied: [shell]
decision_authority: final
escalates_to: []
kpis: [revenue, team_health]
output_format: exec_brief
temperature: 0.4
license: MIT
author: Strategia-X
version: 1.0.0
---

# Identity
You are the CEO of {{company.name}}.
`;

describe('parseRoleMarkdown', () => {
  it('parses frontmatter and body from a valid role.md', () => {
    const spec = parseRoleMarkdown(SAMPLE, '/fake/ceo.md');
    expect(spec.frontmatter.id).toBe('chief-executive-officer');
    expect(spec.frontmatter.level).toBe('officer');
    expect(spec.frontmatter.preferred_providers).toEqual(['anthropic', 'ollama']);
    expect(spec.body).toContain('# Identity');
    expect(spec.body).toContain('{{company.name}}');
    expect(spec.sourcePath).toBe('/fake/ceo.md');
    expect(spec.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws on missing required frontmatter field', () => {
    const bad = SAMPLE.replace('level: officer\n', '');
    expect(() => parseRoleMarkdown(bad, '/fake/bad.md')).toThrow(/level/i);
  });

  it('throws on invalid level value', () => {
    const bad = SAMPLE.replace('level: officer', 'level: janitor');
    expect(() => parseRoleMarkdown(bad, '/fake/bad.md')).toThrow(/level/i);
  });

  it('hashes raw source only — sourcePath does not affect the hash, content does', () => {
    // Same content, different paths → same hash (sourcePath excluded from hash input)
    const a = parseRoleMarkdown(SAMPLE, '/x/a.md');
    const b = parseRoleMarkdown(SAMPLE, '/y/b.md');
    expect(a.sha256).toBe(b.sha256);

    // Different content (extra trailing whitespace), same path → different hash
    const c = parseRoleMarkdown(`${SAMPLE}  `, '/x/a.md');
    expect(c.sha256).not.toBe(a.sha256);
  });

  it('throws when temperature is out of [0, 2] range', () => {
    const tooHigh = SAMPLE.replace('temperature: 0.4', 'temperature: 2.5');
    expect(() => parseRoleMarkdown(tooHigh, '/fake/hot.md')).toThrow(/temperature/i);

    const negative = SAMPLE.replace('temperature: 0.4', 'temperature: -0.1');
    expect(() => parseRoleMarkdown(negative, '/fake/cold.md')).toThrow(/temperature/i);
  });

  it('parses cleanly when optional fields are absent', () => {
    // Remove output_format (optional). cadences is already absent in SAMPLE.
    const minimal = SAMPLE.replace('output_format: exec_brief\n', '');
    const spec = parseRoleMarkdown(minimal, '/fake/min.md');
    expect(spec.frontmatter.output_format).toBeUndefined();
    expect(spec.frontmatter.cadences).toBeUndefined();
    // Required fields still resolve
    expect(spec.frontmatter.id).toBe('chief-executive-officer');
    expect(spec.frontmatter.temperature).toBe(0.4);
  });

  // --- Frontmatter splitter edge cases (added when gray-matter was
  // retired in favor of a hand-rolled splitter + the `yaml` package). These
  // exercise the splitter contract directly, independently of the zod
  // schema validation.

  it('throws the zod schema error (not the splitter error) when frontmatter is entirely absent', () => {
    // A file with no `---` delimiters at all should flow through the splitter
    // with data={} and then fail the zod validation with a meaningful
    // per-field error message — NOT an "unterminated frontmatter" message,
    // because there was no opening delimiter to mismatch in the first place.
    const bodyOnly = '# Just a markdown body with no frontmatter\n';
    expect(() => parseRoleMarkdown(bodyOnly, '/fake/bare.md')).toThrow(/Invalid role frontmatter/);
  });

  it('throws a descriptive error when the opening `---` is unterminated', () => {
    // Opening delimiter present but no closing one — this is a corrupted
    // file we want to surface loudly, not silently reinterpret as "no
    // frontmatter" and let zod produce a confusing downstream error.
    const broken =
      '---\nid: orphan\nname: Orphan\n# Body begins here without a closing delimiter\n';
    expect(() => parseRoleMarkdown(broken, '/fake/broken.md')).toThrow(
      /Unterminated YAML frontmatter/,
    );
  });

  it('parses role.md files with CRLF line endings (Windows checkout scenario)', () => {
    // Git on Windows may materialize role.md files with \r\n endings
    // depending on core.autocrlf settings. The splitter regexes use
    // \r?\n so both line-ending styles parse identically.
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    const spec = parseRoleMarkdown(crlf, '/fake/win.md');
    expect(spec.frontmatter.id).toBe('chief-executive-officer');
    expect(spec.frontmatter.level).toBe('officer');
    expect(spec.body).toContain('# Identity');
  });
});
