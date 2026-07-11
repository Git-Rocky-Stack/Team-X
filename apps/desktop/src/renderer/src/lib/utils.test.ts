import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn() custom fontSize class-groups', () => {
  it('keeps a custom text-size alongside a text color (no false conflict)', () => {
    expect(cn('text-caption', 'text-led-go')).toBe('text-caption text-led-go');
    expect(cn('text-eyebrow', 'text-[var(--display-fg-mute)]')).toBe(
      'text-eyebrow text-[var(--display-fg-mute)]',
    );
  });

  it('still collapses two sizes to the later one', () => {
    expect(cn('text-h2', 'text-body')).toBe('text-body');
    expect(cn('text-caption', 'text-xs')).toBe('text-xs');
    expect(cn('text-code-sm', 'text-numeric')).toBe('text-numeric');
  });
});
