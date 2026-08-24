import {describe, expect, test} from "bun:test"
import {NODES_PACKAGE_CATALOG} from "../catalog/package-catalog.ts"
import {
  nodesPackageOverviewRoute,
  nodesPackageRouteTree,
} from "../catalog/package-route-manifest.ts"
import {
  createNodesPlaygroundPages,
  nodesPlaygroundPageFiles,
} from "./page-registry.ts"

describe("central Nodes playground page registry", () => {
  test("mounts catalog and every package as separate named browser entry", async () => {
    const pages = createNodesPlaygroundPages()
    expect(pages.map(({id}) => id)).toEqual([
      "catalog",
      "core",
      "editor",
      "layout",
      "layout-worker",
      "ui",
    ])
    expect(pages.map(({mountPath}) => mountPath)).toEqual([
      "/",
      ...NODES_PACKAGE_CATALOG.map(({routePrefix}) => routePrefix),
    ])
    for (const page of pages) {
      const files = nodesPlaygroundPageFiles(page.id as Parameters<typeof nodesPlaygroundPageFiles>[0])
      expect(await Bun.file(files.entrypoint).exists(), `${page.id} entry`).toBeTrue()
      expect(await Bun.file(files.stylePath).exists(), `${page.id} style`).toBeTrue()
      if (files.body.kind === "html") {
        expect(await Bun.file(files.body.bodyHtmlPath).exists(), `${page.id} body`).toBeTrue()
      }
    }
    for (const entry of NODES_PACKAGE_CATALOG) {
      const tree = nodesPackageRouteTree(entry.id)
      expect(tree.find("")?.kind, entry.id).toBe("overview")
      expect(pageById(pages, entry.id).routeTree, entry.id).toBe(tree)
      expect(nodesPackageOverviewRoute(entry.id), entry.id).toBe(entry.defaultRoute)
    }
  })

  test("keeps DOM/SVG pages canvas-free and both visual pages on one selector", () => {
    for (const id of ["catalog", "core", "layout", "layout-worker"] as const) {
      expect(nodesPlaygroundPageFiles(id).body.kind, id).toBe("html")
    }
    for (const id of ["editor", "ui"] as const) {
      expect(nodesPlaygroundPageFiles(id).body).toEqual({kind: "canvas", canvasId: "nodes-playground-canvas"})
    }
  })

  test("serves only registered overview and leaf nodes inside each package mount", async () => {
    const pages = createNodesPlaygroundPages()
    for (const entry of NODES_PACKAGE_CATALOG) {
      const page = pageById(pages, entry.id)
      const overview = await page.routeResponse(entry.defaultRoute)
      expect(overview?.status, entry.defaultRoute).toBe(200)
      expect(await overview?.text(), entry.defaultRoute).toContain('data-playground-home href="/"')
      const leaf = nodesPackageRouteTree(entry.id).leaves[0]
      expect(leaf, entry.id).toBeDefined()
      const leafResponse = await page.routeResponse(`${entry.routePrefix}/${leaf}`)
      expect(leafResponse?.status, `${entry.id} leaf`).toBe(200)
      const missing = await page.routeResponse(`${entry.routePrefix}/missing`)
      expect(missing?.status, `${entry.id} missing`).toBe(404)
    }
  })
})

function pageById(
  pages: ReturnType<typeof createNodesPlaygroundPages>,
  id: (typeof NODES_PACKAGE_CATALOG)[number]["id"],
) {
  const page = pages.find((candidate) => candidate.id === id)
  if (page === undefined) throw new Error(`Missing Nodes playground page: ${id}`)
  return page
}
