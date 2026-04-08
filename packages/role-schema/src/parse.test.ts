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

  it('produces a stable sha256 for identical input', () => {
    const a = parseRoleMarkdown(SAMPLE, '/x/a.md');
    const b = parseRoleMarkdown(SAMPLE, '/x/b.md');
    expect(a.sha256).toBe(b.sha256);
  });
});
