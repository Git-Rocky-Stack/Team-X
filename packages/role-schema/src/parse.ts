import { createHash } from 'node:crypto';
import type { RoleSpec } from '@team-x/shared-types';
import matter from 'gray-matter';
import { z } from 'zod';

const cadenceSchema = z.object({
  type: z.string(),
  every: z.string(),
  time: z.string(),
});

const frontmatterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.enum(['officer', 'senior_management', 'management', 'supervisor', 'lead', 'ic']),
  reports_to: z.array(z.string()).default([]),
  manages: z.array(z.string()).default([]),
  preferred_model_tier: z.enum(['high', 'mid', 'low']),
  preferred_providers: z.array(z.string()).default([]),
  fallback_providers: z.array(z.string()).default([]),
  preferred_context_window: z.number().int().positive().optional(),
  tools_allowed: z.array(z.string()).default([]),
  tools_denied: z.array(z.string()).default([]),
  decision_authority: z.enum(['final', 'delegated', 'advisory']),
  escalates_to: z.array(z.string()).default([]),
  kpis: z.array(z.string()).default([]),
  cadences: z.array(cadenceSchema).optional(),
  output_format: z.string().optional(),
  temperature: z.number().min(0).max(2),
  license: z.string().min(1),
  author: z.string().min(1),
  version: z.string().min(1),
});

export function parseRoleMarkdown(source: string, sourcePath: string): RoleSpec {
  const { data, content } = matter(source);
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid role frontmatter in ${sourcePath}: ${issues}`);
  }
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex');
  return {
    frontmatter: parsed.data,
    body: content.trim(),
    sourcePath,
    sha256,
  };
}
