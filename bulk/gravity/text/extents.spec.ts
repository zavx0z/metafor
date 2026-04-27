import { describe, expect, test } from "bun:test"
import { resolveTextExtents } from "./extents"
import type { FontMetrics } from "./font-metrics"

const FONT: FontMetrics = {
  unitsPerEm: 1000,
  ascent: 800,
  descent: 200,
  lineGap: 0,
}

const positionsFromXY = (pairs: Array<[number, number]>): Float32Array => {
  const arr = new Float32Array(pairs.length * 3)
  pairs.forEach(([x, y], i) => {
    arr[i * 3] = x
    arr[i * 3 + 1] = y
    arr[i * 3 + 2] = 0
  })
  return arr
}

describe("bulk/gravity/text/extents", () => {
  test("ширина берётся из bbox позиций, центр — середина", () => {
    const positions = positionsFromXY([
      [0, 0],
      [100, 0],
      [50, 50],
    ])
    const extents = resolveTextExtents(positions, FONT, 100)
    expect(extents.widthMm).toBeCloseTo(100, 6)
    expect(extents.centerXmm).toBeCloseTo(50, 6)
    expect(extents.minXmm).toBeCloseTo(0, 6)
  })

  test("ascender/descender масштабируются от fontSize через unitsPerEm", () => {
    const positions = positionsFromXY([[0, 0]])
    const fontSize = 100
    const extents = resolveTextExtents(positions, FONT, fontSize)
    const emScale = fontSize / FONT.unitsPerEm
    expect(extents.ascenderMm).toBeCloseTo(FONT.ascent * emScale, 6)
    expect(extents.descenderMm).toBeCloseTo(FONT.descent * emScale, 6)
  })

  test("ascender/descender стабильны между строками одного font-size", () => {
    // Важно: реальные positions для 'abc' и 'fuzzy' имели бы разный minY/maxY (bbox).
    // В новой реализации ascender/descender берутся из font metrics, не из per-string bbox,
    // поэтому для любого текста при одинаковом fontSize они одинаковые.
    const abc = resolveTextExtents(positionsFromXY([[0, 0], [80, 0]]), FONT, 100)
    const fuzzy = resolveTextExtents(positionsFromXY([[0, 0], [200, 0]]), FONT, 100)
    expect(abc.ascenderMm).toBeCloseTo(fuzzy.ascenderMm, 6)
    expect(abc.descenderMm).toBeCloseTo(fuzzy.descenderMm, 6)
    // Ширина, наоборот, отражает реальный bbox.
    expect(fuzzy.widthMm).toBeGreaterThan(abc.widthMm)
  })

  test("пустой массив позиций даёт нулевые размеры", () => {
    const extents = resolveTextExtents(new Float32Array(0), FONT, 100)
    expect(extents.widthMm).toBe(0)
    expect(extents.centerXmm).toBe(0)
    expect(extents.ascenderMm).toBeCloseTo(FONT.ascent * (100 / FONT.unitsPerEm), 6)
  })
})
