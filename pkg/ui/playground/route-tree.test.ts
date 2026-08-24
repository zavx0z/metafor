import {describe, expect, test} from "bun:test"
import {
  definePlaygroundRouteTree,
  playgroundRouteTreeUrl,
  resolvePlaygroundRouteTree,
} from "./route-tree.ts"

const leaves = [
  "button/basic/contained",
  "button/basic/text",
  "input/state/default",
] as const
const tree = definePlaygroundRouteTree({leaves})

describe("typed playground route tree", () => {
  test("derives root and every proper prefix overview from exact leaves", () => {
    expect(tree.leaves).toEqual(leaves)
    expect(tree.overviews).toEqual(["", "button", "button/basic", "input", "input/state"])
    expect(tree.children("").map(({kind, path}) => [kind, path])).toEqual([
      ["overview", "button"],
      ["overview", "input"],
    ])
    expect(tree.children("button").map(({path}) => path)).toEqual(["button/basic"])
    expect(tree.children("button/basic").map(({kind, path}) => [kind, path])).toEqual([
      ["leaf", "button/basic/contained"],
      ["leaf", "button/basic/text"],
    ])
    expect(tree.find("/button/basic/")).toBe(tree.find("button/basic"))
    expect(Object.isFrozen(tree)).toBeTrue()
    expect(Object.isFrozen(tree.nodes)).toBeTrue()
    expect(Object.isFrozen(tree.children("button/basic"))).toBeTrue()
  })

  test("supports an overview-only package and rejects ambiguous leaves", () => {
    const overviewOnly = definePlaygroundRouteTree({leaves: [] as const})
    expect(overviewOnly.nodes).toEqual([{
      kind: "overview",
      path: "",
      segment: "",
      parentPath: null,
      depth: 0,
    }])
    expect(overviewOnly.children("")).toEqual([])
    expect(() => overviewOnly.children("missing")).toThrow("Unknown playground route tree node")

    expect(() => definePlaygroundRouteTree({leaves: ["a", "a"] as const}))
      .toThrow("leaves must be unique")
    expect(() => definePlaygroundRouteTree({leaves: ["a", "a/b"] as const}))
      .toThrow("leaf cannot contain another leaf")
    expect(() => definePlaygroundRouteTree({leaves: ["a/b", "a"] as const}))
      .toThrow("leaf conflicts with overview")
    for (const leaf of ["", "/a", "a/", "a//b", "a?b", "a#b"]) {
      expect(() => definePlaygroundRouteTree({leaves: [leaf]}), leaf)
        .toThrow("must be a normalized pathname id")
    }
  })

  test("uses trailing slash only for package and prefix overviews", () => {
    expect(playgroundRouteTreeUrl(tree, "", {basePath: "/ui"})).toBe("/ui/")
    expect(playgroundRouteTreeUrl(tree, "button", {basePath: "/ui"})).toBe("/ui/button/")
    expect(playgroundRouteTreeUrl(tree, "button/basic", {basePath: "/ui/"})).toBe("/ui/button/basic/")
    expect(playgroundRouteTreeUrl(tree, "button/basic/contained", {basePath: "ui"}))
      .toBe("/ui/button/basic/contained")
    expect(playgroundRouteTreeUrl(tree, "", {basePath: "/"})).toBe("/")
    expect(() => playgroundRouteTreeUrl(tree, "missing", {basePath: "/ui"}))
      .toThrow("Unknown playground route tree node")
  })

  test("resolves canonical matches and both redirect directions", () => {
    const cases = [
      ["/ui", "overview", "", "/ui/", true],
      ["/ui/", "overview", "", "/ui/", false],
      ["/ui/button", "overview", "button", "/ui/button/", true],
      ["/ui/button/", "overview", "button", "/ui/button/", false],
      ["/ui/button/basic/contained", "leaf", "button/basic/contained", "/ui/button/basic/contained", false],
      ["/ui/button/basic/contained/", "leaf", "button/basic/contained", "/ui/button/basic/contained", true],
    ] as const
    for (const [pathname, kind, path, canonicalPath, redirect] of cases) {
      const resolved = resolvePlaygroundRouteTree(tree, {pathname}, {basePath: "/ui"})
      expect(resolved.kind, pathname).toBe("match")
      if (resolved.kind !== "match") throw new Error(`Expected route match: ${pathname}`)
      expect(resolved.node.kind, pathname).toBe(kind)
      expect(resolved.node.path, pathname).toBe(path)
      expect(resolved.canonicalPath, pathname).toBe(canonicalPath)
      expect(resolved.redirect, pathname).toBe(redirect)
    }
  })

  test("fails closed for unknown suffixes, malformed paths and other mounts", () => {
    for (const pathname of [
      "/ui/missing",
      "/ui/button/missing",
      "/ui/button/basic/contained/extra",
      "/ui//button/basic/contained",
      "/ui-other/button/basic/contained",
      "/other/button/basic/contained",
      "/button/basic/contained",
    ]) {
      expect(resolvePlaygroundRouteTree(tree, {pathname}, {basePath: "/ui"}), pathname)
        .toEqual({kind: "not-found"})
    }
  })
})
