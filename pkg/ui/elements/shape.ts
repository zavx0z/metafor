/**
 * One package-owned set of visible UI geometry metrics.
 *
 * Measurement provenance is the Blender 4.5.5 parameter inventory at catalog
 * revision `62bf479`. Measurements below are exact flat-color spans in the
 * source images, not their 180 px CSS presentation in the catalog table:
 *
 * - scalar 203×92: header 172×24, control fill 146×23;
 * - enum 200×230: header 168×23, selector fills 144×22 and 144×23;
 * - vector 203×142: header 172×23, joined row fills 23/23/24 high;
 * - path 203×150: header 172×24, field fills 23 and 22 high, action slot 24;
 * - reference 269×157: header 227×31, control fill 193×31 at its larger scale;
 * - collection 201×151: header 171×24, path fill 121×22, action slot 26;
 * - color 200×253: header 168×23, value-bar fill 144×22.
 *
 * The screenshots consistently show one-pixel rules, low-radius corners,
 * contiguous or tightly spaced rows and adjacent actions. Source pixels are
 * not treated as local scene units: this mapping retains the already verified
 * Node compact rhythm (22-high controls, 24-high rows/header, 3-unit radius and
 * gap and 11-unit project font) while giving every UI consumer one immutable
 * owner. The 14-unit glyph is a chosen local mapping inside the 22-unit control,
 * not an exact source-image span. Palette and typography assets remain separate
 * theme concerns.
 */
export type UiShapeMetrics = Readonly<{
  controlHeight: number
  rowHeight: number
  lowRadius: number
  borderWidth: number
  separatorWidth: number
  tightGap: number
  iconActionSlot: number
  iconGlyphSize: number
  compactFontPx: number
  panelHeaderHeight: number
  panelSectionGap: number
}>

export const uiShapeMetrics: UiShapeMetrics = Object.freeze({
  controlHeight: 22,
  rowHeight: 24,
  lowRadius: 3,
  borderWidth: 1,
  separatorWidth: 1,
  tightGap: 3,
  iconActionSlot: 22,
  iconGlyphSize: 14,
  compactFontPx: 11,
  panelHeaderHeight: 24,
  panelSectionGap: 3,
})
