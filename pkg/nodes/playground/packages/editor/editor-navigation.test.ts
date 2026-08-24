import {describe, expect, test} from "bun:test"
import {resolvePlaygroundRoute} from "@ui/playground"
import {
  NODE_EDITOR_PLAYGROUND_BASE_PATH,
  NODE_EDITOR_PLAYGROUND_PATH,
  NODE_EDITOR_PLAYGROUND_READY_MARKER,
  NODE_EDITOR_PLAYGROUND_ROUTE,
  NODE_EDITOR_PLAYGROUND_ROUTE_DECLARATION,
} from "./editor-navigation.ts"

describe("@nodes/editor centralized playground routes", () => {
  test("owns one exact live NodeTree pathname and deterministic fallback", () => {
    expect(NODE_EDITOR_PLAYGROUND_BASE_PATH).toBe("/editor")
    expect(NODE_EDITOR_PLAYGROUND_ROUTE).toBe("live-node-tree")
    expect(NODE_EDITOR_PLAYGROUND_PATH).toBe("/editor/live-node-tree")
    expect(NODE_EDITOR_PLAYGROUND_ROUTE_DECLARATION).toEqual({
      location: "pathname",
      routes: ["live-node-tree"],
      fallback: "live-node-tree",
    })
    expect(resolvePlaygroundRoute(
      NODE_EDITOR_PLAYGROUND_ROUTE_DECLARATION,
      {pathname: "/editor/live-node-tree"},
      {basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH},
    )).toBe(NODE_EDITOR_PLAYGROUND_ROUTE)
    expect(resolvePlaygroundRoute(
      NODE_EDITOR_PLAYGROUND_ROUTE_DECLARATION,
      {pathname: "/unknown"},
      {basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH},
    )).toBe(NODE_EDITOR_PLAYGROUND_ROUTE)
  })

  test("publishes the shared centralized readiness contract", () => {
    expect(NODE_EDITOR_PLAYGROUND_READY_MARKER).toEqual({
      dataset: "nodesPlayground",
      value: "ready",
    })
    expect(Object.isFrozen(NODE_EDITOR_PLAYGROUND_READY_MARKER)).toBeTrue()
  })
})
