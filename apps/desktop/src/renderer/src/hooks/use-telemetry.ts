/**
 * React Query hooks for the Telemetry tab (Phase 3 — M17).
 *
 * Four hooks matching the four telemetry IPC channels:
 * - useCompanyStats — aggregate company-level summary
 * - useDailyUsage — daily time-series for charts
 * - useEmployeeStats — per-employee breakdown table
 * - useCostBreakdown — by provider/model with date range filter
 */

import { useQuery } from '@tanstack/react-query';

import type { TelemetryCostBreakdownRequest } from '@team-x/shared-types';

import { ipc } from '@/lib/ipc.js';

export function useCompanyStats(companyId: string | null) {
  return useQuery({
    queryKey: ['telemetry', 'companyStats', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.companyStats(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useDailyUsage(companyId: string | null, fromMs: number, toMs: number) {
  return useQuery({
    queryKey: ['telemetry', 'dailyUsage', companyId, fromMs, toMs],
    queryFn: () =>
      // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
      ipc.telemetry.dailyUsage({ companyId: companyId!, fromMs, toMs }),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useEmployeeStats(companyId: string | null) {
  return useQuery({
    queryKey: ['telemetry', 'employeeStats', companyId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.employeeStats(companyId!),
    enabled: companyId !== null && companyId.length > 0,
  });
}

export function useCostBreakdown(req: TelemetryCostBreakdownRequest | null) {
  return useQuery({
    queryKey: ['telemetry', 'costBreakdown', req?.companyId, req?.fromMs, req?.toMs],
    // biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
    queryFn: () => ipc.telemetry.costBreakdown(req!),
    enabled: req !== null && req.companyId.length > 0,
  });
}
