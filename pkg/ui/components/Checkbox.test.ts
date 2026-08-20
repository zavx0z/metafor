import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {
  UiSurface,
  blenderRgba8ToColor,
  resolveWidgetColors,
  type UiSurface as UiSurfaceType,
} from "@ui/elements"
import {Checkbox} from "./Checkbox.ts"

type RoundedRectCall = Parameters<UiSurfaceType["drawRoundedRect"]>
type ImageCall = Parameters<UiSurfaceType["drawImage"]>

class RecordingSurface extends UiSurface {
  readonly roundedRects: RoundedRectCall[] = []
  readonly images: ImageCall[] = []
  state = {hovered: false, pressed: false}
  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  override drawImage(...args: ImageCall): void { this.images.push(args) }
  override hitState(): {hovered: boolean; pressed: boolean} { return {...this.state} }
  protected render(): void {}
}

describe("Checkbox Blender option", () => {
  test("maps unchecked, checked, hover, pressed and disabled with exact item tint", () => {
    for (const entry of [
      {state: {hovered: false, pressed: false}, checked: false, disabled: false},
      {state: {hovered: true, pressed: false}, checked: false, disabled: false},
      {state: {hovered: true, pressed: true}, checked: false, disabled: false},
      {state: {hovered: true, pressed: false}, checked: true, disabled: false},
      {state: {hovered: false, pressed: false}, checked: true, disabled: true},
    ]) {
      const surface = new RecordingSurface()
      surface.state = entry.state
      Checkbox(surface, 0, 0, 22, 22, {checked: entry.checked, disabled: entry.disabled})
      const colors = resolveWidgetColors("option", {
        ...entry.state,
        selected: entry.checked,
        disabled: entry.disabled,
      })
      expect(surface.roundedRects.at(-1)?.[4]).toMatchObject({
        fill: blenderRgba8ToColor(colors.inner),
        border: blenderRgba8ToColor(colors.outline),
      })
      if (entry.checked) expect(surface.images[0]![5]!.tint).toEqual(blenderRgba8ToColor(colors.item))
    }
  })

  test("keeps explicit caller fill and border stronger", () => {
    const fill = new Color(0.1, 0.2, 0.3, 0.4)
    const border = new Color(0.5, 0.6, 0.7, 0.8)
    const surface = new RecordingSurface()
    Checkbox(surface, 0, 0, 22, 22, {sx: {background: fill, borderColor: border}})
    expect(surface.roundedRects.at(-1)?.[4]).toMatchObject({fill, border})
  })
})
