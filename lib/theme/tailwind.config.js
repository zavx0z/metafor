export default {
  plugins: [
  ],
  content: [
    "../../lib/*/src/**/*.{html,js,svelte,ts}",
    "../../module/*/src/**/*.{html,js,svelte,ts}",
    "../../desktop/*/src/**/*.{html,js,svelte,ts}",
    "../../web/*/src/**/*.{html,js,svelte,ts}",
  ],
  theme: {
    fontFamily: {
      botswork: '"Russo One"',
    },
    extend: {
      colors: {
        surface: {
          50: "rgb(var(--color-surface-50) / <alpha-value>)",
          100: "rgb(var(--color-surface-100) / <alpha-value>)",
          200: "rgb(var(--color-surface-200) / <alpha-value>)",
          300: "rgb(var(--color-surface-300) / <alpha-value>)",
          400: "rgb(var(--color-surface-400) / <alpha-value>)",
          500: "rgb(var(--color-surface-500) / <alpha-value>)",
          600: "rgb(var(--color-surface-600) / <alpha-value>)",
          700: "rgb(var(--color-surface-700) / <alpha-value>)",
          800: "rgb(var(--color-surface-800) / <alpha-value>)",
          900: "rgb(var(--color-surface-900) / <alpha-value>)"
        },
        primary: {
          50: "rgb(var(--color-primary-50) / <alpha-value>)",
          100: "rgb(var(--color-primary-100) / <alpha-value>)",
          200: "rgb(var(--color-primary-200) / <alpha-value>)",
          300: "rgb(var(--color-primary-300) / <alpha-value>)",
          400: "rgb(var(--color-primary-400) / <alpha-value>)",
          500: "rgb(var(--color-primary-500) / <alpha-value>)",
          600: "rgb(var(--color-primary-600) / <alpha-value>)",
          700: "rgb(var(--color-primary-700) / <alpha-value>)",
          800: "rgb(var(--color-primary-800) / <alpha-value>)",
          900: "rgb(var(--color-primary-900) / <alpha-value>)"
        },
        secondary: {
          50: "rgb(var(--color-secondary-50) / <alpha-value>)",
          100: "rgb(var(--color-secondary-100) / <alpha-value>)",
          200: "rgb(var(--color-secondary-200) / <alpha-value>)",
          300: "rgb(var(--color-secondary-300) / <alpha-value>)",
          400: "rgb(var(--color-secondary-400) / <alpha-value>)",
          500: "rgb(var(--color-secondary-500) / <alpha-value>)",
          600: "rgb(var(--color-secondary-600) / <alpha-value>)",
          700: "rgb(var(--color-secondary-700) / <alpha-value>)",
          800: "rgb(var(--color-secondary-800) / <alpha-value>)",
          900: "rgb(var(--color-secondary-900) / <alpha-value>)"
        },
        tertiary: {
          50: "rgb(var(--color-tertiary-50) / <alpha-value>)",
          100: "rgb(var(--color-tertiary-100) / <alpha-value>)",
          200: "rgb(var(--color-tertiary-200) / <alpha-value>)",
          300: "rgb(var(--color-tertiary-300) / <alpha-value>)",
          400: "rgb(var(--color-tertiary-400) / <alpha-value>)",
          500: "rgb(var(--color-tertiary-500) / <alpha-value>)",
          600: "rgb(var(--color-tertiary-600) / <alpha-value>)",
          700: "rgb(var(--color-tertiary-700) / <alpha-value>)",
          800: "rgb(var(--color-tertiary-800) / <alpha-value>)",
          900: "rgb(var(--color-tertiary-900) / <alpha-value>)"
        },
        success: {
          50: "rgb(var(--color-success-50) / <alpha-value>)",
          100: "rgb(var(--color-success-100) / <alpha-value>)",
          200: "rgb(var(--color-success-200) / <alpha-value>)",
          300: "rgb(var(--color-success-300) / <alpha-value>)",
          400: "rgb(var(--color-success-400) / <alpha-value>)",
          500: "rgb(var(--color-success-500) / <alpha-value>)",
          600: "rgb(var(--color-success-600) / <alpha-value>)",
          700: "rgb(var(--color-success-700) / <alpha-value>)",
          800: "rgb(var(--color-success-800) / <alpha-value>)",
          900: "rgb(var(--color-success-900) / <alpha-value>)"
        },
        warning: {
          50: "rgb(var(--color-warning-50) / <alpha-value>)",
          100: "rgb(var(--color-warning-100) / <alpha-value>)",
          200: "rgb(var(--color-warning-200) / <alpha-value>)",
          300: "rgb(var(--color-warning-300) / <alpha-value>)",
          400: "rgb(var(--color-warning-400) / <alpha-value>)",
          500: "rgb(var(--color-warning-500) / <alpha-value>)",
          600: "rgb(var(--color-warning-600) / <alpha-value>)",
          700: "rgb(var(--color-warning-700) / <alpha-value>)",
          800: "rgb(var(--color-warning-800) / <alpha-value>)",
          900: "rgb(var(--color-warning-900) / <alpha-value>)"
        },
        error: {
          50: "rgb(var(--color-error-50) / <alpha-value>)",
          100: "rgb(var(--color-error-100) / <alpha-value>)",
          200: "rgb(var(--color-error-200) / <alpha-value>)",
          300: "rgb(var(--color-error-300) / <alpha-value>)",
          400: "rgb(var(--color-error-400) / <alpha-value>)",
          500: "rgb(var(--color-error-500) / <alpha-value>)",
          600: "rgb(var(--color-error-600) / <alpha-value>)",
          700: "rgb(var(--color-error-700) / <alpha-value>)",
          800: "rgb(var(--color-error-800) / <alpha-value>)",
          900: "rgb(var(--color-error-900) / <alpha-value>)"
        }
      }
    }
  }
}