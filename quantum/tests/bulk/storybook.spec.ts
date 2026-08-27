import {describe, expect, test} from "bun:test"
import {readFile} from "node:fs/promises"
import {join} from "node:path"
import {createDocument} from "@zavx0z/dom"
import {createQuantumStorybookApp} from "../../storybook/app.ts"
import {BULK_STORY_ROUTE_TREE} from "../../storybook/bulk/stories.ts"
import {createBulkHudStory} from "../../storybook/bulk/story.ts"
import {QUANTUM_STORY_ROUTE_TREE} from "../../storybook/routes.ts"

describe("Quantum DOM Storybook boundary", () => {
  test("registers one Bulk detail beside the exact Graph delivery routes", () => {
    expect(BULK_STORY_ROUTE_TREE.leaves).toEqual(["hud/default"])
    expect(BULK_STORY_ROUTE_TREE.overviews).toEqual(["", "hud"])
    expect(QUANTUM_STORY_ROUTE_TREE.leaves).toEqual([
      "graph/document/current/complete",
      "graph/reaction/dependencies/complete",
      "graph/validation/contract/closed",
      "graph/node-tree/projection/live",
      "graph/identity/same-meta/reorder",
      "bulk/hud/default",
    ])

    const app = createQuantumStorybookApp()
    expect(app.basePath).toBe("")
    expect(app.home.path).toBe("/graph/")
    expect(app.pages).toHaveLength(1)
    expect(app.pages[0]).toMatchObject({
      id: "graph",
      mountPath: "/",
      capability: "webgpu-diagnostic",
      touch: true,
      readiness: {dataset: "quantumStorybook", value: "ready"},
    })
    expect(app.pages[0]!.entrypoint.endsWith("/storybook/bootstrap.ts")).toBeTrue()
  })

  test("dispatches only canonical Bulk paths to the DOM entry", async () => {
    const bootstrap = await readFile(join(import.meta.dir, "../../storybook/bootstrap.ts"), "utf8")

    expect(bootstrap).toContain("BULK_STORY_ROUTE_TREE.nodes.map")
    expect(bootstrap).toContain("storybookRouteTreeUrl(BULK_STORY_ROUTE_TREE")
    expect(bootstrap).toContain("bulkPathnames.includes(window.location.pathname)")
    expect(bootstrap).toContain('await import("./bulk/entry.ts")')
    expect(bootstrap).toContain('await import("./graph/entry.ts")')
    expect(bootstrap).toContain("window.location.replace(graphPathname)")
    expect(bootstrap).not.toContain("startsWith")
  })

  test("composes one semantic Document, shared Workbench and renderer-browser host", async () => {
    const entry = await readFile(join(import.meta.dir, "../../storybook/bulk/entry.ts"), "utf8")
    const graph = await readFile(join(import.meta.dir, "../../storybook/graph/entry.ts"), "utf8")
    const story = createBulkHudStory(createDocument())

    expect(story.element).toBe(story.controller.element)
    expect(story.source.typescript).toContain("createBulkHudDocument")
    expect(entry).toContain('from "@zavx0z/dom"')
    expect(entry).toContain('from "@zavx0z/renderer-browser"')
    expect(entry).toContain('from "@zavx0z/storybook/workbench"')
    expect(entry).toContain("const semanticDocument = createDocument()")
    expect(entry).toContain("createStorybookDomWorkbench({")
    expect(entry).toContain("createDocumentCanvasRuntime({")
    expect(entry).toContain('dataset.quantumStorybookPipeline = "dom-webgpu"')
    expect(entry).toContain('dataset.quantumStorybook = "ready"')
    expect(graph).toContain('from "@zavx0z/dom"')
    expect(graph).toContain('from "@zavx0z/renderer-browser"')
    expect(graph).toContain('from "@zavx0z/storybook/workbench"')
    expect(graph).toContain('from "@ui/components/code-editor"')
    for (const forbidden of [
      "UiRuntime",
      "@layout/core",
      "@ui/elements",
      "StorybookBackdropSurface",
      "GraphLabState",
    ]) expect(entry).not.toContain(forbidden)
    for (const forbidden of [
      "UiRuntime",
      "@layout/core",
      "@ui/elements",
      "StorybookBackdropSurface",
      "GraphLabState",
      "NodeEditor",
    ]) expect(graph).not.toContain(forbidden)

    story.dispose()
  })

  test("declares exact private dev dependencies without exporting product APIs", async () => {
    const manifest = JSON.parse(
      await readFile(join(import.meta.dir, "../../storybook/package.json"), "utf8"),
    ) as {
      private?: boolean
      dependencies?: Record<string, string>
      exports?: Record<string, string>
    }

    expect(manifest.private).toBeTrue()
    expect(manifest.dependencies).toMatchObject({
      "@ui/components": "link:@ui/components",
      "@zavx0z/dom": "link:@zavx0z/dom",
      "@zavx0z/renderer": "link:@zavx0z/renderer",
      "@zavx0z/renderer-browser": "link:@zavx0z/renderer-browser",
      "@zavx0z/renderer-webgpu": "link:@zavx0z/renderer-webgpu",
      "@zavx0z/storybook": "link:@zavx0z/storybook",
    })
    expect(manifest.exports).toBeUndefined()
  })
})
