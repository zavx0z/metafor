import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {
  UiSurface,
  blenderRgba8ToColor,
  blenderTheme,
  resolveWidgetColors,
  type UiSurface as UiSurfaceType,
} from "@ui/elements"
import {Pane} from "./Pane.ts"

type RoundedRectCall = Parameters<UiSurfaceType["drawRoundedRect"]>

class RecordingSurface extends UiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  protected render(): void {}
}

describe("Pane Blender appearance", () => {
  test("maps panel, active panel and box materials", () => {
    const panel = new RecordingSurface()
    Pane(panel, 0, 0, 100, 80, {appearance: "panel"})
    expect(panel.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(blenderTheme.spaceNode.panel.back),
      border: blenderRgba8ToColor(blenderTheme.material.editorOutline),
    })

    const active = new RecordingSurface()
    Pane(active, 0, 0, 100, 80, {appearance: "panel", active: true})
    expect(active.roundedRects[0]?.[4].border).toEqual(blenderRgba8ToColor(blenderTheme.material.editorOutlineActive))

    const box = new RecordingSurface()
    Pane(box, 0, 0, 100, 80, {appearance: "box"})
    const colors = resolveWidgetColors("box")
    expect(box.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(colors.inner),
      border: blenderRgba8ToColor(colors.outline),
    })
  })

  test("keeps explicit fill and border stronger", () => {
    const fill = new Color(0.1, 0.2, 0.3, 0.4)
    const border = new Color(0.5, 0.6, 0.7, 0.8)
    const surface = new RecordingSurface()
    Pane(surface, 0, 0, 100, 80, {appearance: "panel", sx: {background: fill, borderColor: border}})
    expect(surface.roundedRects[0]?.[4]).toMatchObject({fill, border})
  })
})
