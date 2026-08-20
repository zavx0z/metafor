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

    const cornerPatches = surface.roundedRects.filter((call) => call[2] === 8 && call[3] === 8 && call[4].radius === 4)
    expect(cornerPatches.map((call) => call.slice(0, 4))).toEqual([[92, 0, 8, 8]])
  })
})
