import {describe, expect, test} from "bun:test"
import {
  createInputEditState,
  focusInput,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {TextField} from "./TextField.ts"

type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly roundedRects: RoundedRectCall[] = []

  override drawRoundedRect(...args: RoundedRectCall): void {
    this.roundedRects.push(args)
  }

  override pushClip(): void {}
  override popClip(): void {}
  protected render(): void {}
}

describe("component TextField", () => {
  test("forwards exact grouped-cell edge appearance to Elements input", () => {
    const surface = new RecordingSurface()
    focusInput(surface, "grouped-text", createInputEditState("Text"))
    TextField(surface, 0, 0, 100, 22, {
      key: "grouped-text",
      value: "Text",
      appearance: {
        kind: "grouped-cell",
        corners: {topLeft: false, topRight: true, bottomLeft: false, bottomRight: false},
      },
      sx: {borderRadius: 0, borderWidth: 0},
      cursorVisible: false,
    })

    expect(surface.roundedRects).toHaveLength(1)
    expect(surface.roundedRects[0]?.slice(0, 4)).toEqual([0, 0, 100, 22])
    expect(surface.roundedRects[0]?.[4].radius).toEqual({tl: 0, tr: 4, br: 0, bl: 0})
  })
})
