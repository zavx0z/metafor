import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {drawIcon} from "./icon.ts"
import {UiSurface} from "./surface.ts"

type ImageCall = Parameters<UiSurface["drawImage"]>

class RecordingSurface extends UiSurface {
  readonly images: ImageCall[] = []
  override drawImage(...args: ImageCall): void { this.images.push(args) }
  protected render(): void {}
}

describe("icon image tint", () => {
  test("forwards an optional generic tint without changing the neutral default", () => {
    const surface = new RecordingSurface()
    drawIcon(surface, "icon.svg", 1, 2, 12)
    expect(surface.images[0]![5]!.tint).toBeUndefined()

    const tint = new Color(0.25, 0.5, 0.75, 0.4)
    drawIcon(surface, "icon.svg", 1, 2, 12, {tint})
    expect(surface.images[1]![5]!.tint).toBe(tint)
  })
})
