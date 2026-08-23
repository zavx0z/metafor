import {describe, expect, test} from "bun:test"
import {resolvePlaygroundRoute} from "@ui/playground"
import {
  NODES_PLAYGROUND_PATH,
  NODES_PLAYGROUND_READY_MARKER,
  NODES_PLAYGROUND_ROUTE,
  NODES_PLAYGROUND_ROUTE_DECLARATION,
} from "./routes.ts"

describe("parent nodes playground routes", () => {
  test("owns one exact live NodeTree pathname and deterministic fallback", () => {
    expect(NODES_PLAYGROUND_ROUTE).toBe("node-tree/runtime/live")
    expect(NODES_PLAYGROUND_PATH).toBe("/node-tree/runtime/live")
    expect(NODES_PLAYGROUND_ROUTE_DECLARATION).toEqual({
      location: "pathname",
      routes: ["node-tree/runtime/live"],
      fallback: "node-tree/runtime/live",
    })
    expect(resolvePlaygroundRoute(
      NODES_PLAYGROUND_ROUTE_DECLARATION,
      {pathname: "/node-tree/runtime/live"},
    )).toBe(NODES_PLAYGROUND_ROUTE)
    expect(resolvePlaygroundRoute(
      NODES_PLAYGROUND_ROUTE_DECLARATION,
      {pathname: "/unknown"},
    )).toBe(NODES_PLAYGROUND_ROUTE)
  })

  test("publishes the exact future runtime readiness contract", () => {
    expect(NODES_PLAYGROUND_READY_MARKER).toEqual({
      dataset: "nodesPlayground",
      value: "ready",
    })
    expect(Object.isFrozen(NODES_PLAYGROUND_READY_MARKER)).toBeTrue()
  })
})
