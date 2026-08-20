import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {drawGroupedCellChrome, type GroupedCellAppearance} from "./grouped-cell.ts"
import type {StyleProps} from "./style.ts"
import {UiSurface as BaseUiSurface, type UiSurface} from "./surface.ts"
import {palette} from "./theme.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  protected render(): void {}
}

const appearance: GroupedCellAppearance = Object.freeze({
  kind: "grouped-cell",
  corners: Object.freeze({topLeft: true, topRight: false, bottomLeft: true, bottomRight: false}),
})

const draw = (style: StyleProps): RecordingSurface => {
  const surface = new RecordingSurface()
  drawGroupedCellChrome(surface, {x: 10, y: 20, width: 100, height: 40}, style, appearance)
  return surface
}

describe("grouped-cell chrome background ownership", () => {
  test("keeps an omitted background transparent instead of inheriting the glass default", () => {
    expect(draw({}).roundedRects).toHaveLength(0)
    expect(draw({borderWidth: 0}).roundedRects).toHaveLength(0)
  })

  test("preserves explicit null background and null border", () => {
    expect(draw({background: null, borderColor: null}).roundedRects).toHaveLength(0)
    expect(draw({backgroundColor: null, borderColor: null}).roundedRects).toHaveLength(0)
  })

  test("draws an explicit background without inventing a border", () => {
    const surface = draw({background: "bgHot", borderColor: null})
    expect(surface.roundedRects).toHaveLength(1)
    expect(surface.roundedRects[0]?.[4]).toMatchObject({fill: palette.bgHot, border: null, borderWidth: 0})
  })

  test("gives explicit backgroundColor precedence over background", () => {
    const surface = draw({background: "bgHot", backgroundColor: "green", borderColor: null})
    expect(surface.roundedRects[0]?.[4].fill).toEqual(palette.green)
  })

  test("draws border-only chrome with a transparent fill", () => {
    const surface = draw({borderColor: "cyan", borderWidth: 2})
    expect(surface.roundedRects).toHaveLength(1)
    expect(surface.roundedRects[0]?.[4]).toMatchObject({fill: null, border: palette.cyan, borderWidth: 2})
    expect(surface.roundedRects[0]?.[4].fill).not.toEqual(new Color(1, 1, 1, 1))
  })
})
