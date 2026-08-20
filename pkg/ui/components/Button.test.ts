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

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly centeredTexts: CenteredTextCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawTextCentered(...args: CenteredTextCall): number { this.centeredTexts.push(args); return 0 }
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
