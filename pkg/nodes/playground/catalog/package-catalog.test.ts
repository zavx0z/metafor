import {describe, expect, test} from "bun:test"
import {
  NODES_CATALOG_ROUTE,
  NODES_PACKAGE_CATALOG,
  nodesPackageForPath,
} from "./package-catalog.ts"

describe("central Nodes package catalog", () => {
  test("lists every production package with one unique address and useful description", () => {
    expect(NODES_PACKAGE_CATALOG.map(({id}) => id)).toEqual([
      "core",
      "editor",
      "layout",
      "layout-worker",
      "ui",
    ])
    expect(new Set(NODES_PACKAGE_CATALOG.map(({packageName}) => packageName)).size).toBe(5)
    expect(new Set(NODES_PACKAGE_CATALOG.map(({defaultRoute}) => defaultRoute)).size).toBe(5)
    for (const entry of NODES_PACKAGE_CATALOG) {
      expect(entry.defaultRoute, entry.id).toBe(`${entry.routePrefix}/`)
      expect(entry.summary.length, entry.id).toBeGreaterThan(20)
      expect(entry.playground.length, entry.id).toBeGreaterThan(30)
      expect(Object.isFrozen(entry), entry.id).toBeTrue()
    }
  })

  test("resolves package routes while keeping the main catalog distinct", () => {
    expect(NODES_CATALOG_ROUTE).toBe("/")
    expect(nodesPackageForPath("/")).toBeNull()
    expect(nodesPackageForPath("/editor/")?.id).toBe("editor")
    expect(nodesPackageForPath("/editor/live-node-tree")?.id).toBe("editor")
    expect(nodesPackageForPath("ui/node-editor/scene/default/")?.id).toBe("ui")
    expect(nodesPackageForPath("/unknown")).toBeNull()
  })
})
