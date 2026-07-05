import type { TrueTypeFont } from "@metafor/engine"
import type { FontMetrics } from "@metafor/types/bulk/layout"

/** Извлекает метрики шрифта из загруженного {@link TrueTypeFont}. */
export const getFontMetrics = (font: TrueTypeFont): FontMetrics => ({
  unitsPerEm: font.unitsPerEm,
  ascent: font.ascent,
  descent: font.descent,
  lineGap: font.lineGap,
})
