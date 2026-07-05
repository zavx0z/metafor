import { Color } from "@metafor/engine"
import type { SurfaceArcLimits } from "@bulk/gravity/text/fit"

/**
 * Палитра, времена анимации и геометрические лимиты viewport-а.
 *
 * Чистые константы без runtime-зависимостей. Логически принадлежат `bulk/web/index.ts`,
 * вынесены сюда чтобы держать главный entry-файл сжатым.
 */

export const ROOT_BACKGROUND = new Color(0.035, 0.05, 0.075)
export const THEME_PRIMARY = new Color(135 / 255, 206 / 255, 235 / 255)
export const THEME_PRIMARY_GLOW = new Color(225 / 255, 243 / 255, 250 / 255, 0.14)
export const THEME_SECONDARY = new Color(71 / 255, 189 / 255, 116 / 255)
export const THEME_SECONDARY_GLOW = new Color(209 / 255, 239 / 255, 220 / 255, 0.12)
export const THEME_TERTIARY = new Color(191 / 255, 200 / 255, 209 / 255)
export const THEME_TERTIARY_GLOW = new Color(229 / 255, 233 / 255, 237 / 255, 0.12)
export const THEME_WARNING = new Color(255 / 255, 209 / 255, 117 / 255)
export const THEME_WARNING_GLOW = new Color(255 / 255, 244 / 255, 221 / 255, 0.12)

export const HOVER_PRIORITY_HYSTERESIS_PX = 2.5
export const HOVER_PICK_HIT_PADDING_MM = 10
export const HOVER_RETENTION_HIT_PADDING_MM = 14

export const INPUT_RENDER_WAKE_MS = 180
export const SCENE_TRANSITION_WAKE_MS = 420
export const POSITION_SMOOTHING_MS = 120
export const SCALE_SMOOTHING_MS = 140
export const REMOVAL_FADE_MS = 150
export const REMOVAL_SCALE_MULTIPLIER = 0.9
export const LABEL_FADE_IN_MS = 120
export const LABEL_INITIAL_SCALE = 0.94

export const SURFACE_ARC_LIMITS: SurfaceArcLimits = {
  horizontalRad: Math.PI * 0.8,
}

export const MIN_SURFACE_LABEL_FIT_SCALE = 0.12

export const FOCUS_FLIGHT_MS = 1000
