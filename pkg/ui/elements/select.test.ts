import {describe, expect, test} from "bun:test"
import type {UiSurface} from "./surface.ts"
import {UiSurface as BaseUiSurface} from "./surface.ts"
import {select} from "./select.ts"
import {uiShapeMetrics} from "./shape.ts"
import {palette} from "./theme.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type TextCall = Parameters<UiSurface["drawText"]>
type ImageCall = Parameters<UiSurface["drawImage"]>
type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly texts: TextCall[] = []
  readonly images: ImageCall[] = []
  readonly hits: HitCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawText(...args: TextCall): number { this.texts.push(args); return 0 }
  override drawImage(...args: ImageCall): void { this.images.push(args) }
  override hit(...args: HitCall): void { this.hits.push(args) }
  protected render(): void {}
}

class PointerStateSurface extends RecordingSurface {
  constructor(readonly state: Readonly<{hovered: boolean; pressed: boolean}>) { super() }
  override hitState(): {hovered: boolean; pressed: boolean} { return {...this.state} }
}

describe("select element", () => {
  test("owns dense value chrome, left label, chevron and caller hit rect", () => {
    const surface = new RecordingSurface()
    select(surface, 10, 20, 146, 40, {value: "Multiply", onClick() {}})

    const [x, y, width, height, chrome] = surface.roundedRects[0]!
    expect({x, y, width, height, radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      x: 10,
      y: 29,
      width: 146,
      height: uiShapeMetrics.controlHeight,
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(chrome.fill).toEqual(palette.bgInput)
    expect(chrome.border).toEqual(palette.borderDim)
    expect(surface.texts[0]?.slice(0, 3)).toEqual(["Multiply", 16, 34.5])
    expect(surface.texts[0]?.[3]).toMatchObject({fontPx: uiShapeMetrics.compactFontPx, maxWidthPx: 117})
    expect(surface.images[0]?.slice(1, 5)).toEqual([136, 33, uiShapeMetrics.iconGlyphSize, uiShapeMetrics.iconGlyphSize])
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 20, 146, 40])
  })

  test("renders placeholder, active and disabled states without hidden mutation", () => {
    const active = new RecordingSurface()
    select(active, 0, 0, 146, 22, {placeholder: "Choose", active: true, onClick() {}})
    expect(active.texts[0]?.[0]).toBe("Choose")
    expect(active.texts[0]?.[3].material).toBe(active.materials.muted)
    expect(active.roundedRects[0]?.[4].fill).toEqual(palette.bgHot)
    expect(active.roundedRects[0]?.[4].border).toEqual(palette.cyan)

    const disabled = new RecordingSurface()
    select(disabled, 0, 0, 146, 22, {value: "Multiply", disabled: true, onClick() {}})
    expect(disabled.hits).toHaveLength(0)
    expect(disabled.texts[0]?.[3].material).toBe(disabled.materials.muted)
  })

  test("owns hover and pressed visual states", () => {
    const hovered = new PointerStateSurface({hovered: true, pressed: false})
    select(hovered, 0, 0, 146, 22, {value: "Multiply", onClick() {}})
    expect(hovered.roundedRects[0]?.[4].fill).toEqual(palette.bgElevated)
    expect(hovered.roundedRects[0]?.[4].border).toEqual(palette.cyan)

    const pressed = new PointerStateSurface({hovered: true, pressed: true})
    select(pressed, 0, 0, 146, 22, {value: "Multiply", onClick() {}})
    expect(pressed.roundedRects[0]?.[4].fill).toEqual(palette.bgHot)
    expect(pressed.roundedRects[0]?.[4].border).toEqual(palette.cyan)
  })
})
