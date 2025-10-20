/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
    './public/**/*.html',
  ],
  theme: {
    extend: {
      // Add semantic colours used by @apply bg-background text-foreground
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // Brand palette — Option A (fresh cyan)
        brand: {
          cyan: {
            50:  '#ECFEFF',
            100: '#CFFAFE',
            200: '#A5F3FC',
            300: '#67E8F9', // glow / light accents
            400: '#22D3EE', // primary
            500: '#06B6D4', // hover / depth
            600: '#0891B2',
            700: '#0E7490',
            800: '#155E75',
            900: '#164E63',
          },
        },
      },
      boxShadow: {
        'brand-md': '0 8px 24px 0 rgba(34, 211, 238, 0.15)',
        'brand-lg': '0 12px 32px 0 rgba(34, 211, 238, 0.22)',
      },
      backgroundImage: {
        'gradient-brand':
          'linear-gradient(90deg, rgba(34,211,238,1) 0%, rgba(103,232,249,1) 100%)',
      },
      keyframes: {
        // Tiny status dot
        'pulse-cyan': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.4', transform: 'scale(.92)' },
        },
        // Skeleton shimmer
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-cyan': 'pulse-cyan 1.2s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      ringColor: {
        DEFAULT: 'rgba(34, 211, 238, 0.6)',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities, addVariant, theme }) {
      // gradient text utility using brand cyan
      const gradientText = {
        '.text-gradient-brand': {
          backgroundImage: theme('backgroundImage.gradient-brand'),
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        },
      };

      // selection variant (e.g., `selection:bg-brand-cyan-300`)
      addVariant('selection', '&::selection');

      // glow utility (soft outer glow for borders/cards)
      const glow = {
        '.glow-brand': {
          boxShadow: theme('boxShadow.brand-md'),
        },
        '.glow-brand-lg': {
          boxShadow: theme('boxShadow.brand-lg'),
        },
      };

      addUtilities(gradientText);
      addUtilities(glow);
    }),
  ],
};