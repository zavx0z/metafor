import {describe, expect, test} from "bun:test"
import {resolvePlaygroundRouteTree} from "@ui/playground"
import {
  NODE_EDITOR_PLAYGROUND_BASE_PATH,
  NODE_EDITOR_PLAYGROUND_OVERVIEW_PATH,
  NODE_EDITOR_PLAYGROUND_PATH,
  NODE_EDITOR_PLAYGROUND_READY_MARKER,
  NODE_EDITOR_PLAYGROUND_ROUTE,
  NODE_EDITOR_PLAYGROUND_ROUTE_TREE,
} from "./editor-navigation.ts"

describe("@nodes/editor centralized playground routes", () => {
  test("owns a package overview and one exact live NodeTree leaf", () => {
    expect(NODE_EDITOR_PLAYGROUND_BASE_PATH).toBe("/editor")
    expect(NODE_EDITOR_PLAYGROUND_ROUTE).toBe("live-node-tree")
    expect(NODE_EDITOR_PLAYGROUND_PATH).toBe("/editor/live-node-tree")
    expect(NODE_EDITOR_PLAYGROUND_OVERVIEW_PATH).toBe("/editor/")
    expect(resolvePlaygroundRouteTree(
      NODE_EDITOR_PLAYGROUND_ROUTE_TREE,
      {pathname: "/editor/"},
      {basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH},
    )).toMatchObject({kind: "match", node: {kind: "overview", path: ""}, redirect: false})
    expect(resolvePlaygroundRouteTree(
      NODE_EDITOR_PLAYGROUND_ROUTE_TREE,
      {pathname: "/editor/live-node-tree"},
      {basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH},
    )).toMatchObject({kind: "match", node: {kind: "leaf", path: "live-node-tree"}, redirect: false})
    expect(resolvePlaygroundRouteTree(
      NODE_EDITOR_PLAYGROUND_ROUTE_TREE,
      {pathname: "/editor/unknown"},
      {basePath: NODE_EDITOR_PLAYGROUND_BASE_PATH},
    )).toEqual({kind: "not-found"})
  })

  test("publishes the shared centralized readiness contract", () => {
    expect(NODE_EDITOR_PLAYGROUND_READY_MARKER).toEqual({
      dataset: "nodesPlayground",
      value: "ready",
    })
    expect(Object.isFrozen(NODE_EDITOR_PLAYGROUND_READY_MARKER)).toBeTrue()
  })
})
