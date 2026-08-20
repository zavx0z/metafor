import {describe, expect, test} from "bun:test"
import {
  blenderRgba8ToColor,
  resolveWidgetColors,
  uiShapeMetrics,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {Color} from "@metafor/engine"
import {Button} from "./Button.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>
type CenteredTextCall = Parameters<UiSurface["drawTextCentered"]>
type HitCall = Parameters<UiSurface["hit"]>
type ImageCall = Parameters<UiSurface["drawImage"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []
  readonly hits: HitCall[] = []
  readonly images: ImageCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawTextCentered(...args: CenteredTextCall): number { this.centeredTexts.push(args); return 0 }
  override hit(...args: HitCall): void { this.hits.push(args) }
  override drawImage(...args: ImageCall): void { this.images.push(args) }
  protected render(): void {}
}

describe("component Button Elements boundary", () => {
  test("delegates default visible shape and ordinary label placement to Elements", () => {
    const surface = new RecordingSurface()
    Button(surface, 10, 20, 100, 40, {children: "Run"})

    const [x, y, width, height, chrome] = surface.roundedRects[0]!
    expect({x, y, width, height, radius: chrome.radius, borderWidth: chrome.borderWidth}).toEqual({
      x: 10,
      y: 29,
      width: 100,
      height: uiShapeMetrics.controlHeight,
      radius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
    })
    expect(surface.centeredTexts[0]?.slice(0, 3)).toEqual(["Run", 60, 40])
    expect(surface.centeredTexts[0]?.[3]).toMatchObject({fontPx: uiShapeMetrics.compactFontPx})
  })

  test("preserves explicit radius and font overrides", () => {
    const surface = new RecordingSurface()
    Button(surface, 10, 20, 100, 40, {children: "Run", radius: 8, fontPx: 13})
    expect(surface.roundedRects[0]?.[4].radius).toBe(8)
    expect(surface.centeredTexts[0]?.[3].fontPx).toBe(13)
  })

  test("forwards size to the complete Elements geometry instead of font alone", () => {
    const expectations = {
      small: {y: 31, height: 18, fontPx: 10, radius: 3},
      medium: {y: 29, height: 22, fontPx: 11, radius: 4},
      large: {y: 26, height: 28, fontPx: 14, radius: 5},
    } as const

    for (const [size, expected] of Object.entries(expectations)) {
      const surface = new RecordingSurface()
      Button(surface, 10, 20, 100, 40, {children: "Run", size: size as keyof typeof expectations})
      expect(surface.roundedRects[0]?.slice(0, 4)).toEqual([10, expected.y, 100, expected.height])
      expect(surface.roundedRects[0]?.[4].radius).toBe(expected.radius)
      expect(surface.centeredTexts[0]?.[3].fontPx).toBe(expected.fontPx)
      expect(surface.hits[0]?.slice(0, 4)).toEqual([10, expected.y, 100, expected.height])
    }
  })

  test("keeps explicit Component geometry overrides stronger than the size tier", () => {
    const surface = new RecordingSurface()
    Button(surface, 10, 20, 100, 40, {
      children: "Run",
      size: "small",
      fontPx: 13,
      radius: 8,
      sx: {height: 30, paddingX: 12, borderWidth: 2},
    })
    expect(surface.roundedRects[0]?.slice(0, 4)).toEqual([10, 25, 100, 30])
    expect(surface.roundedRects[0]?.[4]).toMatchObject({radius: 8, borderWidth: 2})
    expect(surface.centeredTexts[0]?.[3]).toMatchObject({fontPx: 13, maxWidthPx: 76})
    expect(surface.hits[0]?.slice(0, 4)).toEqual([10, 25, 100, 30])
  })

  test("uses the tier icon geometry and preserves an explicit icon-size override", () => {
    for (const [size, iconPx] of [["small", 12], ["medium", 14], ["large", 18]] as const) {
      const surface = new RecordingSurface()
      Button(surface, 10, 20, 100, 40, {label: "Icon", iconSrc: "icon", iconOnly: true, size})
      expect(surface.images[0]?.slice(3, 5)).toEqual([iconPx, iconPx])
    }

    const explicit = new RecordingSurface()
    Button(explicit, 10, 20, 100, 40, {
      label: "Icon",
      iconSrc: "icon",
      iconOnly: true,
      size: "small",
      iconSizePx: 16,
    })
    expect(explicit.images[0]?.slice(3, 5)).toEqual([16, 16])
  })

  test("does not reserve an icon slot for text-material-only content", () => {
    const surface = new RecordingSurface()
    Button(surface, 10, 20, 100, 40, {children: "Run", textMaterial: surface.materials.cyan})
    expect(surface.centeredTexts[0]?.slice(0, 3)).toEqual(["Run", 60, 40])
    expect(surface.centeredTexts[0]?.[3].material).toBe(surface.materials.cyan)
  })

  test("keeps variants and semantic compatibility props outside state-color ownership", () => {
    for (const variant of ["outlined", "contained"] as const) {
      const neutral = new RecordingSurface()
      Button(neutral, 0, 0, 100, 22, {children: "Run", color: "neutral", variant})
      expect(neutral.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(resolveWidgetColors("regular").outline))

      const semantic = new RecordingSurface()
      Button(semantic, 0, 0, 100, 22, {children: "Run", color: "success", variant})
      expect(semantic.roundedRects[0]?.[4]).toEqual(neutral.roundedRects[0]?.[4])
    }

    class HoverSurface extends RecordingSurface {
      override hitState(): {hovered: boolean; pressed: boolean} {
        return {hovered: true, pressed: false}
      }
    }
    const hover = new HoverSurface()
    Button(hover, 0, 0, 100, 22, {children: "Run", color: "neutral", variant: "contained"})
    expect(hover.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(
      resolveWidgetColors("regular", {hovered: true}).outline,
    ))
  })

  test("maps selected and explicit generic appearances while preserving caller colors", () => {
    const selected = new RecordingSurface()
    Button(selected, 0, 0, 100, 22, {children: "Run", selected: true})
    expect(selected.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(
      resolveWidgetColors("toggle", {selected: true}).inner,
    ))

    for (const [appearance, kind] of [["tool", "tool"], ["toolbar-item", "toolbarItem"], ["tab", "tab"]] as const) {
      const surface = new RecordingSurface()
      Button(surface, 0, 0, 100, 22, {children: "Run", appearance})
      expect(surface.roundedRects[0]?.[4].fill).toEqual(blenderRgba8ToColor(resolveWidgetColors(kind).inner))
    }

    const fill = new Color(0.1, 0.2, 0.3, 0.4)
    const border = new Color(0.5, 0.6, 0.7, 0.8)
    const explicit = new RecordingSurface()
    Button(explicit, 0, 0, 100, 22, {children: "Run", fill, border, selected: true})
    expect(explicit.roundedRects[0]?.[4]).toMatchObject({fill, border})
  })

  test("forwards the generic grouped-cell mask to Elements", () => {
    const surface = new RecordingSurface()
    Button(surface, 10, 20, 100, 40, {
      children: "Grouped",
      groupedCell: {
        kind: "grouped-cell",
        corners: {topLeft: true, topRight: false, bottomLeft: true, bottomRight: false},
      },
    })
    expect(surface.roundedRects[0]?.slice(0, 4)).toEqual([10, 20, 100, 40])
    expect(surface.roundedRects[0]?.[4].radius).toEqual({tl: 4, tr: 0, br: 0, bl: 4})
  })
})
