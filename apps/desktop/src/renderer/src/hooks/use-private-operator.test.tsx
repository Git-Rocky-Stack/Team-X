/**
 * React Query hooks for the `privateOperator.*` bridge — behaviour specs.
 *
 * Driven against a stubbed preload bridge (`window.teamx`), which is what
 * `lib/ipc.ts`'s lazy Proxy resolves against. Assertions are on what the hook
 * returns and on the exact request shape it forwards — forwarding that shape
 * IS the behaviour here, because the opt-in flags are what decide whether the
 * plan authorises approval review, runtime launch, or secret mutation.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrivateOperatorPlan, usePrivateOperatorSnapshot } from './use-private-operator.js';

const PLAN = {
  companyId: 'co-1',
  generatedAt: 5,
  mode: 'localhost',
  status: 'ready',
  bindHost: '127.0.0.1',
  port: 48731,
  operatorId: 'op-1',
  operatorRole: 'owner',
  exposure: 'localhost-only',
  guidance: ['Bind to localhost only by default.'],
  warnings: [],
  guardrails: ['Never bind the private operator surface to 0.0.0.0 or a LAN address.'],
  allowedActions: [{ action: 'mission-control.read', allowed: true, reason: 'read-only first' }],
  blockedActions: [],
};

function makeBridge() {
  return {
    plan: vi.fn().mockResolvedValue(PLAN),
    snapshot: vi.fn().mockResolvedValue({ companyId: 'co-1', generatedAt: 5, access: PLAN }),
  };
}

let bridge: ReturnType<typeof makeBridge>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  bridge = makeBridge();
  (window as unknown as { teamx: unknown }).teamx = { privateOperator: bridge };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('usePrivateOperatorPlan', () => {
  it('returns the plan the main process computed', async () => {
    const { result } = renderHook(() => usePrivateOperatorPlan('co-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(PLAN);
  });

  it('defaults every opt-in to false so the query never asks for more than read-only', async () => {
    const { result } = renderHook(() => usePrivateOperatorPlan('co-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bridge.plan).toHaveBeenCalledWith({
      companyId: 'co-1',
      operatorId: null,
      mode: 'localhost',
      allowApprovalActions: false,
      allowRuntimeActions: false,
      allowSecretChanges: false,
    });
  });

  it('forwards the mode and opt-ins the caller asked for', async () => {
    const { result } = renderHook(
      () =>
        usePrivateOperatorPlan('co-1', {
          mode: 'tailscale',
          operatorId: 'op-7',
          allowApprovalActions: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bridge.plan).toHaveBeenCalledWith({
      companyId: 'co-1',
      operatorId: 'op-7',
      mode: 'tailscale',
      allowApprovalActions: true,
      allowRuntimeActions: false,
      allowSecretChanges: false,
    });
  });

  it('stays disabled without a company rather than planning for an empty workspace', () => {
    const { result } = renderHook(() => usePrivateOperatorPlan(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(bridge.plan).not.toHaveBeenCalled();
  });

  it('keys the cache by mode so two exposures never share one entry', async () => {
    // Asserted against the cache KEYS, not against the call count. With the
    // default staleTime of 0, a second mount refetches even on a cache hit, so
    // "the bridge was called twice" is true whether or not `mode` is part of
    // the key — it cannot distinguish the two, and a test that cannot fail for
    // the reason it names is not coverage.
    const first = renderHook(() => usePrivateOperatorPlan('co-1', { mode: 'localhost' }), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => usePrivateOperatorPlan('co-1', { mode: 'hosted-bridge' }), {
      wrapper,
    });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    const keys = client
      .getQueryCache()
      .getAll()
      .map((entry) => entry.queryKey as readonly unknown[])
      .filter((key) => key[0] === 'private-operator' && key[1] === 'plan');
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => key.includes('localhost'))).toBe(true);
    expect(keys.some((key) => key.includes('hosted-bridge'))).toBe(true);
  });
});

describe('usePrivateOperatorSnapshot', () => {
  it('returns the snapshot the main process computed', async () => {
    const { result } = renderHook(() => usePrivateOperatorSnapshot('co-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ companyId: 'co-1', generatedAt: 5, access: PLAN });
  });

  it('stays disabled without a company', () => {
    const { result } = renderHook(() => usePrivateOperatorSnapshot(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(bridge.snapshot).not.toHaveBeenCalled();
  });
});
