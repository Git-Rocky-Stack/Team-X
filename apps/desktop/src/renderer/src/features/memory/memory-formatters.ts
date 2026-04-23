import type { RunCheckpoint, ThreadDigest } from '@team-x/shared-types';

export function formatMemoryTimestamp(value: number | null | undefined): string {
  if (!value) return 'Not captured yet';
  return new Date(value).toLocaleString();
}

export function checkpointLabel(kind: RunCheckpoint['checkpointKind']): string {
  if (kind === 'approval-blocked') return 'Approval blocked';
  if (kind === 'budget-blocked') return 'Budget blocked';
  if (kind === 'routine-completed') return 'Routine completed';
  return kind;
}

export function checkpointTone(
  kind: RunCheckpoint['checkpointKind'],
): 'default' | 'accent' | 'warning' | 'danger' {
  if (kind === 'completion' || kind === 'routine-completed') return 'accent';
  if (kind === 'stopped') return 'warning';
  if (kind === 'timeout' || kind === 'approval-blocked' || kind === 'budget-blocked') {
    return 'danger';
  }
  return 'default';
}

export function freshnessTone(
  freshness: ThreadDigest['freshness'] | null | undefined,
): 'default' | 'accent' | 'warning' | 'danger' {
  if (freshness === 'fresh') return 'accent';
  if (freshness === 'stale') return 'warning';
  if (freshness === 'degraded') return 'danger';
  return 'default';
}
