/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0d0d12',
        surface: '#13131a',
        elevated: '#1a1a24',
        border: 'rgba(255,255,255,0.07)',
        foreground: '#e2e2f0',
        muted: '#888899',
        primary: {
          light: '#818cf8',
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
          glow: 'rgba(99,102,241,0.25)',
        },
        accent: {
          DEFAULT: '#8b5cf6',
          light: '#a78bfa',
        },
        card: '#13131a',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#f43f5e',
        info: '#38bdf8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #0d0d12 0%, #13131a 50%, #0d0d12 100%)',
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(99,102,241,0.15)',
        'glow': '0 0 24px rgba(99,102,241,0.2)',
        'glow-lg': '0 0 40px rgba(99,102,241,0.25)',
        'card': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.35s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 1.8s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-subtle': 'bounceSub 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'stagger-1': 'slideUp 0.4s ease-out 0.05s both',
        'stagger-2': 'slideUp 0.4s ease-out 0.1s both',
        'stagger-3': 'slideUp 0.4s ease-out 0.15s both',
        'stagger-4': 'slideUp 0.4s ease-out 0.2s both',
        'scale-in': 'scaleIn 0.3s ease-out',
        'number-pop': 'numberPop 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(14px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(-12px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bounceSub: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(99,102,241,0.15)' },
          '50%': { boxShadow: '0 0 28px rgba(99,102,241,0.35)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        numberPop: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '50%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
