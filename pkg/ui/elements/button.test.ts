import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {button, type ButtonElementLayout} from "./button.ts"
import {uiShapeMetrics} from "./shape.ts"
import {palette} from "./theme.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly hits: HitCall[] = []
  readonly hitRenders: string[] = []

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

  override requestKeyedRender(key: string): void {
    this.hitRenders.push(key)
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
    expect(chrome.border).toEqual(palette.borderRule)
    expect(surface.centeredTexts[0]?.[3]).toMatchObject({
      fontPx: uiShapeMetrics.compactFontPx,
      maxWidthPx: 100 - uiShapeMetrics.tightGap * 4,
    })
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 100, 40])
  })

  test("uses subtle idle border while hover keeps the cyan interaction border", () => {
    const idle = new RecordingSurface()
    button(idle, 0, 0, 100, 22, {children: "Run", onClick() {}})
    expect(idle.roundedRects[0]?.[4].border).toEqual(palette.borderRule)

    class HoverSurface extends RecordingSurface {
      override hitState(): {hovered: boolean; pressed: boolean} {
        return {hovered: true, pressed: false}
      }
    }
    const hover = new HoverSurface()
    button(hover, 0, 0, 100, 22, {children: "Run", onClick() {}})
    expect(hover.roundedRects[0]?.[4].border).toEqual(palette.cyan)
    expect(hover.roundedRects[0]?.[4].fill).toEqual(palette.bgElevated)
    expect(idle.roundedRects[0]?.[4].fill).not.toEqual(hover.roundedRects[0]?.[4].fill)
  })

  test("keeps chrome geometry stable and repeats press/release without a held timer state", () => {
    class StateSurface extends RecordingSurface {
      state = {hovered: false, pressed: false}
      override hitState(): {hovered: boolean; pressed: boolean} {
        return {...this.state}
      }
      clearRecording(): void {
        this.roundedRects.length = 0
        this.centeredTexts.length = 0
        this.hits.length = 0
      }
    }
    const surface = new StateSurface()
    let presses = 0
    let releases = 0
    const render = (): void => button(surface, 10, 20, 100, 40, {
      key: "repeat",
      children: "Run",
      onClick() {},
      onPointerDown: () => { presses += 1 },
      onPointerUp: () => { releases += 1 },
    })

    render()
    const idleRect = surface.roundedRects[0]?.slice(0, 4)
    const firstHit = surface.hits[0]!
    const firstOptions = firstHit[5]
    expect(typeof firstOptions).toBe("object")
    if (typeof firstOptions === "object") {
      firstOptions.onPointerDown?.(0, 0)
      firstOptions.onPointerUp?.()
    }
    surface.clearRecording()
    surface.state = {hovered: true, pressed: true}
    render()
    expect(surface.roundedRects[0]?.slice(0, 4)).toEqual(idleRect)
    expect(surface.roundedRects[0]?.[4].border).toEqual(palette.cyan)
    expect(surface.roundedRects[0]?.[4].fill).toEqual(palette.bgHot)

    surface.clearRecording()
    surface.state = {hovered: false, pressed: false}
    render()
    const secondOptions = surface.hits[0]?.[5]
    if (typeof secondOptions === "object") {
      secondOptions.onPointerDown?.(0, 0)
      secondOptions.onPointerUp?.()
    }
    surface.clearRecording()
    render()

    expect(surface.roundedRects[0]?.slice(0, 4)).toEqual(idleRect)
    expect(surface.roundedRects[0]?.[4].border).toEqual(palette.borderRule)
    expect({presses, releases}).toEqual({presses: 2, releases: 2})
    expect(surface.hitRenders).toEqual(["repeat", "repeat", "repeat", "repeat"])
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
