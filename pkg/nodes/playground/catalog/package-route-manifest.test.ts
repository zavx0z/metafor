import {describe, expect, test} from "bun:test"
import {NODES_PACKAGE_CATALOG} from "./package-catalog.ts"
import {
  nodesPackageOverviewRoute,
  nodesPackageRouteTree,
  resolveNodesPackageRoute,
} from "./package-route-manifest.ts"

describe("central Nodes package route manifest", () => {
  test("owns canonical package overviews and exact leaf trees", () => {
    expect(NODES_PACKAGE_CATALOG.map(({defaultRoute}) => defaultRoute)).toEqual([
      "/core/",
      "/editor/",
      "/layout/",
      "/layout-worker/",
      "/ui/",
    ])
    for (const entry of NODES_PACKAGE_CATALOG) {
      const tree = nodesPackageRouteTree(entry.id)
      expect(nodesPackageOverviewRoute(entry.id)).toBe(entry.defaultRoute)
      expect(tree.find("")).toMatchObject({kind: "overview", path: ""})
      expect(tree.leaves.length).toBeGreaterThan(0)
    }
    expect(nodesPackageRouteTree("ui").find("parameter")).toMatchObject({kind: "overview"})
    expect(nodesPackageRouteTree("ui").find("parameter/composition")).toMatchObject({kind: "overview"})
    expect(nodesPackageRouteTree("ui").find("parameter/composition/field")).toMatchObject({kind: "leaf"})
    expect(nodesPackageRouteTree("ui").find("socket")).toMatchObject({kind: "overview"})
    expect(nodesPackageRouteTree("ui").find("socket/boolean")).toMatchObject({kind: "overview"})
    expect(nodesPackageRouteTree("ui").find("socket/boolean/input")).toMatchObject({kind: "leaf"})
  })

  test("distinguishes canonical overview, leaf, redirect and unknown suffix", () => {
    expect(resolveNodesPackageRoute("/core/")?.resolution).toMatchObject({
      kind: "match",
      node: {kind: "overview", path: ""},
      redirect: false,
    })
    expect(resolveNodesPackageRoute("/core")?.resolution).toMatchObject({
      kind: "match",
      canonicalPath: "/core/",
      redirect: true,
    })
    expect(resolveNodesPackageRoute("/ui/socket/boolean/input")?.resolution).toMatchObject({
      kind: "match",
      node: {kind: "leaf"},
      redirect: false,
    })
    expect(resolveNodesPackageRoute("/ui/parameter/")?.resolution).toMatchObject({
      kind: "match",
      node: {kind: "overview", path: "parameter"},
      redirect: false,
    })
    expect(resolveNodesPackageRoute("/ui/parameter/connection/")?.resolution).toMatchObject({
      kind: "match",
      node: {kind: "overview", path: "parameter/connection"},
      redirect: false,
    })
    expect(resolveNodesPackageRoute("/ui/parameter/connection/connected")?.resolution).toMatchObject({
      kind: "match",
      node: {kind: "leaf", path: "parameter/connection/connected"},
      redirect: false,
    })
    expect(resolveNodesPackageRoute("/ui/parameter/missing")?.resolution).toEqual({kind: "not-found"})
    expect(resolveNodesPackageRoute("/ui/socket/unknown")?.resolution).toEqual({kind: "not-found"})
    expect(resolveNodesPackageRoute("/unknown")).toBeNull()
  })
})
