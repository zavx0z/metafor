import {describe, expect, test} from "bun:test"
import {
  dismissOtherSurfaceLayers,
  type UiSurfaceNode,
} from "./runtime.ts"

const surface = (events: string[], name: string): UiSurfaceNode => ({
  node: {} as UiSurfaceNode["node"],
  attachCanvas() {},
  setRect() {},
  dismissTopLayer(reason) {
    events.push(`${name}:${reason}`)
    return true
  },
})

describe("UiRuntime popover dispatch", () => {
  test("dismisses every other Surface once and preserves the pointer target", () => {
    const events: string[] = []
    const first = surface(events, "first")
    const second = surface(events, "second")
    const duplicateFirst = {surface: first}
    dismissOtherSurfaceLayers([
      duplicateFirst,
      {surface: first},
      {surface: second},
    ], second)

    expect(events).toEqual(["first:outside"])
  })

  test("dismisses all Surface layers when pointer misses the runtime", () => {
    const events: string[] = []
    const first = surface(events, "first")
    const second = surface(events, "second")
    dismissOtherSurfaceLayers([{surface: first}, {surface: second}])

    expect(events).toEqual(["first:outside", "second:outside"])
  })

  test("routes mouse and touch Surface targets through the same chain-aware helper", async () => {
    const source = await Bun.file(new URL("./runtime.ts", import.meta.url)).text()
    expect(source.match(/dismissOtherSurfaceLayers\(this\.#surfaces, slot\.surface\)/g)).toHaveLength(2)
    expect(source.match(/dismissOtherSurfaceLayers\(this\.#surfaces\)/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
