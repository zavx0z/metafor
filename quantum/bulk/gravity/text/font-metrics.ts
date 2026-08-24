import type { TrueTypeFont } from "@engine/core"
import type { FontMetrics } from "@bulk/types/text"

/** Извлекает метрики шрифта из загруженного {@link TrueTypeFont}. */
export const getFontMetrics = (font: TrueTypeFont): FontMetrics => ({
  unitsPerEm: font.unitsPerEm,
  ascent: font.ascent,
  descent: font.descent,
  lineGap: font.lineGap,
})
