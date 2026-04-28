import { describe, expect, it, vi } from 'vitest';

import {
  collectRuntimeSecretRefs,
  isRuntimeSecretRef,
  resolveRuntimeEnvironment,
} from './runtime-secret-refs.js';

describe('runtime secret refs', () => {
  it('detects typed runtime secret references', () => {
    expect(
      isRuntimeSecretRef({
        type: 'secret_ref',
        providerId: 'anthropic',
        key: 'apiKey',
        version: 'latest',
      }),
    ).toBe(true);
    expect(isRuntimeSecretRef({ type: 'secret_ref', providerId: 'anthropic' })).toBe(false);
  });

  it('collects nested secret references without resolving their values', () => {
    const refs = collectRuntimeSecretRefs({
      env: {
        ANTHROPIC_API_KEY: {
          type: 'secret_ref',
          providerId: 'anthropic',
          key: 'apiKey',
          version: 'latest',
        },
      },
    });

    expect(refs).toEqual([
      {
        path: 'config.env.ANTHROPIC_API_KEY',
        ref: {
          type: 'secret_ref',
          providerId: 'anthropic',
          key: 'apiKey',
          version: 'latest',
        },
      },
    ]);
  });

  it('resolves runtime environment values through the main-process secret reader', async () => {
    const getApiKey = vi.fn(async (providerId: string) =>
      providerId === 'anthropic' ? 'sk-ant-safe' : null,
    );

    await expect(
      resolveRuntimeEnvironment({
        config: {
          env: {
            ANTHROPIC_API_KEY: {
              type: 'secret_ref',
              providerId: 'anthropic',
              key: 'apiKey',
              version: 'latest',
            },
            TEAM_X_MODE: 'autonomous',
            TEAM_X_MAX_STEPS: 5,
          },
        },
        secrets: { getApiKey },
      }),
    ).resolves.toEqual({
      ANTHROPIC_API_KEY: 'sk-ant-safe',
      TEAM_X_MODE: 'autonomous',
      TEAM_X_MAX_STEPS: '5',
    });
    expect(getApiKey).toHaveBeenCalledWith('anthropic');
  });
});
