import {describe, expect, test} from "bun:test"
import {
  palette,
  uiShapeMetrics,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
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

  test("uses one subtle neutral border owner while keeping semantic and interaction accents", () => {
    for (const variant of ["outlined", "contained"] as const) {
      const neutral = new RecordingSurface()
      Button(neutral, 0, 0, 100, 22, {children: "Run", color: "neutral", variant})
      expect(neutral.roundedRects[0]?.[4].border).toEqual(palette.borderRule)

      const semantic = new RecordingSurface()
      Button(semantic, 0, 0, 100, 22, {children: "Run", color: "success", variant})
      expect(semantic.roundedRects[0]?.[4].border).toEqual(palette.green)
    }

    class HoverSurface extends RecordingSurface {
      override hitState(): {hovered: boolean; pressed: boolean} {
        return {hovered: true, pressed: false}
      }
    }
    const hover = new HoverSurface()
    Button(hover, 0, 0, 100, 22, {children: "Run", color: "neutral", variant: "contained"})
    expect(hover.roundedRects[0]?.[4].border).toEqual(palette.cyan)
  })
})
