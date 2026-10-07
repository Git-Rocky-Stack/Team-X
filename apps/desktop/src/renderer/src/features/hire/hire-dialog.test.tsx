/**
 * HireDialog — role catalog behaviour.
 *
 * The dialog used to offer two hard-coded Phase-1 roles. It must offer the
 * full non-system role catalog (`useRoles()`), grouped by level, searchable,
 * and hire with the chosen role id through the unchanged `employees.create`
 * flow. System pseudo-roles (system-agent / system-copilot) never appear.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HireDialog } from './hire-dialog.js';

import { ROLE_OPTIONS } from '@/hooks/use-roles.js';

let create: ReturnType<typeof vi.fn>;
let setManager: ReturnType<typeof vi.fn>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderDialog() {
  return render(<HireDialog open onOpenChange={() => undefined} companyId="co-1" />, { wrapper });
}

function roleOptions(): HTMLElement[] {
  return screen.getAllByRole('radio');
}

beforeEach(() => {
  create = vi.fn().mockResolvedValue({ employeeId: 'emp-new' });
  setManager = vi.fn().mockResolvedValue(undefined);
  (window as unknown as { teamx: unknown }).teamx = {
    employees: { list: vi.fn().mockResolvedValue([]), create, setManager },
    events: { onDashboard: vi.fn(() => () => undefined) },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('HireDialog role catalog', () => {
  it('offers every role in the catalog, not a hard-coded subset', () => {
    renderDialog();
    expect(roleOptions()).toHaveLength(ROLE_OPTIONS.length);
    expect(ROLE_OPTIONS.length).toBe(55);
    expect(screen.getByRole('radio', { name: /VP of Engineering/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tech Lead/ })).toBeInTheDocument();
  });

  it('groups roles by level, most senior first', () => {
    renderDialog();
    const groups = screen.getAllByRole('group');
    const labels = groups.map((group) => group.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Officer',
      'Senior Management',
      'Management',
      'Supervisor',
      'Lead',
      'IC',
    ]);
    const officer = groups[0] as HTMLElement;
    expect(within(officer).getAllByRole('radio')).toHaveLength(
      ROLE_OPTIONS.filter((role) => role.level === 'officer').length,
    );
    expect(within(officer).getByRole('radio', { name: /Chief Executive Officer/ })).toBeVisible();
  });

  it('never lists system pseudo-roles', () => {
    renderDialog();
    expect(screen.queryByRole('radio', { name: /system/i })).toBeNull();
    for (const option of roleOptions()) {
      expect(option.getAttribute('data-hire-role')).not.toMatch(/^system-/);
    }
  });

  it('filters the catalog by search text and reports when nothing matches', () => {
    renderDialog();
    const search = screen.getByRole('searchbox', { name: /search roles/i });
    fireEvent.change(search, { target: { value: 'engineer' } });
    const visible = roleOptions();
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(ROLE_OPTIONS.length);
    for (const option of visible) {
      expect(option.closest('label')?.textContent?.toLowerCase()).toContain('engineer');
    }

    fireEvent.change(search, { target: { value: 'zzz-no-such-role' } });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText(/no roles match/i)).toBeInTheDocument();
  });

  it('hires with the chosen role id through employees.create', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: /Data Engineering Manager/ }));
    expect(screen.getByRole('radio', { name: /Data Engineering Manager/ })).toBeChecked();
    const nameInput = screen.getByLabelText(/employee name/i);
    expect(nameInput).toHaveValue('Data Engineering Manager');
    fireEvent.change(nameInput, { target: { value: 'Iris Kovac' } });

    fireEvent.click(screen.getByRole('button', { name: /confirm hire/i }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        companyId: 'co-1',
        roleId: 'data-engineering-manager',
        name: 'Iris Kovac',
      }),
    );
    expect(setManager).not.toHaveBeenCalled();
  });
});
