import { describe, expect, it } from 'vitest';

import { type AnnunciatorInputs, deriveAnnunciatorTiles } from './annunciator-signals';

const base: AnnunciatorInputs = {
  queueUnread: 0,
  runtime: { stateTone: 'default', sessionCount: 0 },
  budget: { configured: false, usedPct: 0, periodKey: '' },
  approvalsPending: 0,
  approvalsNewestId: null,
  meetingsActive: 0,
  acked: {},
};

describe('deriveAnnunciatorTiles', () => {
  it('quiet system: every tile present, unlit/calm, nothing blinking', () => {
    const tiles = deriveAnnunciatorTiles(base);
    expect(tiles.map((t) => t.id)).toEqual(['que', 'gguf', 'budg', 'appr', 'mtg']);
    expect(tiles.every((t) => !t.alert)).toBe(true);
    expect(tiles.find((t) => t.id === 'que')?.tone).toBe('off');
  });

  it('queue + meetings light their tones', () => {
    const tiles = deriveAnnunciatorTiles({ ...base, queueUnread: 3, meetingsActive: 1 });
    expect(tiles.find((t) => t.id === 'que')?.tone).toBe('hold');
    expect(tiles.find((t) => t.id === 'mtg')?.tone).toBe('exec');
  });

  it('runtime danger blinks until acked, then burns steady', () => {
    const hot = { ...base, runtime: { stateTone: 'danger' as const, sessionCount: 2 } };
    const blinking = deriveAnnunciatorTiles(hot).find((t) => t.id === 'gguf');
    expect(blinking).toMatchObject({ tone: 'warn', alert: true, acknowledged: false });
    const fp = blinking?.fingerprint as string;
    const acked = deriveAnnunciatorTiles({ ...hot, acked: { gguf: fp } }).find(
      (t) => t.id === 'gguf',
    );
    expect(acked).toMatchObject({ alert: true, acknowledged: true });
  });

  it('budget thresholds: 80% holds, 100% warns+alerts, new period re-alerts', () => {
    const b = (usedPct: number, periodKey = 'p1') => ({
      ...base,
      budget: { configured: true, usedPct, periodKey },
    });
    expect(deriveAnnunciatorTiles(b(50)).find((t) => t.id === 'budg')?.tone).toBe('go');
    expect(deriveAnnunciatorTiles(b(85)).find((t) => t.id === 'budg')?.tone).toBe('hold');
    const over = deriveAnnunciatorTiles(b(110)).find((t) => t.id === 'budg');
    expect(over).toMatchObject({ tone: 'warn', alert: true });
    // ack p1, then a NEW period over-budget must re-blink
    const ackedP1 = { budg: over?.fingerprint as string };
    const p2 = deriveAnnunciatorTiles({ ...b(110, 'p2'), acked: ackedP1 }).find(
      (t) => t.id === 'budg',
    );
    expect(p2?.acknowledged).toBe(false);
  });

  it('new approval re-alerts after an earlier ack', () => {
    const one = { ...base, approvalsPending: 1, approvalsNewestId: 'a1' };
    const tile1 = deriveAnnunciatorTiles(one).find((t) => t.id === 'appr');
    expect(tile1).toMatchObject({ tone: 'hold', alert: true });
    const acked = { appr: tile1?.fingerprint as string };
    expect(
      deriveAnnunciatorTiles({ ...one, acked }).find((t) => t.id === 'appr')?.acknowledged,
    ).toBe(true);
    const two = { ...base, approvalsPending: 2, approvalsNewestId: 'a2', acked };
    expect(deriveAnnunciatorTiles(two).find((t) => t.id === 'appr')?.acknowledged).toBe(false);
  });
});
