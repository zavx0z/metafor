import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {button, type ButtonElementLayout} from "./button.ts"
import {uiShapeMetrics} from "./shape.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override drawTextCentered(...args: CenteredTextCall): number {
    this.centeredTexts.push(args)
    return 0
  }

  override hit(...args: HitCall): void {
    this.hits.push(args)
  }

  protected render(): void {}
}

describe("button visible geometry", () => {
  test("uses shared dense defaults inside the caller-owned hit rect", () => {
    const surface = new RecordingSurface()
    button(surface, 10, 20, 100, 40, {children: "Run", onClick() {}})

    const [x, y, width, height, chrome] = surface.roundedRects[0]!
    expect({x, y, width, height}).toEqual({x: 10, y: 29, width: 100, height: uiShapeMetrics.controlHeight})
    expect({radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(surface.centeredTexts[0]?.[3]).toMatchObject({
      fontPx: uiShapeMetrics.compactFontPx,
      maxWidthPx: 100 - uiShapeMetrics.tightGap * 4,
    })
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 100, 40])
  })

  test("preserves explicit height, radius, border, font and padding", () => {
    const surface = new RecordingSurface()
    button(surface, 10, 20, 100, 40, {
      children: "Run",
      style: {height: 30, borderRadius: 8, borderWidth: 2, fontSize: 13, paddingX: 12},
    })

    const [, y, , height, chrome] = surface.roundedRects[0]!
    expect({y, height, radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      y: 25,
      height: 30,
      radius: 8,
      borderWidth: 2,
    })
    expect(surface.centeredTexts[0]?.[3]).toMatchObject({fontPx: 13, maxWidthPx: 76})
  })

  test("gives custom content the Elements-planned visible and padded rects", () => {
    const surface = new RecordingSurface()
    let observed: ButtonElementLayout | undefined
    button(surface, 10, 20, 100, 40, {
      children: (_state, layout) => { observed = layout },
      style: {paddingLeft: 8, paddingRight: 5},
    })

    expect(observed).toEqual({
      chrome: {x: 10, y: 29, width: 100, height: uiShapeMetrics.controlHeight},
      content: {x: 18, y: 29, width: 87, height: uiShapeMetrics.controlHeight},
      fontPx: uiShapeMetrics.compactFontPx,
      iconPx: uiShapeMetrics.iconGlyphSize,
      gap: uiShapeMetrics.tightGap,
    })
  })

  test("clamps the planned glyph inside narrow padded content", () => {
    const surface = new RecordingSurface()
    let observed: ButtonElementLayout | undefined
    button(surface, 0, 0, 20, 22, {
      children: (_state, layout) => { observed = layout },
      style: {paddingX: 8},
    })
    expect(observed?.content.width).toBe(4)
    expect(observed?.iconPx).toBe(4)
  })
})
