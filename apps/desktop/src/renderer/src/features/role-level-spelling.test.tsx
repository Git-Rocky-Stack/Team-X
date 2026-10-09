/**
 * Renderer level displays vs. the role-pack level spelling.
 *
 * An employee hired from a Senior Management role reaches the renderer with
 * `level: 'senior_management'`: the hire handler copies the role frontmatter
 * verbatim and `rowToEmployee` passes it through. The floor view and the org
 * chart node both key their level tables on the hyphenated
 * `'senior-management'`, so these tests render the real components with an
 * employee whose level is read out of a shipped Senior Management role file.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Employee } from '@team-x/shared-types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FloorView } from './dashboard/floor-view.js';
import { OrgChartNode } from './orgchart/org-chart-node.js';

const currentDirname = dirname(fileURLToPath(import.meta.url));
// apps/desktop/src/renderer/src/features -> repo root is up 6 directories.
const VP_ROLE_PATH = resolve(
  currentDirname,
  '../../../../../..',
  'role-packs/strategia-official/roles/senior-mgmt/vp-engineering.md',
);

/** Read one scalar frontmatter field out of the shipped role file. */
function frontmatterField(field: string): string {
  const frontmatter = readFileSync(VP_ROLE_PATH, 'utf8').split(/^---$/m)[1] ?? '';
  const value = frontmatter.match(new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm'))?.[1];
  if (!value) throw new Error(`vp-engineering.md has no frontmatter field "${field}"`);
  return value;
}

/** The employee the renderer receives after hiring the shipped VP of Engineering role. */
function hiredVp(): Employee {
  const level = frontmatterField('level');
  // Guard: if the role file ever changes spelling, the cases below stop proving anything.
  expect(level).toBe('senior_management');
  return {
    id: 'emp-vp',
    companyId: 'co-1',
    rolePackId: 'strategia-official',
    roleId: frontmatterField('id'),
    roleMdSha: 'a'.repeat(64),
    level,
    name: 'Dana Okafor',
    title: frontmatterField('name'),
    status: 'idle',
    createdAt: 1_700_000_000_000,
  };
}

const noop = () => undefined;

describe('renderer level displays for a hired Senior Management employee', () => {
  it('floor view: files the employee under Sr. Mgmt, not the unrecognized-level bucket', () => {
    render(<FloorView employees={[hiredVp()]} />);
    expect(screen.getByText('Sr. Mgmt (1)')).toBeInTheDocument();
    expect(screen.queryByText('other (1)')).not.toBeInTheDocument();
  });

  it('floor view: labels the cell Sr. Mgmt and gives it the senior-management bezel', () => {
    render(<FloorView employees={[hiredVp()]} />);
    const cell = screen.getByRole('button', { name: /Dana Okafor/ });
    expect(within(cell).getByText('Sr. Mgmt')).toBeInTheDocument();
    expect(cell.className).toContain('border-[var(--led-hold-edge)]');
  });

  it('org chart node: shows the canonical level with the senior-management palette', () => {
    render(
      <ul>
        <OrgChartNode
          employee={hiredVp()}
          depth={0}
          childCount={0}
          managerOptions={[]}
          onChat={noop}
          onProfile={noop}
          onPromote={noop}
          onFire={noop}
          onSetManager={noop}
        />
      </ul>,
    );
    const badge = screen.getByText('senior-management');
    expect(badge.className).toContain('text-[var(--silver)]');
  });
});
