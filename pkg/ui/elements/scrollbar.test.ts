import {describe, expect, test} from "bun:test"
import {UiSurface, type UiSurface as UiSurfaceType} from "./surface.ts"
import {blenderRgba8ToColor, resolveScrollbarColors} from "./blender-theme.ts"
import {scrollbar} from "./scrollbar.ts"

type RoundedRectCall = Parameters<UiSurfaceType["drawRoundedRect"]>

class RecordingSurface extends UiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  protected render(): void {}
}

describe("Blender scrollbar material", () => {
  test("resolves transparent outlined track and exact idle/pressed thumb", () => {
    expect(resolveScrollbarColors(false)).toEqual({
      track: [0x22, 0x22, 0x22, 0x00],
      outline: [0x3d, 0x3d, 0x3d, 0xff],
      thumb: [0x54, 0x54, 0x54, 0xff],
    })
    expect(resolveScrollbarColors(true).thumb).toEqual([0x59, 0x59, 0x59, 0xff])
  })

  test("draws raw track and thumb without legacy palette or blue hover", () => {
    for (const pressed of [false, true]) {
      const surface = new RecordingSurface()
      scrollbar(surface, 0, 0, 100, {offset: 20, visible: 50, total: 100, trackWidth: 8, pressed})
      const colors = resolveScrollbarColors(pressed)
      expect(surface.roundedRects).toHaveLength(2)
      expect(surface.roundedRects[0]?.[4]).toMatchObject({
        fill: blenderRgba8ToColor(colors.track),
        border: blenderRgba8ToColor(colors.outline),
        borderWidth: 1,
      })
      expect(surface.roundedRects[1]?.[4]).toMatchObject({
        fill: blenderRgba8ToColor(colors.thumb),
        border: blenderRgba8ToColor(colors.outline),
        borderWidth: 1,
      })
    }
  })
})
