import {describe, expect, test} from "bun:test"
import {Color} from "@metafor/engine"
import {palette} from "@ui/elements"
import {defaultNodeSystemConnectionColor} from "./connection-color.ts"
import {NodeSystemSurface, nodeSystemNodeBorderColor} from "./surface.ts"

describe("node-system primitive classes", () => {
  test("keeps compound containment chrome distinct from live transport color", () => {
    expect(nodeSystemNodeBorderColor("live", false, true)).toBe(palette.border)
    expect(nodeSystemNodeBorderColor("live", false, false)).toBe(palette.green)
    expect(nodeSystemNodeBorderColor("live", true, true)).toBe(palette.windowActiveBorder)
  })

  test("does not derive socket or edge color from input/output or live state", () => {
    const socketIn = defaultNodeSystemConnectionColor("request")
    const socketOut = defaultNodeSystemConnectionColor("request")
    const edgeLive = defaultNodeSystemConnectionColor("request")
    const edgePaused = defaultNodeSystemConnectionColor("request")
    expect(socketIn).toEqual(socketOut)
    expect(edgeLive).toEqual(edgePaused)
    expect(defaultNodeSystemConnectionColor("response")).not.toEqual(edgeLive)
  })

  test("accepts a consumer connection color resolver", () => {
    const requested: Array<string | undefined> = []
    const consumerColor = new Color("#123456")
    const surface = new NodeSystemSurface({
      connectionColor(connectionType) {
        requested.push(connectionType)
        return consumerColor
      },
    })
    expect(surface).toBeDefined()
    expect(requested).toEqual([])
  })
})
