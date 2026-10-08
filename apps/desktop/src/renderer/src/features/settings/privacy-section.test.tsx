/**
 * PrivacySection — behaviour specs.
 *
 * Rendered for real against a stubbed preload bridge. The thing worth
 * protecting is the consequence readout: under a restrictive tier the
 * operator must SEE which configured providers the tier refuses — before a
 * run fails on one — and must see an explicit all-clear when it refuses
 * none, never an empty gap that reads the same as "still loading".
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SettingsGetPrivacyResponse } from '@team-x/shared-types';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivacySection } from './privacy-section.js';

function makePrivacy(
  overrides: Partial<SettingsGetPrivacyResponse> = {},
): SettingsGetPrivacyResponse {
  return {
    maxTier: 'local',
    availableProviders: [
      {
        id: 'ollama-local',
        name: 'Ollama (Local)',
        kind: 'ollama',
        privacyTier: 'local',
        allowed: true,
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        kind: 'anthropic',
        privacyTier: 'proprietary-cloud',
        allowed: false,
      },
    ],
    blockedProviders: [
      { id: 'anthropic', name: 'Anthropic', kind: 'anthropic', privacyTier: 'proprietary-cloud' },
      { id: 'groq', name: 'Groq', kind: 'groq', privacyTier: 'open-source-cloud' },
    ],
    retrievalEmbeddingProviderId: null,
    ...overrides,
  };
}

let getPrivacy: ReturnType<typeof vi.fn>;
let client: QueryClient;

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(
    <Harness>
      <PrivacySection />
    </Harness>,
  );
}

/** The consequence well — scoped so the availability list's rows don't match. */
async function blockedWell(container: HTMLElement): Promise<HTMLElement> {
  let well: HTMLElement | null = null;
  await waitFor(() => {
    well = container.querySelector<HTMLElement>('[data-privacy-blocked]');
    expect(well).not.toBeNull();
  });
  return well as unknown as HTMLElement;
}

beforeEach(() => {
  getPrivacy = vi.fn().mockResolvedValue(makePrivacy());
  (window as unknown as { teamx: unknown }).teamx = {
    settings: { getPrivacy, setPrivacy: vi.fn().mockResolvedValue(undefined) },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('PrivacySection — blocked-provider readout', () => {
  it('lists every configured provider the current tier refuses, with its tier', async () => {
    const { container } = renderSection();
    const well = await blockedWell(container);

    expect(within(well).getByText('Anthropic')).toBeVisible();
    expect(within(well).getByText('Proprietary Cloud')).toBeVisible();
    expect(within(well).getByText('Groq')).toBeVisible();
    expect(within(well).getByText('Open-Source Cloud')).toBeVisible();
  });

  it('marks each refused provider with a steady NO-GO lamp, not an icon', async () => {
    const { container } = renderSection();
    const well = await blockedWell(container);

    expect(within(well).getAllByText('NO-GO')).toHaveLength(2);
  });

  it('spells out what happens to runs on a refused provider', async () => {
    const { container } = renderSection();
    const well = await blockedWell(container);

    expect(
      within(well).getByText(/Employees on these providers will refuse to run under Local Only/),
    ).toBeVisible();
  });

  it('says what happens to retrieval when the tier refuses its embedding provider', async () => {
    getPrivacy.mockResolvedValue(makePrivacy({ retrievalEmbeddingProviderId: 'groq' }));
    const { container } = renderSection();
    const well = await blockedWell(container);

    expect(
      within(well).getByText(/Retrieval embeds through Groq: chats keep ticket, goal, project/),
    ).toBeVisible();
    expect(within(well).getByText('Retrieval')).toBeVisible();
  });

  it('says nothing about retrieval when its embedding provider is allowed', async () => {
    const { container } = renderSection();
    const well = await blockedWell(container);

    expect(within(well).queryByText(/Retrieval embeds through/)).toBeNull();
  });

  it('shows an explicit all-clear when the tier refuses nothing', async () => {
    getPrivacy.mockResolvedValue(
      makePrivacy({ maxTier: 'proprietary-cloud', blockedProviders: [] }),
    );
    const { container } = renderSection();
    const well = await blockedWell(container);

    expect(within(well).getByText('No configured provider is blocked at this tier.')).toBeVisible();
    expect(within(well).getByText('CLEAR')).toBeVisible();
    expect(within(well).queryByText('NO-GO')).toBeNull();
  });

  it('keeps the per-provider availability list', async () => {
    renderSection();

    await waitFor(() => expect(screen.getByText('Ollama (Local)')).toBeVisible());
    expect(screen.getByText('Allowed')).toBeVisible();
  });
});
