import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyShiftClass, shiftFromTheme, themeFromShift } from './use-shift';

const useShiftSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'use-shift.ts'),
  'utf8',
);

describe('shift mapping', () => {
  it('maps company theme to shift', () => {
    expect(shiftFromTheme('dark')).toBe('night');
    expect(shiftFromTheme('light')).toBe('day');
    expect(shiftFromTheme(undefined)).toBe('night'); // no company / unknown → Night Ops default
  });
  it('maps shift back to theme', () => {
    expect(themeFromShift('night')).toBe('dark');
    expect(themeFromShift('day')).toBe('light');
  });
  it('applyShiftClass toggles the dark class on a classList-like target', () => {
    const calls: Array<[string, boolean]> = [];
    const fake = { classList: { toggle: (cls: string, on: boolean) => calls.push([cls, on]) } };
    applyShiftClass('night', fake as unknown as HTMLElement);
    applyShiftClass('day', fake as unknown as HTMLElement);
    expect(calls).toEqual([
      ['dark', true],
      ['dark', false],
    ]);
  });
});

describe('setShift optimistic-write safety (source contract)', () => {
  it('snapshots the companies cache before the optimistic write', () => {
    expect(useShiftSource).toContain(
      "const previousCompanies = queryClient.getQueryData<Company[]>(['companies'])",
    );
  });

  it('rolls the snapshot back on mutation error', () => {
    expect(useShiftSource).toMatch(/onError:\s*\(\)\s*=>\s*\{/);
    expect(useShiftSource).toContain(
      "queryClient.setQueryData<Company[]>(['companies'], previousCompanies)",
    );
  });

  it('still reconciles against the server on settle', () => {
    expect(useShiftSource).toMatch(
      /onSettled:[\s\S]*invalidateQueries\(\{ queryKey: \['companies'\] \}\)/,
    );
  });
});
