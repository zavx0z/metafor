import {describe, expect, test} from "bun:test"
import {NODE_SYSTEM_CONNECTION_TYPES, nodeSystemConnectionColor} from "./connection-color.ts"

describe("node-system connection colors", () => {
  test("depends only on the semantic connection type", () => {
    const ipc = nodeSystemConnectionColor("ipc")
    expect(nodeSystemConnectionColor("ipc")).toEqual(ipc)
    expect(nodeSystemConnectionColor("websocket")).not.toEqual(ipc)
    expect(nodeSystemConnectionColor("service-worker-api")).not.toEqual(ipc)
  })

  test("keeps every built-in connection family visually distinct", () => {
    const colors = NODE_SYSTEM_CONNECTION_TYPES.map((connectionType) => {
      const {r, g, b} = nodeSystemConnectionColor(connectionType)
      return `${r}:${g}:${b}`
    })
    expect(new Set(colors).size).toBe(NODE_SYSTEM_CONNECTION_TYPES.length)
  })

  test("gives unknown producer families a deterministic distinct fallback", () => {
    expect(nodeSystemConnectionColor("custom-a")).toEqual(nodeSystemConnectionColor("custom-a"))
    expect(nodeSystemConnectionColor("custom-a")).not.toEqual(nodeSystemConnectionColor("custom-b"))
  })
})
