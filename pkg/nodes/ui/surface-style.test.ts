import {describe, expect, test} from "bun:test"
import {palette} from "@ui/elements"
import {nodeSystemConnectionColor} from "./connection-color.ts"
import {nodeSystemNodeBorderColor} from "./surface.ts"

describe("node-system primitive classes", () => {
  test("keeps compound containment chrome distinct from live transport color", () => {
    expect(nodeSystemNodeBorderColor("live", false, true)).toBe(palette.border)
    expect(nodeSystemNodeBorderColor("live", false, false)).toBe(palette.green)
    expect(nodeSystemNodeBorderColor("live", true, true)).toBe(palette.windowActiveBorder)
  })

  test("does not derive socket or edge color from input/output or live state", () => {
    const socketIn = nodeSystemConnectionColor("service-worker-api")
    const socketOut = nodeSystemConnectionColor("service-worker-api")
    const edgeLive = nodeSystemConnectionColor("service-worker-api")
    const edgePaused = nodeSystemConnectionColor("service-worker-api")
    expect(socketIn).toEqual(socketOut)
    expect(edgeLive).toEqual(edgePaused)
    expect(nodeSystemConnectionColor("websocket")).not.toEqual(edgeLive)
  })
})
