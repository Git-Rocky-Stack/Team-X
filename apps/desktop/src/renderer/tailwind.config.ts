import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'monospace'],
      },
      spacing: {
        18: '4.5rem',
        88: '22rem',
        120: '30rem',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config;
