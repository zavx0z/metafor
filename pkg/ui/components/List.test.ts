import {describe, expect, test} from "bun:test"
import {
  blenderRgba8ToColor,
  resolveWidgetColors,
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {Color} from "@metafor/engine"
import {ListItemButton} from "./List.ts"

type HitCall = Parameters<UiSurface["hit"]>
type RoundedRectCall = Parameters<UiSurface["drawRoundedRect"]>

class RecordingSurface extends BaseUiSurface {
  readonly hits: HitCall[] = []
  readonly roundedRects: RoundedRectCall[] = []
  override hit(...args: HitCall): void { this.hits.push(args) }
  override drawRoundedRect(...args: RoundedRectCall): void { this.roundedRects.push(args) }
  protected render(): void {}
}

describe("component ListItemButton", () => {
  test("keeps a tooltip-only row non-clickable with the default cursor", () => {
    const surface = new RecordingSurface()
    ListItemButton(surface, 0, 0, 100, 24, {
      primary: "Description",
      tooltip: "Tooltip",
    })

    expect(surface.hits).toHaveLength(1)
    expect(surface.hits[0]?.[5]).toMatchObject({cursor: "default", tooltip: {label: "Tooltip"}})
  })

  test("delegates selected and disabled material state to Elements li", () => {
    const selected = new RecordingSurface()
    ListItemButton(selected, 0, 0, 100, 24, {primary: "Selected", selected: true})
    const selectedColors = resolveWidgetColors("listItem", {selected: true, listItem: true})
    expect(selected.roundedRects[0]?.[4]).toMatchObject({
      fill: blenderRgba8ToColor(selectedColors.inner),
      border: blenderRgba8ToColor(selectedColors.outline),
    })

    const disabled = new RecordingSurface()
    ListItemButton(disabled, 0, 0, 100, 24, {primary: "Disabled", disabled: true, onClick() {}})
    expect(disabled.hits).toHaveLength(0)
  })

  test("preserves explicit row fill and border overrides", () => {
    const fill = new Color(0.1, 0.2, 0.3, 0.4)
    const border = new Color(0.5, 0.6, 0.7, 0.8)
    const surface = new RecordingSurface()
    ListItemButton(surface, 0, 0, 100, 24, {primary: "Explicit", sx: {background: fill, borderColor: border}})
    expect(surface.roundedRects[0]?.[4]).toMatchObject({fill, border})
  })
})
