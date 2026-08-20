import {describe, expect, test} from "bun:test"
import {
  type UiSurface,
  UiSurface as BaseUiSurface,
} from "@ui/elements"
import {ListItemButton} from "./List.ts"

type HitCall = Parameters<UiSurface["hit"]>

class RecordingSurface extends BaseUiSurface {
  readonly hits: HitCall[] = []
  override hit(...args: HitCall): void { this.hits.push(args) }
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
})
