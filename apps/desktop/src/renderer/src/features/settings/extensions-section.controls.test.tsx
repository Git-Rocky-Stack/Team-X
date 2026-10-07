/**
 * ExtensionsSection — lifecycle controls behaviour.
 *
 * MCP servers and skills could be ADDED from Settings but never disabled or
 * removed: an added MCP server spawned a subprocess the operator could not
 * stop. These specs pin the controls that close that gap, each destructive
 * one behind an explicit confirm, plus the proactive MASTER switch (the
 * workspace-wide flag) which must write `settings.setProactive` rather than
 * a per-company toggle.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ExtensionSummary, McpServerSummary } from '@team-x/shared-types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExtensionsSection } from './extensions-section.js';

import { useAppStore } from '@/store/app-store.js';

const COMPANY = 'co-1';

function skill(overrides: Partial<ExtensionSummary>): ExtensionSummary {
  return {
    id: 'ext-skill',
    kind: 'skill',
    companyId: COMPANY,
    name: 'Release Notes',
    slug: 'release-notes',
    sourceKind: 'local',
    sourceRef: 'D:/skills/release-notes',
    version: '1.0.0',
    updateChannel: null,
    manifest: null,
    requestedCapabilities: [],
    requestedPaths: [],
    enabled: true,
    trustState: 'trusted',
    runtimeRefId: null,
    installedAt: 1,
    updatedAt: 1,
    ...overrides,
  } as ExtensionSummary;
}

let servers: McpServerSummary[];
let extensions: ExtensionSummary[];
let proactive: { enabled: boolean; autonomyMode: 'balanced' };
let mcpToggle: ReturnType<typeof vi.fn>;
let mcpRemove: ReturnType<typeof vi.fn>;
let removeSkill: ReturnType<typeof vi.fn>;
let setProactive: ReturnType<typeof vi.fn>;
let proactiveSetEnabled: ReturnType<typeof vi.fn>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(<ExtensionsSection />, { wrapper });
}

beforeEach(() => {
  servers = [
    {
      id: 'mcp-fs',
      companyId: COMPANY,
      name: 'Filesystem MCP',
      transport: 'stdio',
      enabled: true,
      lastHealth: '2026-10-01T00:00:00.000Z',
      toolCount: 4,
    },
    {
      id: 'mcp-global',
      companyId: null,
      name: 'Global Template',
      transport: 'stdio',
      enabled: false,
      lastHealth: null,
      toolCount: 0,
    },
  ];
  extensions = [
    skill({}),
    skill({ id: 'ext-global-skill', companyId: null, name: 'Bundled Skill' }),
    skill({ id: 'ext-mcp', kind: 'mcp', name: 'Filesystem MCP', runtimeRefId: 'mcp-fs' }),
  ];
  proactive = { enabled: false, autonomyMode: 'balanced' };
  mcpToggle = vi.fn(async (serverId: string, enabled: boolean) => {
    servers = servers.map((s) => (s.id === serverId ? { ...s, enabled } : s));
  });
  mcpRemove = vi.fn(async (serverId: string) => {
    servers = servers.filter((s) => s.id !== serverId);
  });
  removeSkill = vi.fn(async ({ extensionId }: { extensionId: string }) => {
    extensions = extensions.filter((e) => e.id !== extensionId);
  });
  setProactive = vi.fn(async (req: { enabled?: boolean }) => {
    proactive = { ...proactive, ...(req.enabled === undefined ? {} : { enabled: req.enabled }) };
  });
  proactiveSetEnabled = vi.fn(async () => undefined);
  (window as unknown as { teamx: unknown }).teamx = {
    settings: {
      getExtensions: vi.fn(async () => ({ autonomyMode: 'balanced' })),
      setExtensions: vi.fn(async () => undefined),
      getProactive: vi.fn(async () => ({ ...proactive })),
      setProactive,
    },
    extensions: {
      list: vi.fn(async () => extensions),
      removeSkill,
    },
    mcp: {
      list: vi.fn(async () => servers),
      listTemplates: vi.fn(async () => []),
      toggle: mcpToggle,
      removeServer: mcpRemove,
    },
    authority: {
      list: vi.fn(async () => []),
      listRequests: vi.fn(async () => []),
    },
    employees: { list: vi.fn(async () => []) },
    proactive: {
      setEnabled: proactiveSetEnabled,
      getState: vi.fn(async () => ({
        enabled: true,
        activeWork: 0,
        queuedWork: 0,
        lastScanAt: null,
      })),
      scanForWork: vi.fn(async () => ({ queuedCount: 0 })),
    },
    events: { onDashboard: vi.fn(() => () => undefined) },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAppStore.setState({ companyId: COMPANY });
});

async function mcpRow(name: string): Promise<HTMLElement> {
  const label = await screen.findByText(name, { selector: '[data-mcp-server-name]' });
  const row = label.closest('[data-mcp-server-row]');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`);
  return row;
}

async function skillRow(name: string): Promise<HTMLElement> {
  const label = await screen.findByText(name, { selector: '[data-skill-name]' });
  const row = label.closest('[data-skill-row]');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`);
  return row;
}

describe('ExtensionsSection — MCP server lifecycle', () => {
  it('lists only this workspace’s MCP servers', async () => {
    renderSection();
    await mcpRow('Filesystem MCP');
    expect(
      screen.queryByText('Global Template', { selector: '[data-mcp-server-name]' }),
    ).toBeNull();
  });

  it('disables and re-enables a server through mcp.toggle', async () => {
    renderSection();
    const row = await mcpRow('Filesystem MCP');
    const toggle = within(row).getByRole('switch', { name: /enable filesystem mcp/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    await waitFor(() => expect(mcpToggle).toHaveBeenCalledWith('mcp-fs', false));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));

    fireEvent.click(toggle);
    await waitFor(() => expect(mcpToggle).toHaveBeenLastCalledWith('mcp-fs', true));
  });

  it('removes a server only after an explicit confirm', async () => {
    renderSection();
    const row = await mcpRow('Filesystem MCP');

    fireEvent.click(within(row).getByRole('button', { name: /remove filesystem mcp/i }));
    expect(mcpRemove).not.toHaveBeenCalled();
    expect(within(row).getByText(/remove this server\?/i)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: /cancel/i }));
    expect(mcpRemove).not.toHaveBeenCalled();
    expect(within(row).queryByText(/remove this server\?/i)).toBeNull();

    fireEvent.click(within(row).getByRole('button', { name: /remove filesystem mcp/i }));
    fireEvent.click(within(row).getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(mcpRemove).toHaveBeenCalledWith('mcp-fs'));
    await waitFor(() =>
      expect(
        screen.queryByText('Filesystem MCP', { selector: '[data-mcp-server-name]' }),
      ).toBeNull(),
    );
  });

  it('reports a failed toggle', async () => {
    mcpToggle.mockRejectedValueOnce(new Error('spawn refused'));
    renderSection();
    const row = await mcpRow('Filesystem MCP');
    fireEvent.click(within(row).getByRole('switch', { name: /enable filesystem mcp/i }));
    expect(await screen.findByText(/failed to update the mcp server/i)).toBeInTheDocument();
  });

  it('shows an empty state when the workspace has no MCP servers', async () => {
    servers = [];
    renderSection();
    expect(await screen.findByText(/no mcp servers added/i)).toBeInTheDocument();
  });
});

describe('ExtensionsSection — skill removal', () => {
  it('lists only this workspace’s skills', async () => {
    renderSection();
    await skillRow('Release Notes');
    expect(screen.queryByText('Bundled Skill', { selector: '[data-skill-name]' })).toBeNull();
  });

  it('removes a skill only after an explicit confirm', async () => {
    renderSection();
    const row = await skillRow('Release Notes');

    fireEvent.click(within(row).getByRole('button', { name: /remove release notes/i }));
    expect(removeSkill).not.toHaveBeenCalled();
    expect(within(row).getByText(/remove this skill\?/i)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(removeSkill).toHaveBeenCalledWith({ companyId: COMPANY, extensionId: 'ext-skill' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Release Notes', { selector: '[data-skill-name]' })).toBeNull(),
    );
  });

  it('shows an empty state when the workspace has no skills', async () => {
    extensions = extensions.filter((e) => e.kind !== 'skill' || e.companyId !== COMPANY);
    renderSection();
    expect(await screen.findByText(/no skills installed/i)).toBeInTheDocument();
  });
});

describe('ExtensionsSection — proactive master switch', () => {
  it('writes the workspace-wide flag, not a per-company toggle', async () => {
    renderSection();
    const master = await screen.findByRole('switch', { name: /proactive master switch/i });
    await waitFor(() => expect(master).not.toBeDisabled());

    fireEvent.click(master);

    await waitFor(() => expect(setProactive).toHaveBeenCalledWith({ enabled: true }));
    expect(proactiveSetEnabled).not.toHaveBeenCalled();
    await waitFor(() => expect(master).toHaveAttribute('aria-checked', 'true'));
  });
});
