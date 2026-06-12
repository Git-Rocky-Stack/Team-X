import { describe, expect, it } from 'vitest';

import { applyShiftClass, shiftFromTheme, themeFromShift } from './use-shift';

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
