import {describe, expect, test} from "bun:test"
import {definePlaygroundRoutes, playgroundRouteUrl, resolvePlaygroundRoute} from "./router.ts"

const routes = ["editor/scene", "socket/types", "comparison/blender"] as const
const declaration = definePlaygroundRoutes({routes, fallback: "editor/scene"})

describe("PlaygroundRouter pure routing", () => {
  test("hard-codes pathname in the route declaration", () => {
    expect(declaration).toEqual({location: "pathname", routes, fallback: "editor/scene"})
    expect(Object.isFrozen(declaration)).toBeTrue()
    expect(Object.isFrozen(declaration.routes)).toBeTrue()
    expect(resolvePlaygroundRoute(declaration, {pathname: "/socket/types"})).toBe("socket/types")
    expect(playgroundRouteUrl("comparison/blender")).toBe("/comparison/blender")
  })

  test("rejects non-pathname ids and keeps deterministic fallback", () => {
    expect(resolvePlaygroundRoute(declaration, {pathname: "/missing"})).toBe("editor/scene")
    expect(() => definePlaygroundRoutes({routes: ["#/socket/types"] as const, fallback: "#/socket/types"})).toThrow()
    expect(() => definePlaygroundRoutes({routes: ["socket//types"] as const, fallback: "socket//types"})).toThrow()
    expect(() => definePlaygroundRoutes({routes: ["editor/scene", "editor/scene"] as const, fallback: "editor/scene"})).toThrow()
  })
})
