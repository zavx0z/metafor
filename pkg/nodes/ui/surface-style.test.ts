import {describe, expect, test} from "bun:test"
import {palette} from "@ui/elements"
import {nodeSystemNodeBorderColor} from "./surface.ts"

describe("node-system primitive classes", () => {
  test("keeps compound containment chrome distinct from live transport color", () => {
    expect(nodeSystemNodeBorderColor("live", false, true)).toBe(palette.border)
    expect(nodeSystemNodeBorderColor("live", false, false)).toBe(palette.green)
    expect(nodeSystemNodeBorderColor("live", true, true)).toBe(palette.windowActiveBorder)
  })
})
