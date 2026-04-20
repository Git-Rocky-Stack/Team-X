/**
 * Source-string audit for Phase 5.6 M-D step (f): org-chart interactions.
 *
 * Renderer tests run in Node, so this pins the hook/component contracts
 * cheaply while Playwright owns the durable end-to-end flow.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = join(currentDirname, '..', '..', 'hooks');
const ORG_VIEW_PATH = join(currentDirname, 'org-chart-view.tsx');
const ORG_TREE_PATH = join(currentDirname, 'org-chart-tree.tsx');
const ORG_NODE_PATH = join(currentDirname, 'org-chart-node.tsx');
const PROMOTE_DIALOG_PATH = join(currentDirname, 'promote-dialog.tsx');
const FIRE_DIALOG_PATH = join(currentDirname, 'fire-dialog.tsx');
const USE_FIRE_PATH = join(HOOKS_DIR, 'use-fire-employee.ts');
const USE_PROMOTE_PATH = join(HOOKS_DIR, 'use-promote-employee.ts');
const USE_SET_MANAGER_PATH = join(HOOKS_DIR, 'use-set-manager.ts');
const USE_ROLES_PATH = join(HOOKS_DIR, 'use-roles.ts');

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const orgViewSrc = read(ORG_VIEW_PATH);
const orgTreeSrc = read(ORG_TREE_PATH);
const orgNodeSrc = read(ORG_NODE_PATH);
const promoteDialogSrc = read(PROMOTE_DIALOG_PATH);
const fireDialogSrc = read(FIRE_DIALOG_PATH);
const useFireSrc = read(USE_FIRE_PATH);
const usePromoteSrc = read(USE_PROMOTE_PATH);
const useSetManagerSrc = read(USE_SET_MANAGER_PATH);
const useRolesSrc = read(USE_ROLES_PATH);

describe('org-chart mutation hooks', () => {
  it('wraps fire, promote, and manager updates in React Query mutations', () => {
    expect(existsSync(USE_FIRE_PATH)).toBe(true);
    expect(existsSync(USE_PROMOTE_PATH)).toBe(true);
    expect(existsSync(USE_SET_MANAGER_PATH)).toBe(true);

    expect(useFireSrc).toContain('export function useFireEmployee(companyId: string)');
    expect(useFireSrc).toContain('mutationFn: (employeeId: string) =>');
    expect(useFireSrc).toContain('ipc.employees.fire({ employeeId })');
    expect(useFireSrc).toContain("const queryKey = ['orgchart', companyId] as const");
    expect(useFireSrc).toContain('onMutate');
    expect(useFireSrc).toContain('previousOrgChart');
    expect(useFireSrc).toContain('onError');
    expect(useFireSrc).toContain('onSettled');

    expect(usePromoteSrc).toContain('export function usePromoteEmployee(companyId: string)');
    expect(usePromoteSrc).toContain('ipc.employees.promote');
    expect(usePromoteSrc).toContain('newRoleId');
    expect(usePromoteSrc).toContain('setQueryData<OrgchartGetResponse>');

    expect(useSetManagerSrc).toContain('export function useSetManager(companyId: string)');
    expect(useSetManagerSrc).toContain('ipc.employees.setManager');
    expect(useSetManagerSrc).toContain('managerId');
    expect(useSetManagerSrc).toContain('setQueryData<OrgchartGetResponse>');
    expect(useSetManagerSrc).toContain('edges.filter((edge) => edge.reportId !== employeeId)');
  });

  it('exposes the bundled visible role catalog without system pseudo-employees', () => {
    expect(existsSync(USE_ROLES_PATH)).toBe(true);
    expect(useRolesSrc).toContain('export const ROLE_OPTIONS');
    expect(useRolesSrc).toContain('chief-executive-officer');
    expect(useRolesSrc).toContain('engineering-manager');
    expect(useRolesSrc).toContain('senior-fullstack-engineer');
    expect(useRolesSrc).toContain('export function useRoles()');
    expect(useRolesSrc).toContain('rolesByLevel');
    expect(useRolesSrc).toContain('count: ROLE_OPTIONS.length');
    expect(useRolesSrc).not.toContain('system-agent');
    expect(useRolesSrc).not.toContain('system-copilot');
  });
});

describe('org-chart interaction UI', () => {
  it('wires node actions to promote/fire dialogs and manager reassignment controls', () => {
    expect(existsSync(PROMOTE_DIALOG_PATH)).toBe(true);
    expect(existsSync(FIRE_DIALOG_PATH)).toBe(true);
    expect(orgViewSrc).toContain("useFireEmployee(companyId ?? '')");
    expect(orgViewSrc).toContain("usePromoteEmployee(companyId ?? '')");
    expect(orgViewSrc).toContain("useSetManager(companyId ?? '')");
    expect(orgViewSrc).toContain('<PromoteDialog');
    expect(orgViewSrc).toContain('<FireDialog');
    expect(orgViewSrc).toContain('data-org-chart-toast=""');

    expect(orgTreeSrc).toContain('onPromote={onPromote}');
    expect(orgTreeSrc).toContain('onFire={onFire}');
    expect(orgTreeSrc).toContain('onSetManager={onSetManager}');

    expect(orgNodeSrc).toContain('data-org-chart-promote=""');
    expect(orgNodeSrc).toContain('data-org-chart-fire=""');
    expect(orgNodeSrc).toContain('data-org-chart-manager-select=""');
    expect(orgNodeSrc).toContain('draggable');
    expect(orgNodeSrc).toContain('onDragStart');
    expect(orgNodeSrc).toContain('onDrop');
    expect(orgNodeSrc).not.toContain('Actions ship in step (f)');
  });

  it('promote and fire dialogs gate write actions behind explicit user intent', () => {
    expect(promoteDialogSrc).toContain('export function PromoteDialog');
    expect(promoteDialogSrc).toContain('useRoles()');
    expect(promoteDialogSrc).toContain('data-promote-role-select=""');
    expect(promoteDialogSrc).toContain('onPromote(employee.id, roleId)');

    expect(fireDialogSrc).toContain('export function FireDialog');
    expect(fireDialogSrc).toContain('Type the employee name to confirm');
    expect(fireDialogSrc).toContain('confirmName !== employee.name');
    expect(fireDialogSrc).toContain('data-fire-confirm-name=""');
    expect(fireDialogSrc).toContain('onFire(employee.id)');
  });
});
