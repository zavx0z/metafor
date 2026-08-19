import {describe, expect, test} from "bun:test"
import {playgroundRouteUrl, resolvePlaygroundRoute} from "./router.ts"

const routes = ["editor/scene", "socket/types", "comparison/blender"] as const

describe("PlaygroundRouter pure routing", () => {
  test("preserves full nested path routes", () => {
    expect(resolvePlaygroundRoute(routes, "editor/scene", {pathname: "/socket/types", hash: ""}, {mode: "path"})).toBe("socket/types")
    expect(playgroundRouteUrl("comparison/blender", {mode: "path"})).toBe("/comparison/blender")
  })

  test("preserves full nested hash routes and deterministic fallback", () => {
    expect(resolvePlaygroundRoute(routes, "editor/scene", {pathname: "/", hash: "#/comparison/blender"}, {mode: "hash"})).toBe("comparison/blender")
    expect(resolvePlaygroundRoute(routes, "editor/scene", {pathname: "/missing", hash: ""}, {mode: "path"})).toBe("editor/scene")
    expect(playgroundRouteUrl("socket/types", {mode: "hash"})).toBe("#/socket/types")
  })
})
