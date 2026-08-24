import {describe, expect, test} from "bun:test"
import {
  PlaygroundRouter,
  definePlaygroundRoutes,
  playgroundRouteUrl,
  resolvePlaygroundRoute,
} from "./router.ts"

const routes = ["editor/scene", "socket/types", "comparison/blender"] as const
const declaration = definePlaygroundRoutes({routes, fallback: "editor/scene"})

describe("PlaygroundRouter pure routing", () => {
  test("keeps root-mounted pathname compatibility when options are omitted", () => {
    expect(declaration).toEqual({location: "pathname", routes, fallback: "editor/scene"})
    expect(Object.isFrozen(declaration)).toBeTrue()
    expect(Object.isFrozen(declaration.routes)).toBeTrue()
    expect(resolvePlaygroundRoute(declaration, {pathname: "/socket/types"})).toBe("socket/types")
    expect(resolvePlaygroundRoute(declaration, {pathname: "//socket/types/"})).toBe("socket/types")
    expect(playgroundRouteUrl("comparison/blender")).toBe("/comparison/blender")
    expect(playgroundRouteUrl("comparison/blender", {basePath: "/"})).toBe("/comparison/blender")
  })

  test("normalizes one exact mount while preserving package-owned story ids", () => {
    for (const basePath of ["ui", "/ui", "/ui/"]) {
      expect(resolvePlaygroundRoute(
        declaration,
        {pathname: "/ui/socket/types"},
        {basePath},
      )).toBe("socket/types")
      expect(playgroundRouteUrl("comparison/blender", {basePath}))
        .toBe("/ui/comparison/blender")
    }
    expect(resolvePlaygroundRoute(
      declaration,
      {pathname: "/nodes/ui/comparison/blender/"},
      {basePath: "/nodes/ui"},
    )).toBe("comparison/blender")
  })

  test("falls back for the mount root, unknown suffixes and every other mount", () => {
    for (const pathname of [
      "/ui",
      "/ui/",
      "/ui/missing",
      "/ui//socket/types",
      "/ui-other/socket/types",
      "/other/socket/types",
      "/socket/types",
    ]) {
      expect(resolvePlaygroundRoute(declaration, {pathname}, {basePath: "/ui"}), pathname)
        .toBe("editor/scene")
    }
  })

  test("rejects malformed route declarations and base paths", () => {
    expect(resolvePlaygroundRoute(declaration, {pathname: "/missing"})).toBe("editor/scene")
    expect(() => definePlaygroundRoutes({routes: ["#/socket/types"] as const, fallback: "#/socket/types"})).toThrow()
    expect(() => definePlaygroundRoutes({routes: ["socket//types"] as const, fallback: "socket//types"})).toThrow()
    expect(() => definePlaygroundRoutes({routes: ["editor/scene", "editor/scene"] as const, fallback: "editor/scene"})).toThrow()
    for (const basePath of ["/ui//catalog", "/ui?mode=all", "/ui#catalog"]) {
      expect(() => playgroundRouteUrl("editor/scene", {basePath}), basePath)
        .toThrow("Playground basePath must be a normalized pathname mount")
      expect(() => resolvePlaygroundRoute(declaration, {pathname: "/ui/editor/scene"}, {basePath}), basePath)
        .toThrow("Playground basePath must be a normalized pathname mount")
    }
  })
})

describe("PlaygroundRouter mounted browser lifecycle", () => {
  test("reads and pushes prefixed URLs without capturing sibling mounts", () => {
    withBrowser("/ui/socket/types", ({pushed, navigate}) => {
      const router = new PlaygroundRouter(declaration, {basePath: "/ui/"})
      const changes: string[] = []
      router.subscribe((route, previous) => changes.push(`${previous}->${route}`))

      expect(router.current).toBe("socket/types")
      router.go("comparison/blender")
      expect(pushed).toEqual(["/ui/comparison/blender"])
      expect(router.current).toBe("comparison/blender")

      router.go("missing" as never)
      expect(pushed).toHaveLength(1)
      expect(router.current).toBe("comparison/blender")

      navigate("/ui/socket/types/")
      expect(router.current).toBe("socket/types")
      navigate("/other/comparison/blender")
      expect(router.current).toBe("editor/scene")
      navigate("/ui-other/socket/types")
      expect(router.current).toBe("editor/scene")

      expect(changes).toEqual([
        "socket/types->comparison/blender",
        "comparison/blender->socket/types",
        "socket/types->editor/scene",
      ])

      router.dispose()
      navigate("/ui/comparison/blender")
      expect(router.current).toBe("editor/scene")
    })
  })
})

type BrowserHarness = Readonly<{
  pushed: string[]
  navigate(pathname: string): void
}>

function withBrowser(pathname: string, run: (harness: BrowserHarness) => void): void {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const historyDescriptor = Object.getOwnPropertyDescriptor(globalThis, "history")
  const listeners = new Set<() => void>()
  const location = {pathname}
  const pushed: string[] = []
  const browserWindow = {
    location,
    addEventListener(type: string, listener: () => void) {
      if (type === "popstate") listeners.add(listener)
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === "popstate") listeners.delete(listener)
    },
  }
  const browserHistory = {
    pushState(_data: unknown, _unused: string, url: string | URL | null) {
      if (url === null) return
      const next = String(url)
      pushed.push(next)
      location.pathname = next
    },
  }

  Object.defineProperty(globalThis, "window", {configurable: true, value: browserWindow})
  Object.defineProperty(globalThis, "history", {configurable: true, value: browserHistory})
  try {
    run({
      pushed,
      navigate(nextPathname) {
        location.pathname = nextPathname
        for (const listener of [...listeners]) listener()
      },
    })
  } finally {
    restoreGlobal("window", windowDescriptor)
    restoreGlobal("history", historyDescriptor)
  }
}

function restoreGlobal(name: "window" | "history", descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) delete (globalThis as unknown as Record<string, unknown>)[name]
  else Object.defineProperty(globalThis, name, descriptor)
}
