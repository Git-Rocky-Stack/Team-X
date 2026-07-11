import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/*
 * The renderer defines semantic fontSize tokens (tailwind.config.ts) and
 * component text classes (globals.css). Stock tailwind-merge cannot tell a
 * custom text-SIZE from a text-COLOR, so `cn('text-caption', 'text-led-go')`
 * silently dropped the size — the recurring "collapsed token" bug class.
 * Registering every semantic text class in the font-size group gives twMerge
 * correct conflict detection: sizes collapse against sizes, never colors.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        // tailwind.config.ts fontSize tokens
        'text-display',
        'text-h1',
        'text-h2',
        'text-h3',
        'text-h4',
        'text-body',
        'text-body-strong',
        'text-body-sm',
        'text-caption',
        'text-label',
        'text-button',
        'text-button-sm',
        'text-menu-item',
        // globals.css component text classes (carry font-family/transform too)
        'text-code',
        'text-code-sm',
        'text-eyebrow',
        'text-eyebrow-sm',
        'text-menu-label',
        'text-numeric',
        'text-numeric-lg',
        'text-placard',
        'text-shortcut',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
