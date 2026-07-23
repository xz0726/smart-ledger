/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1',
        'primary-light': '#818cf8',
        'primary-dark': '#4f46e5',
        danger: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b',
        bg: '#f8fafc',
        card: '#ffffff',
        text: '#1e293b',
        'text-secondary': '#64748b',
        border: '#e2e8f0',
      },
    },
  },
  plugins: [],
};