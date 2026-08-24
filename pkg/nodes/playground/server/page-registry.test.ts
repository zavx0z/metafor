import {describe, expect, test} from "bun:test"
import {NODES_PACKAGE_CATALOG} from "../catalog/package-catalog.ts"
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
  })

  test("keeps DOM/SVG pages canvas-free and both visual pages on one selector", () => {
    for (const id of ["catalog", "core", "layout", "layout-worker"] as const) {
      expect(nodesPlaygroundPageFiles(id).body.kind, id).toBe("html")
    }
    for (const id of ["editor", "ui"] as const) {
      expect(nodesPlaygroundPageFiles(id).body).toEqual({kind: "canvas", canvasId: "nodes-playground-canvas"})
    }
  })
})
