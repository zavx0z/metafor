import { describe, expect, test } from "bun:test"
import { resolveLevelLabel } from "./label"
import type { LevelLabelSettings } from "./settings.t"

const BASE: LevelLabelSettings = {
  baseDepth: 0,
  fontSizeMm: 120,
  surfaceOffsetMm: 40,
  visibleLevels: 2,
}

describe("bulk/gravity/level/label", () => {
  test("видимость: строго больше baseDepth и не глубже baseDepth+visibleLevels", () => {
    expect(resolveLevelLabel(0, BASE, 1).isVisible).toBe(false)
    expect(resolveLevelLabel(1, BASE, 1).isVisible).toBe(true)
    expect(resolveLevelLabel(2, BASE, 1).isVisible).toBe(true)
    expect(resolveLevelLabel(3, BASE, 1).isVisible).toBe(false)
  })

  test("baseDepth=-1 допускает показ всех уровней включая root", () => {
    const settings: LevelLabelSettings = { ...BASE, baseDepth: -1, visibleLevels: 4 }
    expect(resolveLevelLabel(0, settings, 1).isVisible).toBe(true)
    expect(resolveLevelLabel(3, settings, 1).isVisible).toBe(true)
    expect(resolveLevelLabel(4, settings, 1).isVisible).toBe(false)
  })

  test("fontSize и offset масштабируются levelScale", () => {
    const scale = 0.5
    const label = resolveLevelLabel(1, BASE, scale)
    expect(label.fontSizeMm).toBeCloseTo(BASE.fontSizeMm * scale, 6)
    expect(label.surfaceOffsetMm).toBeCloseTo(BASE.surfaceOffsetMm * scale, 6)
  })

  test("нулевой/некорректный levelScale заменяется на 1", () => {
    expect(resolveLevelLabel(0, BASE, 0).fontSizeMm).toBeCloseTo(BASE.fontSizeMm, 6)
    expect(resolveLevelLabel(0, BASE, Number.NaN).fontSizeMm).toBeCloseTo(BASE.fontSizeMm, 6)
    expect(resolveLevelLabel(0, BASE, -1).fontSizeMm).toBeCloseTo(BASE.fontSizeMm, 6)
  })
})
