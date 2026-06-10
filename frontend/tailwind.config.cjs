module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#8b5cf6',
        secondary: '#d946ef',
        surface: '#0b0712',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(139, 92, 246, 0.55)',
        'glow-sm': '0 0 24px -8px rgba(139, 92, 246, 0.45)',
      },
      borderColor: {
        DEFAULT: 'rgba(255, 255, 255, 0.12)',
      },
    },
  },
  plugins: [],
};
