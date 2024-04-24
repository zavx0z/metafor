import { browser } from "$app/environment"


type varColor =
  "--color-primary-50" |
  "--color-primary-100" |
  "--color-primary-200" |
  "--color-primary-300" |
  "--color-primary-400" |
  "--color-primary-500" |
  "--color-primary-600" |
  "--color-primary-700" |
  "--color-primary-800" |
  "--color-primary-900" |
  "--color-secondary-50" |
  "--color-secondary-100" |
  "--color-secondary-200" |
  "--color-secondary-300" |
  "--color-secondary-400" |
  "--color-secondary-500" |
  "--color-secondary-600" |
  "--color-secondary-700" |
  "--color-secondary-800" |
  "--color-secondary-900" |
  "--color-tertiary-50" |
  "--color-tertiary-100" |
  "--color-tertiary-200" |
  "--color-tertiary-300" |
  "--color-tertiary-400" |
  "--color-tertiary-500" |
  "--color-tertiary-600" |
  "--color-tertiary-700" |
  "--color-tertiary-800" |
  "--color-tertiary-900" |
  "--color-success-50" |
  "--color-success-100" |
  "--color-success-200" |
  "--color-success-300" |
  "--color-success-400" |
  "--color-success-500" |
  "--color-success-600" |
  "--color-success-700" |
  "--color-success-800" |
  "--color-success-900" |
  "--color-warning-50" |
  "--color-warning-100" |
  "--color-warning-200" |
  "--color-warning-300" |
  "--color-warning-400" |
  "--color-warning-500" |
  "--color-warning-600" |
  "--color-warning-700" |
  "--color-warning-800" |
  "--color-warning-900" |
  "--color-error-50" |
  "--color-error-100" |
  "--color-error-200" |
  "--color-error-300" |
  "--color-error-400" |
  "--color-error-500" |
  "--color-error-600" |
  "--color-error-700" |
  "--color-error-800" |
  "--color-error-900" |
  "--color-surface-50" |
  "--color-surface-100" |
  "--color-surface-200" |
  "--color-surface-300" |
  "--color-surface-400" |
  "--color-surface-500" |
  "--color-surface-600" |
  "--color-surface-700" |
  "--color-surface-800" |
  "--color-surface-900"
export const themeColorRGB = (varColor: varColor): string => (browser ? `rgb(${window.getComputedStyle(document.body).getPropertyValue(varColor).replaceAll(" ", ", ")})` : "")
export const themeColorHEX = (varColor: varColor): string => {
  if (!browser) return ""
  const rgb = window
    .getComputedStyle(document.body)
    .getPropertyValue(varColor)
    .split(" ")
    .map((i) => parseInt(i))
  const hex = "#" + ((1 << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]).toString(16).slice(1)
  return hex
}
