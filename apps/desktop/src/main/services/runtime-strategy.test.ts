import type { HardwareProfile, ProviderConfig } from '@team-x/shared-types';
import { describe, expect, it } from 'vitest';

import { type StrategyInput, pickStrategy } from './runtime-strategy.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    cpuCores: 8,
    totalRamGb: 16,
    gpuDetected: false,
    gpuName: null,
    gpuVramGb: null,
    platform: 'win32',
    ...overrides,
  };
}

function makeProvider(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  return {
    name: overrides.id,
    kind: 'anthropic',
    privacyTier: 'proprietary-cloud',
    enabled: true,
    ...overrides,
  };
}

function pick(overrides: Partial<StrategyInput> = {}) {
  return pickStrategy({
    profile: makeProfile(),
    providers: [],
    override: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pickStrategy', () => {
  describe('manual override', () => {
    it('returns lean when override is lean', () => {
      const result = pick({ override: 'lean' });
      expect(result.strategy).toBe('lean');
      expect(result.slots).toBe(2);
      expect(result.reason).toBe('Manual override');
    });

    it('returns always-on when override is always-on', () => {
      const result = pick({ override: 'always-on' });
      expect(result.strategy).toBe('always-on');
      expect(result.slots).toBe(8);
    });

    it('returns hybrid when override is hybrid', () => {
      const result = pick({ override: 'hybrid' });
      expect(result.strategy).toBe('hybrid');
      expect(result.slots).toBe(4);
    });

    it('treats auto override as no override', () => {
      const result = pick({ override: 'auto' });
      // No providers -> lean
      expect(result.strategy).toBe('lean');
    });
  });

  describe('auto — GPU + local + cloud', () => {
    it('picks hybrid when GPU + local + cloud providers', () => {
      const result = pick({
        profile: makeProfile({ gpuDetected: true, gpuName: 'RTX 3070', gpuVramGb: 8 }),
        providers: [
          makeProvider({ id: 'ollama', kind: 'ollama', privacyTier: 'local' }),
          makeProvider({ id: 'anthropic', kind: 'anthropic', privacyTier: 'proprietary-cloud' }),
        ],
      });
      expect(result.strategy).toBe('hybrid');
      expect(result.slots).toBe(4);
    });
  });

  describe('auto — cloud only', () => {
    it('picks always-on when cloud providers only', () => {
      const result = pick({
        providers: [
          makeProvider({ id: 'anthropic', kind: 'anthropic', privacyTier: 'proprietary-cloud' }),
          makeProvider({ id: 'openai', kind: 'openai', privacyTier: 'proprietary-cloud' }),
        ],
      });
      expect(result.strategy).toBe('always-on');
      expect(result.slots).toBe(8);
    });

    it('picks always-on when local exists but no GPU', () => {
      const result = pick({
        profile: makeProfile({ gpuDetected: false }),
        providers: [
          makeProvider({ id: 'ollama', kind: 'ollama', privacyTier: 'local' }),
          makeProvider({ id: 'anthropic', kind: 'anthropic', privacyTier: 'proprietary-cloud' }),
        ],
      });
      expect(result.strategy).toBe('always-on');
    });

    it('picks always-on when GPU has insufficient VRAM', () => {
      const result = pick({
        profile: makeProfile({ gpuDetected: true, gpuName: 'Intel HD', gpuVramGb: 2 }),
        providers: [
          makeProvider({ id: 'ollama', kind: 'ollama', privacyTier: 'local' }),
          makeProvider({ id: 'anthropic', kind: 'anthropic', privacyTier: 'proprietary-cloud' }),
        ],
      });
      expect(result.strategy).toBe('always-on');
    });
  });

  describe('auto — local only with GPU', () => {
    it('picks hybrid when GPU + local only', () => {
      const result = pick({
        profile: makeProfile({ gpuDetected: true, gpuName: 'RTX 4090', gpuVramGb: 24 }),
        providers: [makeProvider({ id: 'ollama', kind: 'ollama', privacyTier: 'local' })],
      });
      expect(result.strategy).toBe('hybrid');
    });
  });

  describe('auto — lean fallback', () => {
    it('picks lean when no providers', () => {
      const result = pick({ providers: [] });
      expect(result.strategy).toBe('lean');
      expect(result.slots).toBe(2);
    });

    it('picks lean when only disabled providers', () => {
      const result = pick({
        providers: [makeProvider({ id: 'anthropic', enabled: false })],
      });
      expect(result.strategy).toBe('lean');
    });

    it('picks lean when local only + no GPU', () => {
      const result = pick({
        profile: makeProfile({ gpuDetected: false }),
        providers: [makeProvider({ id: 'ollama', kind: 'ollama', privacyTier: 'local' })],
      });
      expect(result.strategy).toBe('lean');
    });
  });
});
