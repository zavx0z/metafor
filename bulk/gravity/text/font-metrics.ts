import type { TrueTypeFont } from "@metafor/engine"

/**
 * Типографские метрики шрифта в em-единицах.
 *
 * `descent` — положительная глубина descender-а, в отличие от знаковой семантики `hhea.descent` в TTF.
 * Это единое соглашение проекта для расчёта арок ниже baseline.
 */
export interface FontMetrics {
  unitsPerEm: number
  ascent: number
  descent: number
  lineGap: number
}

/** Извлекает метрики шрифта из загруженного {@link TrueTypeFont}. */
export const getFontMetrics = (font: TrueTypeFont): FontMetrics => ({
  unitsPerEm: font.unitsPerEm,
  ascent: font.ascent,
  descent: font.descent,
  lineGap: font.lineGap,
})
