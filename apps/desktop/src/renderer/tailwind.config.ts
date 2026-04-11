import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

/**
 * Tailwind config for the Team-X renderer.
 *
 * Two color systems live side-by-side here:
 *
 *   1. shadcn/ui token layer — every color is an HSL CSS variable
 *      defined in `src/styles/globals.css` under `:root` / `.dark`.
 *      Components installed via `npx shadcn add` reference utilities
 *      like `bg-primary`, `text-foreground`, `border-border`, so these
 *      MUST exist in the theme or Tailwind's JIT will bail.
 *
 *   2. Strategia brand extensions — `brand-*` and `surface-*` palettes
 *      for the occasional hand-rolled component that wants the exact
 *      Strategia red (#AA2024) or a specific near-black surface shade
 *      without going through the CSS-variable layer.
 *
 * Keeping both means: shadcn components "just work" via tokens, and
 * Strategia-branded hand-rolled UI can reach for `brand-500` directly.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // shadcn/ui token layer (CSS variables defined in globals.css)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // Strategia brand palette (used alongside the token layer)
        brand: {
          DEFAULT: '#AA2024',
          50: '#fef2f2',
          100: '#fee2e3',
          200: '#fecacc',
          300: '#fba6a9',
          400: '#f67278',
          500: '#AA2024',
          600: '#991b1e',
          700: '#8a0e18',
          800: '#6d1115',
          900: '#5c1317',
        },
        surface: {
          DEFAULT: '#0a0a0a',
          50: '#171717',
          100: '#1e1e1e',
          200: '#262626',
          300: '#333333',
          400: '#444444',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'monospace'],
      },
      spacing: {
        18: '4.5rem',
        88: '22rem',
        120: '30rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [typography],
} satisfies Config;
